import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import * as Sentry from '@sentry/nextjs';

// Module-level singleton — avoids re-instantiating Stripe on every webhook call.
const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: (process.env.STRIPE_API_VERSION || '2026-03-25.dahlia') as any,
});

// Outbound-fetch guard. Stripe's own webhook timeout is generous (30s), but a
// slow Supabase edge fn or Meta API call must not stall the whole handler.
// Any downstream request is bounded, and a timeout is treated the same as a
// failure so we still Sentry-report it instead of silently succeeding.
const OUTBOUND_TIMEOUT_MS = 4000;

async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs: number = OUTBOUND_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Mark booking refunded (full) or log partial refund. Idempotent under Stripe replay.
async function markBookingRefunded(
  supabase: ReturnType<typeof createAdminClient>,
  bookingId: string,
  amountRefundedCents: number,
  isFullRefund: boolean
) {
  const db = supabase as any;
  const sgd = (amountRefundedCents / 100).toFixed(2);

  if (isFullRefund) {
    const { data: updatedRows, error } = await db
      .from('events')
      .update({ status: 'refunded', payment_status: 'refunded' })
      .eq('id', bookingId)
      .neq('status', 'refunded')
      .select('id');
    if (error) {
      Sentry.captureException(error, {
        tags: { fn: 'markBookingRefunded' },
        extra: { bookingId },
      });
      return;
    }
    if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
      // Already refunded — skip duplicate log.
      return;
    }
  }

  const logMsg = isFullRefund
    ? `Refunded S$${sgd} via Stripe (full refund)`
    : `Partial refund of S$${sgd} via Stripe — booking status unchanged`;
  const { error: logErr } = await db
    .from('event_logs')
    .insert({ event_id: bookingId, message: logMsg });
  if (logErr) {
    Sentry.captureException(logErr, {
      tags: { fn: 'markBookingRefunded', op: 'event_logs.insert' },
      extra: { bookingId },
    });
  }
}

// Record each Stripe refund exactly once (dedup by refund_id PK).
// Recomputes events.refund_amount_cents from source of truth.
async function recordNewRefunds(
  supabase: ReturnType<typeof createAdminClient>,
  eventId: string,
  chargeId: string
): Promise<number> {
  const db = supabase as any;
  let refundList: Stripe.ApiList<Stripe.Refund>;
  try {
    refundList = await stripeClient.refunds.list({ charge: chargeId, limit: 100 });
  } catch (e) {
    Sentry.captureException(e, {
      tags: { fn: 'recordNewRefunds', op: 'refunds.list' },
      extra: { chargeId, eventId },
    });
    return 0;
  }

  let newlyAddedCents = 0;
  for (const rf of refundList.data) {
    if (rf.status !== 'succeeded') continue;
    const { data: inserted, error: insErr } = await db
      .from('stripe_refund_events')
      .insert({ refund_id: rf.id, event_id: eventId, amount_cents: rf.amount })
      .select('refund_id');
    if (insErr) {
      // 23505 = unique_violation — refund already recorded, expected on replay.
      if ((insErr as any).code !== '23505') {
        Sentry.captureException(insErr, {
          tags: { fn: 'recordNewRefunds', op: 'stripe_refund_events.insert' },
          extra: { refundId: rf.id, eventId },
        });
      }
      continue;
    }
    if (Array.isArray(inserted) && inserted.length > 0) {
      newlyAddedCents += rf.amount;
    }
  }

  if (newlyAddedCents > 0) {
    // Atomic recompute via RPC — the SUM happens inside the UPDATE so
    // two concurrent charge.refunded handlers can't produce a stale
    // total. Requires migration 20260831030000_stripe_events_dedup.sql.
    const { error: rpcErr } = await db.rpc('recompute_refund_amount_cents', {
      p_event_id: eventId,
    });

    if (rpcErr) {
      // Graceful degrade: if the RPC doesn't exist yet, fall back to the
      // legacy read-then-write (racy but non-fatal). Sentry-report so we
      // can chase why the migration didn't apply.
      const isMissingFn =
        (rpcErr as any).code === '42883' ||
        /function .* does not exist/i.test((rpcErr as any).message ?? '');
      if (!isMissingFn) {
        Sentry.captureException(rpcErr, {
          tags: { fn: 'recordNewRefunds', op: 'rpc.recompute_refund_amount_cents' },
          extra: { eventId },
        });
        return newlyAddedCents;
      }
      Sentry.captureMessage('recompute_refund_amount_cents_missing', {
        level: 'warning',
        tags: { fn: 'recordNewRefunds' },
      });
      const { data: allRefunds } = await db
        .from('stripe_refund_events')
        .select('amount_cents')
        .eq('event_id', eventId);
      const totalCents = (allRefunds ?? []).reduce(
        (s: number, r: any) => s + (r.amount_cents ?? 0),
        0
      );
      const { error: totalErr } = await db
        .from('events')
        .update({ refund_amount_cents: totalCents })
        .eq('id', eventId);
      if (totalErr) {
        Sentry.captureException(totalErr, {
          tags: { fn: 'recordNewRefunds', op: 'events.update-refund_amount_cents' },
          extra: { eventId },
        });
      }
    }
  }

  return newlyAddedCents;
}

