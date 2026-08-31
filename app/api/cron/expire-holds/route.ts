// Sweeps unpaid partner bookings that have blown past their
// booking_expires_at hold (set at wizard submit time — currently
// now + 30 minutes). Without this sweep, capacity is silently held
// forever for partner bookings that were started but never paid.
//
// Called from the VPS system crontab via CRON_SECRET, matching the
// same auth pattern used by main-web's /api/cron/auto-schedule.
// Recommended schedule: `*/10 * * * *` (every 10 minutes).

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const MAX_BATCH = 500;

export async function POST(req: NextRequest) {
  return run(req);
}

export async function GET(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  try {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
      console.error('[cron/expire-holds] CRITICAL: CRON_SECRET missing');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    // Accept either header (`Authorization: Bearer <secret>`) or query
    // (`?secret=<secret>`) — crontab tends to be easier with headers.
    const bearer = req.headers.get('authorization') ?? '';
    const provided = bearer.replace(/^Bearer\s+/i, '').trim() ||
                     req.nextUrl.searchParams.get('secret') || '';
    if (provided !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    // Find candidates: partner bookings, still active, unpaid, and
    // past their hold expiry. We only touch rows that were explicitly
    // created with an expiry — never sweep admin-created bookings.
    const { data: stale, error: selErr } = await admin
      .from('events')
      .select('id, Ref_ID, booking_expires_at, owned_by_third_party')
      .not('owned_by_third_party', 'is', null)
      .eq('payment_status', 'unpaid')
      .eq('status', 'pending')
      .eq('lifecycle_state', 'active')
      .not('booking_expires_at', 'is', null)
      .lt('booking_expires_at', nowIso)
      .limit(MAX_BATCH);

    if (selErr) {
      console.error('[cron/expire-holds] select failed:', selErr);
      return NextResponse.json({ error: 'select_failed' }, { status: 500 });
    }
    if (!stale || stale.length === 0) {
      return NextResponse.json({ ok: true, expired: 0 });
    }

    const ids = stale.map(r => r.id);
    const { error: updErr } = await admin
      .from('events')
      .update({
        lifecycle_state: 'cancelled',
        status: 'cancelled',
        cancelled_at: nowIso,
        cancel_reason: 'hold_expired_unpaid',
      })
      .in('id', ids);

    if (updErr) {
      console.error('[cron/expire-holds] update failed:', updErr);
      return NextResponse.json({ error: 'update_failed' }, { status: 500 });
    }

    // Log per row so the admin can see why in event history.
    const logRows = stale.map(r => ({
      event_id: r.id,
      message: `System: cancelled — unpaid hold expired at ${r.booking_expires_at}`,
    }));
    await admin.from('event_logs').insert(logRows);

    return NextResponse.json({
      ok: true,
      expired: ids.length,
      refIds: stale.map(r => r.Ref_ID).filter(Boolean),
    });
  } catch (err) {
    console.error('[cron/expire-holds] unexpected:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
