// Server-side stats + upcoming-jobs endpoint for the partner dashboard.
// Necessary because events.Name is PII (anon SELECT revoked on prod), so
// the client can't query it directly — the previous approach used the
// anon supabase client and the Upcoming Jobs list silently returned []
// while the stats-only query (which doesn't touch PII columns) worked.
//
// This route uses the admin client, JWT-scopes to the partner's company
// (or their user id if no company), and returns both stats and upcoming
// in one shot so the dashboard stays a single request.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { checkRateLimit } from '@/lib/utils';
import * as Sentry from '@sentry/nextjs';

// Optional query params:
//   range=this_month | last_month | this_year | last_year
//   from=YYYY-MM-DD & to=YYYY-MM-DD  (custom — overrides `range`)
// Defaults to this_month.

function isYmd(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function computeRange(rangeKey: string | null, from: string | null, to: string | null): {
  currStart: string; currEnd: string; prevStart: string; prevEnd: string;
} {
  if (isYmd(from) && isYmd(to)) {
    // Custom range — for prev, offset by the same length (best-effort delta).
    const fromD = new Date(from + 'T00:00:00Z');
    const toD   = new Date(to   + 'T00:00:00Z');
    const spanMs = toD.getTime() - fromD.getTime();
    const prevTo   = new Date(fromD.getTime() - 24 * 60 * 60 * 1000);
    const prevFrom = new Date(prevTo.getTime() - spanMs);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return { currStart: from, currEnd: to, prevStart: iso(prevFrom), prevEnd: iso(prevTo) };
  }

  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  switch (rangeKey) {
    case 'last_month': {
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end   = new Date(Date.UTC(y, m, 0));
      const pStart = new Date(Date.UTC(y, m - 2, 1));
      const pEnd   = new Date(Date.UTC(y, m - 1, 0));
      return { currStart: iso(start), currEnd: iso(end), prevStart: iso(pStart), prevEnd: iso(pEnd) };
    }
    case 'this_year': {
      const start = new Date(Date.UTC(y, 0, 1));
      const end   = new Date(Date.UTC(y, 11, 31));
      const pStart = new Date(Date.UTC(y - 1, 0, 1));
      const pEnd   = new Date(Date.UTC(y - 1, 11, 31));
      return { currStart: iso(start), currEnd: iso(end), prevStart: iso(pStart), prevEnd: iso(pEnd) };
    }
    case 'last_year': {
      const start = new Date(Date.UTC(y - 1, 0, 1));
      const end   = new Date(Date.UTC(y - 1, 11, 31));
      const pStart = new Date(Date.UTC(y - 2, 0, 1));
      const pEnd   = new Date(Date.UTC(y - 2, 11, 31));
      return { currStart: iso(start), currEnd: iso(end), prevStart: iso(pStart), prevEnd: iso(pEnd) };
    }
    // this_month (default)
    default: {
      const start = new Date(Date.UTC(y, m, 1));
      const end   = new Date(Date.UTC(y, m + 1, 0));
      const pStart = new Date(Date.UTC(y, m - 1, 1));
      const pEnd   = new Date(Date.UTC(y, m, 0));
      return { currStart: iso(start), currEnd: iso(end), prevStart: iso(pStart), prevEnd: iso(pEnd) };
    }
  }
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('dc_partner_session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!process.env.JWT_SECRET) {
      console.error('[dashboard/overview] CRITICAL: JWT_SECRET missing');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);

    let jwtUser: { id?: string; company_id?: string };
    try {
      const { payload } = await jwtVerify(token, secret);
      jwtUser = payload as { id?: string; company_id?: string };
    } catch {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }

    const partnerUserId = jwtUser.id;
    if (!partnerUserId) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    // Cheap per-partner cap — dashboard already refreshes on realtime events,
    // no need for a human to slam this endpoint. 60/min covers real load.
    if (!(await checkRateLimit(`dashboard-overview:${partnerUserId}`, 60, 60 * 1000))) {
      return NextResponse.json({ error: 'Too many requests. Slow down.' }, { status: 429 });
    }

    const admin = createAdminClient();

    // Refetch company_id from DB (JWT can be stale after admin re-approval).
    const { data: partner } = await admin
      .from('partner_user')
      .select('id, company_id')
      .eq('id', partnerUserId)
      .single();
    if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 });

    const filterCol = partner.company_id ? 'partner_company_id' : 'owned_by_third_party';
    const filterVal = partner.company_id ?? partner.id;

    const url = new URL(req.url);
    const { currStart, currEnd, prevStart, prevEnd } = computeRange(
      url.searchParams.get('range'),
      url.searchParams.get('from'),
      url.searchParams.get('to'),
    );

    const today = new Date().toISOString().slice(0, 10);

    // 3 queries in parallel:
    //   1. lifetime counts + PII-safe fields for totals
    //   2. window-scoped rows for commission + rebate sums
    //   3. upcoming jobs (needs Name — admin client bypasses PII revoke)
    const [countsRes, windowRes, upcomingRes] = await Promise.all([
      admin
        .from('events')
        .select('id, Start_Date')
        .eq(filterCol, filterVal),
      admin
        .from('events')
        .select('id, Start_Date, commission_percentage, rebate_amount')
        .eq(filterCol, filterVal)
        .gte('Start_Date', prevStart)
        .lte('Start_Date', currEnd),
      admin
        .from('events')
        .select('id, Start_Date, Start_Time, Start_Time_Display, End_Time_Display, Service_Type, service_subtype, Name, Title, status, Assign_Cleaner')
        .eq(filterCol, filterVal)
        .gte('Start_Date', today)
        .not('lifecycle_state', 'in', '("deleted","cancelled")')
        .order('Start_Date', { ascending: true })
        .order('Start_Time', { ascending: true })
        .limit(5),
    ]);

    if (countsRes.error || windowRes.error || upcomingRes.error) {
      Sentry.captureMessage('dashboard_overview_query_failed', {
        level: 'error',
        tags: { route: 'dashboard/overview' },
        extra: {
          countsErr:   countsRes.error?.message,
          windowErr:   windowRes.error?.message,
          upcomingErr: upcomingRes.error?.message,
        },
      });
      return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
    }

    const jobs = countsRes.data ?? [];
    const todayCount    = jobs.filter(j => j.Start_Date === today).length;
    const incomingCount = jobs.filter(j => (j.Start_Date ?? '') > today).length;
    const totalCount    = jobs.length;

    let commissionCurr = 0, commissionPrev = 0, rebateCurr = 0, rebatePrev = 0;
    for (const j of (windowRes.data ?? [])) {
      const d = j.Start_Date ?? '';
      const c = Number(j.commission_percentage ?? 0);
      const r = Number(j.rebate_amount ?? 0);
      if (d >= currStart && d <= currEnd) { commissionCurr += c; rebateCurr += r; }
      else if (d >= prevStart && d <= prevEnd) { commissionPrev += c; rebatePrev += r; }
    }

    return NextResponse.json({
      stats: {
        todayCount, incomingCount, totalCount,
        commissionCurr, commissionPrev, rebateCurr, rebatePrev,
      },
      upcoming: upcomingRes.data ?? [],
      range: { currStart, currEnd, prevStart, prevEnd },
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'dashboard/overview' } });
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