// Helper: Mark booking as paid and log it
async function markBookingPaid(supabase: ReturnType<typeof createAdminClient>, bookingId: string, paymentIntentId: string, paymentMethod: string) {
  // Idempotency: Check if already processed
  const { data: existing } = await supabase
    .from('events')
    .select('webhook_processed')
    .eq('id', bookingId)
    .single();

  if (existing?.webhook_processed) {
    // Idempotency short-circuit; no need to log — this is the happy path
    // for Stripe replays and would spam pm2 logs on every retry.
    return { alreadyProcessed: true };
  }

  // Update the existing pending booking to active (do NOT overwrite Note)
  const updatePayload: any = {
    lifecycle_state: 'active',
    status: 'confirmed',
    payment_status: 'paid',
    payment_date: new Date().toISOString(),
    webhook_processed: true,
  };

  // CLEAN UP THE NOTE FIELD: Aggressively remove any "Paid via Stripe" text
  const { data: currentBooking } = await supabase.from('events').select('"Note"').eq('id', bookingId).single();
  if (currentBooking && currentBooking.Note) {
     const cleanedNote = currentBooking.Note.replace(/.*Paid via Stripe.*/gi, '').trim();
     updatePayload.Note = cleanedNote;
  }

  const { error: updateError } = await supabase.from('events')
    .update(updatePayload)
    .eq('id', bookingId);

  if (updateError) {
    Sentry.captureException(updateError, {
      tags: { fn: 'markBookingPaid', op: 'events.update-paid' },
      extra: { bookingId, paymentIntentId },
    });
    return { error: updateError };
  }

  // Write to event_logs instead of the Note field
  await supabase.from('event_logs').insert({
    event_id: bookingId,
    message: `Status: Paid via Stripe (${paymentMethod})`,
  });

  // Trigger email confirmation after successful DB update.
  // Silent failure here is the exact "customer charged, no email" incident
  // pattern — always Sentry-report so ops can chase it.
  const supabaseUrlForEmail = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrlForEmail) {
    Sentry.captureMessage('booking_confirmation_email_no_supabase_url', {
      level: 'error',
      tags: { fn: 'markBookingPaid' },
      extra: { bookingId },
    });
    return { success: true };
  }

  // At-most-once claim: only the FIRST caller to flip
  // confirmation_email_sent_at from NULL wins and fires the send. Concurrent
  // webhook replays (payment_intent.succeeded + charge.succeeded) short-
  // circuit here. Requires migration
  // 20260831020000_booking_notification_timestamps.sql; if the column is
  // missing, fall through to the legacy always-send behavior + Sentry warn.
  let mayFireEmail = true;
  const emailClaim = await supabase
    .from('events')
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .eq('id', bookingId)
    .is('confirmation_email_sent_at', null)
    .select('id');
  if (emailClaim.error) {
    if ((emailClaim.error as any).code === '42703') {
      Sentry.captureMessage('confirmation_email_sent_at_column_missing', {
        level: 'warning',
        tags: { fn: 'markBookingPaid' },
      });
      // Legacy path — proceed with the send.
    } else {
      Sentry.captureException(emailClaim.error, {
        tags: { fn: 'markBookingPaid', op: 'email-claim' },
        extra: { bookingId },
      });
      mayFireEmail = false;
    }
  } else if (Array.isArray(emailClaim.data) && emailClaim.data.length === 0) {
    // Someone else already claimed — that request is (or was) firing the email.
    mayFireEmail = false;
  }

  // Write to the durable outbox in parallel so the retry cron can chase a
  // failed send later. Requires migration
  // 20260831040000_booking_notifications_outbox.sql; degrade silently if
  // the table is missing.
  try {
    await supabase
      .from('booking_notifications_outbox')
      .insert({
        event_id: bookingId,
        notification_type: 'confirmation_email',
        payload: { event_id: bookingId },
      });
  } catch { /* ON CONFLICT via UNIQUE(event_id, notification_type) — legit dedup */ }

  if (mayFireEmail) {
    try {
      const emailRes = await fetchWithTimeout(
        `${supabaseUrlForEmail}/functions/v1/send-job-created-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ event_id: bookingId }),
        }
      );

      if (emailRes.ok) {
        // Best-effort: mark the outbox row as sent so the cron skips it.
        // Swallow all errors — the send already succeeded; a failed outbox
        // update just means the cron might retry, and the send-side
        // dedup on confirmation_email_sent_at will short-circuit anyway.
        try {
          await supabase
            .from('booking_notifications_outbox')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('event_id', bookingId)
            .eq('notification_type', 'confirmation_email');
        } catch { /* best-effort */ }
      } else {
        const errorText = await emailRes.text().catch(() => '<no body>');
        Sentry.captureMessage('booking_confirmation_email_failed', {
          level: 'error',
          tags: { fn: 'markBookingPaid', op: 'send-job-created-email' },
          extra: { bookingId, status: emailRes.status, body: errorText.slice(0, 500) },
        });
        // Outbox row stays pending → cron retries.
      }
    } catch (emailError) {
      Sentry.captureException(emailError, {
        tags: { fn: 'markBookingPaid', op: 'send-job-created-email' },
        extra: { bookingId },
      });
      // Outbox row stays pending → cron retries.
    }
  }

  // Fire WhatsApp booking confirmation. Fetches the fresh booking row so we have
  // all the fields the template needs. Fire-and-forget — webhook must respond fast.
  try {
    const { data: pb } = await (supabase as any)
      .from('events')
      .select('"Name","Whatsapp_Number","Title","Start_Date","Start_Time_Display","End_Time_Display","Service_Type","service_subtype","final_price","Ref_ID"')
      .eq('id', bookingId)
      .maybeSingle();
    if (pb) {
      await sendBookingConfirmationWhatsApp(pb, bookingId, pb.Ref_ID);
    }
  } catch (waErr) {
    Sentry.captureException(waErr, {
      tags: { fn: 'markBookingPaid', op: 'whatsapp-confirmation' },
      extra: { bookingId },
    });
  }

  return { success: true };
}

// ─── WhatsApp booking confirmation ─────────────────────────────────────────
// Ported from booking-web. Sends the `booking_confirmation` template via the
// send-whatsapp-notification edge function, with atomic claim to prevent
// duplicates when Stripe replays webhooks.
async function sendBookingConfirmationWhatsApp(
  pb: any,
  eventId: string,
  refId: number | string | null | undefined
) {
  const rawPhone = pb?.Whatsapp_Number;
  if (!rawPhone) return; // No WhatsApp number captured — skip silently.

  // Normalize to E.164 without leading +. Meta rejects the + prefix.
  const to = String(rawPhone).replace(/\D/g, '');
  if (!to) return;

  const service = String(pb?.Service_Type ?? '').toLowerCase();
  const isHousekeeping = service.includes('housekeeping');

  // Human-readable service name for the template.
  const serviceDisplay = pb?.Service_Type === 'Float'
    ? (pb?.service_subtype ? `Deep Cleaning (${pb.service_subtype})` : 'Deep Cleaning')
    : (pb?.Service_Type ?? 'Cleaning');

  const startDisplay = pb?.Start_Time_Display ?? '';
  const endDisplay = pb?.End_Time_Display ?? '';
  const timeParam = isHousekeeping && startDisplay && endDisplay
    ? `${startDisplay} - ${endDisplay}`
    : (startDisplay && endDisplay ? `${startDisplay} - ${endDisplay}` : (startDisplay || endDisplay || 'TBD'));

  const totalSgd = pb?.final_price != null ? Number(pb.final_price).toFixed(2) : '0.00';
  const bookingRef = refId != null ? `DC-${String(refId).toUpperCase()}` : 'DC-BOOKING';
  const templateName = 'booking_confirmation';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole || !eventId) return;

  // Atomically claim the notification slot BEFORE calling Meta. Only proceed
  // if we're the first request to flip the flag; concurrent webhook replays
  // (payment_intent.succeeded + charge.succeeded) short-circuit here.
  // Also record a durable outbox row for the cron retry loop. Idempotent
  // via UNIQUE(event_id, notification_type). If the table doesn't exist
  // (migration not applied), silently ignore.
  const admin = (await import('@/lib/supabase/admin')).createAdminClient();
  try {
    await admin
      .from('booking_notifications_outbox')
      .insert({
        event_id: eventId,
        notification_type: 'confirmation_whatsapp',
        payload: { event_id: eventId, phone: to, ref: bookingRef },
      });
  } catch { /* best-effort — migration may not be applied yet */ }

  // Atomically flip both whatsapp_notified (legacy boolean) AND
  // whatsapp_notified_at (new timestamp) — the timestamp column is
  // only present after migration 20260831020000_booking_notification_timestamps.sql
  // has been applied. PostgREST silently ignores unknown columns on PATCH,
  // so this is safe pre-migration.
  let claimRes: Response | null = null;
  try {
    claimRes = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/events?id=eq.${eventId}&whatsapp_notified=is.false`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          whatsapp_notified: true,
          whatsapp_notified_at: new Date().toISOString(),
        }),
      }
    );
  } catch (err) {
    Sentry.captureException(err, {
      tags: { fn: 'sendBookingConfirmationWhatsApp', op: 'claim' },
      extra: { eventId },
    });
    return;
  }

  if (!claimRes || !claimRes.ok) {
    Sentry.captureMessage('whatsapp_claim_patch_failed', {
      level: 'error',
      tags: { fn: 'sendBookingConfirmationWhatsApp', op: 'claim' },
      extra: { eventId, status: claimRes?.status ?? null },
    });
    return;
  }
  const claimedRows = await claimRes.json().catch(() => []);
  if (!Array.isArray(claimedRows) || claimedRows.length === 0) {
    // Concurrent replay already sent it — happy path, no log needed.
    return;
  }

  // 7 params for the approved `booking_confirmation` template:
  // customer, booking_id, address, date, time, service, total_sgd
  const params = [
    pb?.Name ?? 'Customer',
    bookingRef,
    pb?.Title ?? '',
    pb?.Start_Date ?? '',
    timeParam,
    serviceDisplay,
    totalSgd,
  ];

  let res: Response;
  try {
    res = await fetchWithTimeout(
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
          templateName,
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
  } catch (err) {
    Sentry.captureException(err, {
      tags: { fn: 'sendBookingConfirmationWhatsApp', op: 'send' },
      extra: { eventId, bookingRef },
    });
    await rollbackWhatsappClaim(supabaseUrl, serviceRole, eventId);
    return;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '<no body>');
    Sentry.captureMessage('whatsapp_confirmation_send_failed', {
      level: 'error',
      tags: { fn: 'sendBookingConfirmationWhatsApp', op: 'send' },
      extra: { eventId, bookingRef, status: res.status, body: body.slice(0, 500) },
    });
    await rollbackWhatsappClaim(supabaseUrl, serviceRole, eventId);
    // Outbox row stays pending → cron retries.
    return;
  }

  // Mark outbox as sent so the cron doesn't retry.
  try {
    await admin
      .from('booking_notifications_outbox')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('event_id', eventId)
      .eq('notification_type', 'confirmation_whatsapp');
  } catch { /* best-effort */ }
}

