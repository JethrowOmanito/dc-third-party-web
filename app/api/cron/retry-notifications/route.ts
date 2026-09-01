// Drains booking_notifications_outbox — retries confirmation email +
// WhatsApp sends that failed inline in the Stripe webhook. Runs as a
// VPS cron via `curl -H "Authorization: Bearer $CRON_SECRET" ...`.
//
// Recommended schedule: every 5 minutes.
//   */5 * * * * curl -sS -H "Authorization: Bearer $(cat /root/backups/tpw-cron-secret.txt)" https://www.securedoctorclean.com/api/cron/retry-notifications >> /var/log/dc-cron-retry-notifications.log 2>&1
//
// Requires migration 20260831040000_booking_notifications_outbox.sql.
// Degrades to a no-op (with Sentry warning) if the table doesn't exist.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { timingSafeEqual } from 'crypto';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

// Cap so one worker doesn't hold the loop open forever if a bug fills the outbox.
const MAX_BATCH = 25;
// Cap retries so a permanently-broken notification (bad phone number,
// deleted event, etc.) doesn't keep waking us up.
const MAX_ATTEMPTS = 8;
// 4s per-fetch bound so a slow edge fn can't stall the whole cron pass.
const FETCH_TIMEOUT_MS = 4000;

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function safeCompareSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Exponential backoff: 1m, 5m, 15m, 1h, 6h, 12h, 24h, 24h capped.
function nextRetryAtIso(attempts: number): string {
  const backoffMinutes = [1, 5, 15, 60, 6 * 60, 12 * 60, 24 * 60, 24 * 60];
  const idx = Math.min(attempts, backoffMinutes.length - 1);
  return new Date(Date.now() + backoffMinutes[idx] * 60_000).toISOString();
}

