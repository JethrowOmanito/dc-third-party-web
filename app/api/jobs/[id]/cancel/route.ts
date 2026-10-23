import { NextRequest, NextResponse } from 'next/server';
import { authPartnerForJob } from '@/lib/partner-job-auth';
import { computeFee, feeWithGst, ruleFromTier, verifyFeeToken } from '@/lib/fees';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/utils';
import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE_LOCK_MS = 5 * 60 * 1000;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-03-25.dahlia' as unknown as Stripe.LatestApiVersion,
});

const STATUS_MESSAGES: Record<string, string> = {
  cancelled: 'This booking has already been cancelled.',
  completed: 'This booking has already been completed.',
  deleted: 'This booking is no longer available.',
  rescheduled: 'This booking has been rescheduled. Please contact admin to cancel.',
  cancelling: 'This booking is currently being processed. Please wait a moment and try again.',
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ip =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for') ??
    'unknown';
  if (!(await checkRateLimit(`partner-cancel:${ip}`, 10, 10 * 60_000))) {
    return NextResponse.json({ error: 'Too many cancel attempts' }, { status: 429 });
  }
  if (!(await checkRateLimit(`partner-cancel-booking:${id}`, 3, 24 * 60 * 60_000))) {
    return NextResponse.json({ error: 'Too many attempts on this booking' }, { status: 429 });
  }

  const r = await authPartnerForJob(id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { job, auth } = r;

  const TERMINAL = new Set(['cancelled', 'completed', 'deleted', 'rescheduled', 'cancelling']);
  if (job.lifecycle_state && TERMINAL.has(job.lifecycle_state)) {
    const msg = STATUS_MESSAGES[job.lifecycle_state] ?? 'This booking cannot be cancelled.';
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  // Past-start guard — compare against the actual start timestamp, not
  // just the date. Day-granular checks let a partner cancel a job that
  // started 23 hours ago.
  if (job.Start_Date) {
    const hhmm = (job.Start_Time ?? '00:00').slice(0, 5);
    const startMs = Date.parse(`${job.Start_Date}T${hhmm}:00+08:00`);
    if (Number.isFinite(startMs) && startMs < Date.now()) {
      return NextResponse.json(
        { error: 'This booking has already started. Contact admin on WhatsApp if cancellation is still needed.' },
        { status: 400 },
      );
    }
  }

  // Series bookings — any series_id goes to admin, not just online_4x.
  // Admin-created HK series with other session types were leaking through
  // and getting partially-cancelled (one row cancelled, siblings still fire).
  if (job.series_id) {
    return NextResponse.json(
      { error: 'This is part of a recurring/series booking. Please contact admin to cancel.' },
      { status: 422 },
    );
  }

  const admin = createAdminClient();

  // Stale-lock reaper — if a previous attempt crashed between the
  // optimistic lock and the final update, the row is stuck in
  // 'cancelling' forever. If the stuck state is older than STALE_LOCK_MS
  // we release it back to 'active' before trying our fresh lock.
  const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  await admin
    .from('events')
    .update({ lifecycle_state: 'active' })
    .eq('id', job.id)
    .eq('lifecycle_state', 'cancelling')
    .lt('updated_at', staleCutoff);

  // Optimistic lock
  const { data: locked } = await admin
    .from('events')
    .update({ lifecycle_state: 'cancelling' })
    .eq('id', job.id)
    .not('lifecycle_state', 'in', '("cancelled","completed","deleted","rescheduled","cancelling")')
    .select('id')
    .maybeSingle();
  if (!locked) {
    return NextResponse.json(
      { error: 'This booking is already being processed. Please try again shortly.' },
      { status: 409 },
    );
  }

  // Prefer the HMAC-signed fee token from cancel-info — locks the amount
  // the UI showed so a partner can't be shown $0 at 48:01h and charged
  // $60 at 47:59h after they click confirm. If no valid token, fall back
  // to live computeFee (keeps the API usable from curl / admin tooling).
  const bodyJson: { fee_token?: string } = await req.json().catch(() => ({}));
  const feeToken = bodyJson.fee_token;
  let feeGstIncl: number;
  let feeBase: number;
  let feeTier: number | null;
  if (feeToken) {
    const locked = await verifyFeeToken(feeToken, { event_id: job.id, kind: 'cancel' });
    if (!locked) {
      await admin.from('events').update({ lifecycle_state: job.lifecycle_state }).eq('id', job.id);
      return NextResponse.json(
        { error: 'Fee preview expired. Please reopen the cancel dialog.', errorCode: 'fee_token_expired' },
        { status: 409 },
      );
    }
    feeGstIncl = locked.amount_with_gst;
    feeBase = locked.base_amount;
    feeTier = locked.tier_hit;
  } else {
    let computed;
    try {
      computed = await computeFee(job.id, 'cancel');
    } catch (feeErr) {
      console.error('[partner cancel] computeFee failed', feeErr);
      Sentry.captureException(feeErr, {
        tags: { route: 'partner/cancel', event_id: job.id },
      });
      await admin.from('events').update({ lifecycle_state: job.lifecycle_state }).eq('id', job.id);
      return NextResponse.json({ error: 'Could not calculate cancellation fee.' }, { status: 500 });
    }
    feeGstIncl = feeWithGst(computed.amount).total;
    feeBase = feeWithGst(computed.amount).base;
    feeTier = computed.tier_hit;
  }

  const rule = ruleFromTier(feeTier);
  void feeBase;
  const price =
    job.amount_cents != null
      ? job.amount_cents / 100
      : Number(job.final_price) || Number(job.Price) || 0;
  const isPaid = job.payment_status === 'paid';
  const refundAmount = Math.max(0, price - feeGstIncl);

  // Branch by payment_terms
  if (auth.paymentTerms === 'end_of_month') {
    // End-of-month: fee lands on the invoice; no Stripe. Record on the
    // event + prepend a note so Zoe sees it during monthly reconciliation.
    const todayTag = `[AUTO ${new Date().toISOString().split('T')[0]}] Partner-cancelled online.`;
    const feeNote =
      feeGstIncl > 0
        ? `${todayTag} Cancellation fee S$${feeGstIncl.toFixed(2)} (incl. 9% GST, rule: ${rule}) — add to this partner's EOM invoice.`
        : `${todayTag} No fee (rule: ${rule}).`;
    // Idempotency: if the existing Note already starts with today's
    // partner-cancellation tag, don't prepend again. Handles manual
    // retries + background job replays.
    const alreadyLogged = (job.Note ?? '').trimStart().startsWith(todayTag);
    const mergedNote = alreadyLogged
      ? (job.Note ?? '')
      : [feeNote, job.Note ?? ''].filter(Boolean).join('\n\n');

    const nowIso = new Date().toISOString();
    const { error: updateErr } = await admin
      .from('events')
      .update({
        lifecycle_state: 'cancelled',
        cancelled_by: 'partner (online)',
        cancelled_at: nowIso,
        online_cancelled_by: 'partner',
        cancellation_fee: feeGstIncl > 0 ? feeGstIncl : null,
        fee_type: feeGstIncl > 0 ? `cancel_${rule}` : null,
        fee_applied_at: feeGstIncl > 0 ? nowIso : null,
        Note: mergedNote,
      })
      .eq('id', job.id);

    if (updateErr) {
      console.error('[partner cancel] eom update failed', updateErr);
      await admin
        .from('events')
        .update({ lifecycle_state: job.lifecycle_state })
        .eq('id', job.id);
      return NextResponse.json(
        { error: 'Failed to cancel booking. Please try again.' },
        { status: 500 },
      );
    }

    await admin
      .from('job_transactions')
      .insert({
        event_id: job.id,
        transaction_type: 'partner_cancellation',
        fee_rule: rule,
        fee_amount: feeGstIncl,
        refund_amount: 0,
        original_price: price,
        original_date: job.Start_Date,
        reason: 'Partner self-cancelled online — fee added to EOM invoice',
        created_by: `partner:${auth.partnerUserId}`,
      })
      .then(({ error }) => {
        if (error) console.error('[partner cancel] job_transactions insert failed', error);
      });

    await admin
      .from('event_logs')
      .insert({
        event_id: job.id,
        message:
          feeGstIncl > 0
            ? `[Partner] cancelled online. Fee S$${feeGstIncl.toFixed(2)} (rule: ${rule}) added to EOM invoice.`
            : `[Partner] cancelled online. No fee (rule: ${rule}).`,
        created_by: `partner:${auth.partnerUserId}`,
      })
      .then(({ error }) => {
        if (error) console.error('[partner cancel] event_logs insert failed', error);
      });

    return NextResponse.json({
      cancelled: true,
      fee_amount: feeGstIncl,
      fee_rule: rule,
      billing: 'eom_invoice',
    });
  }

  // Upfront path — mirrors customer flow. For paid bookings, Stripe refund
  // nets out the fee. For unpaid upfront bookings (rare edge case), reject
  // and route to admin.
  if (!isPaid) {
    await admin.from('events').update({ lifecycle_state: job.lifecycle_state }).eq('id', job.id);
    return NextResponse.json(
      {
        error:
          'This upfront-billing booking has not been paid yet. Please contact admin to cancel.',
      },
      { status: 409 },
    );
  }

  // Paid: refund-net. Require stripe_payment_intent_id — otherwise manual.
  if (!job.stripe_payment_intent_id) {
    await admin.from('events').update({ lifecycle_state: job.lifecycle_state }).eq('id', job.id);
    return NextResponse.json(
      {
        error:
          'This booking was not paid via Stripe. Refund must be issued manually — please contact admin.',
      },
      { status: 409 },
    );
  }

  // Write an "intent" audit row BEFORE calling Stripe so a successful
  // refund with a crashed Node process (or failed events.update downstream)
  // still has a durable DB trail. We'll UPDATE this row with the final
  // refund_amount + stripe_refund_id after Stripe returns. If the pre-insert
  // itself fails we still proceed — the Stripe idempotency key means a retry
  // won't double-refund.
  const { data: intentTx } = await admin
    .from('job_transactions')
    .insert({
      event_id: job.id,
      transaction_type: 'partner_cancellation',
      fee_rule: rule,
      fee_amount: feeGstIncl,
      refund_amount: 0,
      original_price: price,
      original_date: job.Start_Date,
      reason: 'Partner self-cancelled online — Stripe refund-net (intent)',
      created_by: `partner:${auth.partnerUserId}`,
    })
    .select('id')
    .single();

  let stripeRefundId: string | null = null;
  if (refundAmount > 0) {
    try {
      const refund = await stripe.refunds.create(
        {
          payment_intent: job.stripe_payment_intent_id,
          amount: Math.round(refundAmount * 100),
          reason: 'requested_by_customer',
          metadata: {
            event_id: job.id,
            ref_id: String(job.Ref_ID),
            fee_rule: rule,
            cancelled_by: 'partner_online',
            partner_user_id: auth.partnerUserId,
          },
        },
        { idempotencyKey: `partner-cancel-${job.id}` },
      );
      stripeRefundId = refund.id;
    } catch (stripeErr) {
      console.error('[partner cancel] Stripe refund failed', stripeErr);
      await admin
        .from('events')
        .update({ lifecycle_state: job.lifecycle_state })
        .eq('id', job.id);
      return NextResponse.json(
        { error: 'Refund processing failed. Please contact admin.' },
        { status: 502 },
      );
    }
  }

  const nowIso = new Date().toISOString();
  const { error: updateErr } = await admin
    .from('events')
    .update({
      lifecycle_state: 'cancelled',
      cancelled_by: 'partner (online)',
      cancelled_at: nowIso,
      online_cancelled_by: 'partner',
      cancellation_fee: feeGstIncl > 0 ? feeGstIncl : null,
      fee_type: feeGstIncl > 0 ? `cancel_${rule}` : null,
      fee_applied_at: feeGstIncl > 0 ? nowIso : null,
      ...(stripeRefundId
        ? {
            stripe_refund_id: stripeRefundId,
            refund_issued_at: nowIso,
            payment_status: 'refunded',
          }
        : {}),
    })
    .eq('id', job.id);

  // Patch the intent row with real numbers regardless of whether the
  // events.update succeeded — the Stripe refund already happened, so the
  // audit MUST reflect it even if the booking row couldn't be flipped.
  if (intentTx?.id) {
    await admin
      .from('job_transactions')
      .update({
        refund_amount: refundAmount,
        stripe_refund_id: stripeRefundId,
        reason: updateErr
          ? 'Partner self-cancelled — refund issued, DB update failed (manual remediation required)'
          : 'Partner self-cancelled online — Stripe refund-net',
      })
      .eq('id', intentTx.id);
  }

  if (updateErr) {
    console.error('[partner cancel] CRITICAL: refund issued but event update failed', {
      stripe_refund_id: stripeRefundId,
      event_id: job.id,
      updateErr,
    });
    await admin.from('event_logs').insert({
      event_id: job.id,
      message: `[Partner] CRITICAL — refund S$${refundAmount.toFixed(2)} issued via Stripe (${stripeRefundId}) but events.update failed. Row stuck in '${(job.lifecycle_state ?? '').toString()}' / 'cancelling'. Manual remediation required.`,
      created_by: `partner:${auth.partnerUserId}`,
    });
    return NextResponse.json({
      cancelled: true,
      refund: refundAmount,
      stripe_refund_id: stripeRefundId,
      warning:
        'Booking cancelled and refund issued, but status update failed. Admin has been alerted.',
    });
  }

  await admin.from('event_logs').insert({
    event_id: job.id,
    message:
      refundAmount > 0
        ? `[Partner] cancelled online. Fee S$${feeGstIncl.toFixed(2)} (rule: ${rule}). Refund S$${refundAmount.toFixed(2)} issued via Stripe (${stripeRefundId}).`
        : `[Partner] cancelled online. Fee S$${feeGstIncl.toFixed(2)} (rule: ${rule}). No refund — fee >= price.`,
    created_by: `partner:${auth.partnerUserId}`,
  });

  return NextResponse.json({
    cancelled: true,
    refund: refundAmount,
    fee_amount: feeGstIncl,
    fee_rule: rule,
    stripe_refund_id: stripeRefundId,
    billing: 'stripe_refund_net',
  });
}