// Roll back the whatsapp_notified flag so a manual retry (or a later webhook
// replay) can send the confirmation. Failures here are the "customer paid,
// nobody notified" incident pattern — Sentry-report loudly.
async function rollbackWhatsappClaim(
  supabaseUrl: string,
  serviceRole: string,
  eventId: string
) {
  try {
    const r = await fetchWithTimeout(`${supabaseUrl}/rest/v1/events?id=eq.${eventId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ whatsapp_notified: false, whatsapp_notified_at: null }),
    });
    if (!r.ok) {
      Sentry.captureMessage('whatsapp_claim_rollback_failed', {
        level: 'error',
        tags: { fn: 'rollbackWhatsappClaim' },
        extra: { eventId, status: r.status },
      });
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { fn: 'rollbackWhatsappClaim' },
      extra: { eventId },
    });
  }
}

export async function POST(req: Request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: (process.env.STRIPE_API_VERSION || '2026-03-25.dahlia') as any,
  });
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET as string;

  const body = await req.text();
  const signature = (await headers()).get('stripe-signature') as string;

  let event: Stripe.Event;

  if (!webhookSecret) {
    Sentry.captureMessage('stripe_webhook_secret_missing', {
      level: 'fatal',
      tags: { route: 'webhooks/stripe' },
    });
  }

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    Sentry.captureException(err, {
      tags: { route: 'webhooks/stripe', op: 'signature-verify' },
    });
    return NextResponse.json({ error: 'Webhook Error' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // ─── Event-level replay dedup ────────────────────────────────────────
  // Stripe replays events on 5xx or missed 200. Dedup at the event.id
  // level so retries are a no-op instead of re-running side effects.
  // Requires migration 20260831030000_stripe_events_dedup.sql.
  // Graceful degrade: if the table doesn't exist yet, skip the check.
  try {
    const { data: seen, error: seenErr } = await supabase
      .from('stripe_events')
      .insert({ id: event.id, type: event.type })
      .select('id')
      .maybeSingle();
    if (seenErr) {
      if ((seenErr as any).code === '23505') {
        // Already processed — short-circuit to 200.
        return NextResponse.json({ received: true, deduped: true });
      }
      if ((seenErr as any).code === '42P01') {
        // relation "stripe_events" does not exist → migration not applied.
        Sentry.captureMessage('stripe_events_table_missing', {
          level: 'warning',
          tags: { route: 'webhooks/stripe' },
        });
      } else {
        Sentry.captureException(seenErr, {
          tags: { route: 'webhooks/stripe', op: 'stripe_events.insert' },
          extra: { eventId: event.id, eventType: event.type },
        });
        // Don't 500 — falling through to legacy per-booking dedup is safe.
      }
    }
    // seen row inserted → this is a fresh event, continue.
    void seen;
  } catch (dedupErr) {
    Sentry.captureException(dedupErr, {
      tags: { route: 'webhooks/stripe', op: 'stripe_events.dedup' },
    });
    // Fall through — per-booking `webhook_processed` flag is still enforced downstream.
  }

  try {

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const { bookingId } = paymentIntent.metadata;

    if (!bookingId) {
      // Xero invoice payments share the same Stripe account and fan out to
      // this endpoint. They carry Xero-flavored metadata (Invoice number /
      // OrgCode) instead of bookingId — ack silently, they're not ours.
      const md = paymentIntent.metadata || {};
      const isXeroInvoice = Boolean(md['Invoice number'] || md['invoice'] || md['OrgCode']);
      if (!isXeroInvoice) {
        // Truly orphan intent — surface for triage but still 2xx so Stripe
        // stops retrying (nothing about this event is retryable).
        Sentry.captureMessage('webhook_missing_booking_metadata', {
          level: 'warning',
          tags: { route: 'webhooks/stripe', event: 'payment_intent.succeeded' },
          extra: { paymentIntentId: paymentIntent.id, metadata: md },
        });
      }
      return NextResponse.json({ received: true, ignored: 'no_booking_metadata' });
    }

    // Detect payment method more robustly
    let methodLabel = 'Card';
    const charge = paymentIntent.latest_charge as any;
    
    // Priority 1: Check actual charge details
    if (typeof charge === 'object' && charge?.payment_method_details?.type) {
       const pmType = charge.payment_method_details.type;
       methodLabel = pmType === 'paynow' ? 'PayNow' : 
                     pmType === 'grabpay' ? 'GrabPay' : 
                     pmType === 'card' ? 'Card' : pmType.charAt(0).toUpperCase() + pmType.slice(1);
    } 
    // Priority 2: Fallback to payment_method_types
    else if (paymentIntent.payment_method_types?.length) {
       if (paymentIntent.payment_method_types.includes('paynow')) methodLabel = 'PayNow';
       else if (paymentIntent.payment_method_types.includes('grabpay')) methodLabel = 'GrabPay';
    }

    // Stripe already logs every event in its dashboard — duplicating the
    // booking id + method to pm2 stdout is PII leakage with no ops benefit.
    const result = await markBookingPaid(supabase, bookingId, paymentIntent.id, methodLabel);
    if (result?.error) {
      Sentry.captureMessage('webhook_mark_paid_failed', {
        level: 'error',
        tags: { route: 'webhooks/stripe', event: 'payment_intent.succeeded' },
        extra: { bookingId, paymentIntentId: paymentIntent.id, error: String(result.error) },
      });
      await supabase.from('event_logs').insert({
        event_id: bookingId,
        message: `System: Webhook FAILED to mark as paid. Error: ${JSON.stringify(result.error)}`,
      });
    }
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    const intentId = typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : (charge.payment_intent as any)?.id;

    if (intentId) {
      const { data: booking } = await supabase
        .from('events')
        .select('id')
        .eq('stripe_payment_intent_id', intentId)
        .maybeSingle();

      if (booking) {
        const isFullRefund =
          (charge as any).refunded === true ||
          (charge.amount_refunded ?? 0) >= charge.amount;

        // Record each refund exactly once, and update events.refund_amount_cents
        await recordNewRefunds(supabase, booking.id, charge.id);
        await markBookingRefunded(supabase, booking.id, charge.amount_refunded ?? 0, isFullRefund);
      } else {
        Sentry.captureMessage('refund_no_booking_found', {
          level: 'warning',
          tags: { route: 'webhooks/stripe', event: 'charge.refunded' },
          extra: { intentId },
        });
      }
    }
  }

  if (event.type === 'charge.succeeded') {
    const charge = event.data.object as Stripe.Charge;
    const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;

    if (intentId) {
      // Look up the booking by the linked payment intent
      const { data: booking } = await supabase
        .from('events')
        .select('id, webhook_processed')
        .eq('stripe_payment_intent_id', intentId)
        .single();

      if (booking) {
        if (!booking.webhook_processed) {
          const pmType = charge.payment_method_details?.type || 'card';
          const methodLabel = pmType === 'grabpay' ? 'GrabPay' : pmType === 'paynow' ? 'PayNow' : 'Card';
          
          const result = await markBookingPaid(supabase, booking.id, intentId, methodLabel);
          if (result?.error) {
            Sentry.captureMessage('webhook_fallback_mark_paid_failed', {
              level: 'error',
              tags: { route: 'webhooks/stripe', event: 'charge.succeeded' },
              extra: { bookingId: booking.id, intentId, error: String(result.error) },
            });
            await supabase.from('event_logs').insert({
              event_id: booking.id,
              message: `System: Webhook Fallback FAILED. Error: ${JSON.stringify(result.error)}`,
            });
          }
        }
      }
    }
  }

    return NextResponse.json({ received: true });
  } catch (err) {
    // Return 500 so Stripe retries. If we swallowed the error and 200'd,
    // Stripe would consider the event delivered and we'd lose the payment
    // update forever. Sentry sees the exception either way.
    Sentry.captureException(err, {
      tags: { route: 'webhooks/stripe', event: event.type, op: 'handler' },
    });
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 });
  }
}
