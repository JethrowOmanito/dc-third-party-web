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
import { timingSafeEqual } from 'crypto';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

const MAX_BATCH = 500;

export async function POST(req: NextRequest) {
  return run(req);
}

export async function GET(req: NextRequest) {
  return run(req);
}

function safeCompareSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function run(req: NextRequest) {
  try {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
      Sentry.captureMessage('cron_secret_missing', {
        level: 'fatal',
        tags: { route: 'cron/expire-holds' },
      });
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    // Header-only. Previously accepted the secret in a query string
    // (`?secret=...`) which lands verbatim in nginx access logs, defeats
    // the point of a secret, and shows up in browser history if anyone
    // ever pastes the URL. Crontab always uses the Authorization header.
    const bearer = req.headers.get('authorization') ?? '';
    const provided = bearer.replace(/^Bearer\s+/i, '').trim();
    if (!provided || !safeCompareSecret(provided, expected)) {
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
      Sentry.captureException(selErr, { tags: { route: 'cron/expire-holds', op: 'select' } });
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
      Sentry.captureException(updErr, {
        tags: { route: 'cron/expire-holds', op: 'update' },
        extra: { batchSize: ids.length },
      });
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
    Sentry.captureException(err, { tags: { route: 'cron/expire-holds' } });
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