export async function POST(req: NextRequest) {
  return run(req);
}
export async function GET(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  try {
    // Auth check first so scanners / unauth probes can't trigger fatal Sentry alerts.
    const bearer = req.headers.get('authorization') ?? '';
    const provided = bearer.replace(/^Bearer\s+/i, '').trim();
    if (!provided) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const expected = process.env.CRON_SECRET;
    if (!expected) {
      Sentry.captureMessage('cron_secret_missing', {
        level: 'fatal',
        tags: { route: 'cron/retry-notifications' },
      });
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    if (!safeCompareSecret(provided, expected)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRole) {
      Sentry.captureMessage('retry_notifications_env_missing', {
        level: 'fatal',
        tags: { route: 'cron/retry-notifications' },
      });
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    const { data: pending, error: selErr } = await admin
      .from('booking_notifications_outbox')
      .select('id, event_id, notification_type, payload, attempts')
      .eq('status', 'pending')
      .lte('next_retry_at', nowIso)
      .lt('attempts', MAX_ATTEMPTS)
      .order('created_at', { ascending: true })
      .limit(MAX_BATCH);

    if (selErr) {
      if ((selErr as any).code === '42P01') {
        // Table missing → migration not yet applied. No-op but warn once.
        Sentry.captureMessage('outbox_table_missing', {
          level: 'warning',
          tags: { route: 'cron/retry-notifications' },
        });
        return NextResponse.json({ ok: true, retried: 0, skipped_reason: 'outbox_table_missing' });
      }
      Sentry.captureException(selErr, {
        tags: { route: 'cron/retry-notifications', op: 'select' },
      });
      return NextResponse.json({ error: 'select_failed' }, { status: 500 });
    }

    if (!pending || pending.length === 0) {
      return NextResponse.json({ ok: true, retried: 0 });
    }

    let sent = 0;
    let failed = 0;

    for (const row of pending) {
      const attemptCount = (row.attempts ?? 0) + 1;
      const eventId = row.event_id as string;
      let ok = false;
      let errText: string | null = null;

      try {
        if (row.notification_type === 'confirmation_email') {
          const r = await fetchWithTimeout(
            `${supabaseUrl}/functions/v1/send-job-created-email`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${serviceRole}`,
              },
              body: JSON.stringify({ event_id: eventId }),
            }
          );
          ok = r.ok;
          if (!ok) errText = `email ${r.status}: ${(await r.text().catch(() => '')).slice(0, 300)}`;
        } else if (row.notification_type === 'confirmation_whatsapp') {
          // WhatsApp retry requires re-fetching the event to build the
          // template params — the payload doesn't carry the full row.
          const { data: pb } = await admin
            .from('events')
            .select('"Name","Whatsapp_Number","Title","Start_Date","Start_Time_Display","End_Time_Display","Service_Type","service_subtype","final_price","Ref_ID"')
            .eq('id', eventId)
            .maybeSingle();
          if (!pb || !pb.Whatsapp_Number) {
            // No phone captured — nothing to retry. Mark failed permanently.
            ok = false;
            errText = 'no whatsapp number';
          } else {
            const to = String(pb.Whatsapp_Number).replace(/\D/g, '');
            const service = String(pb.Service_Type ?? '').toLowerCase();
            const isHousekeeping = service.includes('housekeeping');
            const serviceDisplay = pb.Service_Type === 'Float'
              ? (pb.service_subtype ? `Deep Cleaning (${pb.service_subtype})` : 'Deep Cleaning')
              : (pb.Service_Type ?? 'Cleaning');
            const startDisplay = pb.Start_Time_Display ?? '';
            const endDisplay = pb.End_Time_Display ?? '';
            const timeParam = (startDisplay && endDisplay)
              ? `${startDisplay} - ${endDisplay}`
              : (startDisplay || endDisplay || 'TBD');
            void isHousekeeping;
            const totalSgd = pb.final_price != null ? Number(pb.final_price).toFixed(2) : '0.00';
            const bookingRef = pb.Ref_ID != null ? `DC-${String(pb.Ref_ID).toUpperCase()}` : 'DC-BOOKING';
            const params = [
              pb.Name ?? 'Customer',
              bookingRef,
              pb.Title ?? '',
              pb.Start_Date ?? '',
              timeParam,
              serviceDisplay,
              totalSgd,
            ];
            const r = await fetchWithTimeout(
              `${supabaseUrl}/functions/v1/send-whatsapp-notification`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${serviceRole}`,
                },
                body: JSON.stringify({
                  to,
                  type: 'template',
                  templateName: 'booking_confirmation',
                  templateLanguage: 'en_US',
                  templateParams: [
                    {
                      type: 'body',
                      parameters: params.map((text) => ({ type: 'text', text: String(text) })),
                    },
                  ],
                }),
              }
            );
            ok = r.ok;
            if (!ok) errText = `whatsapp ${r.status}: ${(await r.text().catch(() => '')).slice(0, 300)}`;
          }
        } else {
          errText = `unknown notification_type: ${row.notification_type}`;
        }
      } catch (err) {
        errText = err instanceof Error ? err.message : String(err);
      }

      if (ok) {
        sent++;
        await admin
          .from('booking_notifications_outbox')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            attempts: attemptCount,
            last_attempt_at: new Date().toISOString(),
          })
          .eq('id', row.id);
      } else {
        failed++;
        const permanent = attemptCount >= MAX_ATTEMPTS;
        await admin
          .from('booking_notifications_outbox')
          .update({
            status: permanent ? 'failed' : 'pending',
            attempts: attemptCount,
            last_attempt_at: new Date().toISOString(),
            last_error: (errText ?? 'unknown').slice(0, 500),
            next_retry_at: permanent ? new Date().toISOString() : nextRetryAtIso(attemptCount),
          })
          .eq('id', row.id);
        if (permanent) {
          Sentry.captureMessage('notification_permanently_failed', {
            level: 'error',
            tags: {
              route: 'cron/retry-notifications',
              type: row.notification_type as string,
            },
            extra: { eventId, attempts: attemptCount, lastError: errText },
          });
        }
      }
    }

    return NextResponse.json({ ok: true, retried: pending.length, sent, failed });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'cron/retry-notifications' } });
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
