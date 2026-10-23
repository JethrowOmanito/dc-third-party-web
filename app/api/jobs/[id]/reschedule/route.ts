import { NextRequest, NextResponse } from 'next/server';
import { authPartnerForJob } from '@/lib/partner-job-auth';
import { computeFee, feeWithGst, ruleFromTier, verifyFeeToken } from '@/lib/fees';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/utils';
import { validateBookingAvailability } from '@/lib/api/availability-check';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE_LOCK_MS = 5 * 60 * 1000;

const bodySchema = z.object({
  new_start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'new_start_date must be YYYY-MM-DD'),
  new_start_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'new_start_time must be HH:mm or HH:mm:ss'),
  new_end_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .nullish(),
  reason: z.string().max(500).nullish(),
  fee_token: z.string().max(2048).nullish(),
});

const STATUS_MESSAGES: Record<string, string> = {
  cancelled: 'This booking has been cancelled and cannot be rescheduled.',
  completed: 'This booking is already completed.',
  deleted: 'This booking is no longer available.',
  rescheduled: 'This booking has already been rescheduled. Please contact admin for further changes.',
  reschedule_pending: 'This booking is currently being processed. Please wait a moment and try again.',
};

// Format HH:mm → "9:30 AM" display string (matches booking-web convention).
function toDisplay(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const meridiem = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${String(m).padStart(2, '0')} ${meridiem}`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ip =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for') ??
    'unknown';
  if (!(await checkRateLimit(`partner-reschedule:${ip}`, 10, 10 * 60_000))) {
    return NextResponse.json({ error: 'Too many reschedule attempts' }, { status: 429 });
  }
  if (!(await checkRateLimit(`partner-reschedule-booking:${id}`, 5, 24 * 60 * 60_000))) {
    return NextResponse.json({ error: 'Too many attempts on this booking' }, { status: 429 });
  }

  const r = await authPartnerForJob(id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { job, auth } = r;

  const TERMINAL = new Set(['cancelled', 'completed', 'deleted', 'rescheduled', 'reschedule_pending']);
  if (job.lifecycle_state && TERMINAL.has(job.lifecycle_state)) {
    const msg = STATUS_MESSAGES[job.lifecycle_state] ?? 'This booking cannot be rescheduled.';
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  if (job.Start_Date) {
    const hhmm = (job.Start_Time ?? '00:00').slice(0, 5);
    const startMs = Date.parse(`${job.Start_Date}T${hhmm}:00+08:00`);
    if (Number.isFinite(startMs) && startMs < Date.now()) {
      return NextResponse.json(
        { error: 'This booking has already started. Contact admin on WhatsApp if a change is still needed.' },
        { status: 400 },
      );
    }
  }

  if (job.series_id) {
    return NextResponse.json(
      { error: 'This is part of a recurring/series booking. Please contact admin to reschedule.' },
      { status: 422 },
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid body' },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // Validate new date is strictly in the future (SGT)
  const newStartMs = Date.parse(`${body.new_start_date}T${body.new_start_time.slice(0, 5)}:00+08:00`);
  if (!Number.isFinite(newStartMs)) {
    return NextResponse.json({ error: 'Invalid new date/time' }, { status: 400 });
  }
  // Match the booking wizard's TOO_SOON gate (2 hours) so the server
  // doesn't reject a slot the client thinks is valid.
  if (newStartMs < Date.now() + 2 * 60 * 60_000) {
    return NextResponse.json(
      { error: 'New appointment must be at least 2 hours in the future.' },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Stale-lock reaper — see cancel/route.ts for context.
  const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  await admin
    .from('events')
    .update({ lifecycle_state: 'active' })
    .eq('id', job.id)
    .eq('lifecycle_state', 'reschedule_pending')
    .lt('updated_at', staleCutoff);

  // Optimistic lock
  const { data: locked } = await admin
    .from('events')
    .update({ lifecycle_state: 'reschedule_pending' }) // transient; flipped back below
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

  // Lock the fee amount to whatever reschedule-info showed the partner.
  // If no valid token, fall back to live compute (so curl / admin tools
  // still work), but reject expired tokens to stop stale previews from
  // being replayed.
  let feeGstIncl: number;
  let feeTier: number | null;
  if (body.fee_token) {
    const locked = await verifyFeeToken(body.fee_token, { event_id: job.id, kind: 'reschedule' });
    if (!locked) {
      await admin.from('events').update({ lifecycle_state: job.lifecycle_state }).eq('id', job.id);
      return NextResponse.json(
        { error: 'Fee preview expired. Please reopen the reschedule dialog.', errorCode: 'fee_token_expired' },
        { status: 409 },
      );
    }
    feeGstIncl = locked.amount_with_gst;
    feeTier = locked.tier_hit;
  } else {
    let computed;
    try {
      computed = await computeFee(job.id, 'reschedule');
    } catch (feeErr) {
      console.error('[partner reschedule] computeFee failed', feeErr);
      Sentry.captureException(feeErr, {
        tags: { route: 'partner/reschedule', event_id: job.id },
      });
      await admin.from('events').update({ lifecycle_state: job.lifecycle_state }).eq('id', job.id);
      return NextResponse.json({ error: 'Could not calculate reschedule fee.' }, { status: 500 });
    }
    feeGstIncl = feeWithGst(computed.amount).total;
    feeTier = computed.tier_hit;
  }

  const rule = ruleFromTier(feeTier);

  // Normalize new time
  const newStart24 = body.new_start_time.length === 5 ? `${body.new_start_time}:00` : body.new_start_time;
  const newEnd24 = body.new_end_time
    ? body.new_end_time.length === 5
      ? `${body.new_end_time}:00`
      : body.new_end_time
    : null;
  const newStartDisplay = toDisplay(newStart24.slice(0, 5));
  // Preserve the original job duration if the client didn't send a new
  // End_Time — same arrival-window length as before.
  const toMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };
  let derivedEnd24 = newEnd24;
  if (!derivedEnd24 && job.Start_Time && job.End_Time) {
    const durationMins = toMinutes(job.End_Time.slice(0, 5)) - toMinutes(job.Start_Time.slice(0, 5));
    if (durationMins > 0) {
      const newStartMins = toMinutes(newStart24.slice(0, 5));
      const newEndMins = newStartMins + durationMins;
      const eh = Math.floor(newEndMins / 60) % 24;
      const em = newEndMins % 60;
      derivedEnd24 = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`;
    }
  }
  const newEndDisplay = derivedEnd24 ? toDisplay(derivedEnd24.slice(0, 5)) : null;

  // Availability guard — runs the same checks the booking wizard uses
  // (lead-time, capacity, cleaner leave, housekeeping SOP). Prevents a
  // partner from rescheduling into a fully-booked / blackout slot.
  if (newEndDisplay && job.Service_Type) {
    try {
      const avail = await validateBookingAvailability(
        job.Service_Type,
        body.new_start_date,
        newStartDisplay,
        newEndDisplay,
        undefined,
        undefined,
        undefined,
      );
      if (!avail.available) {
        await admin.from('events').update({ lifecycle_state: job.lifecycle_state }).eq('id', job.id);
        return NextResponse.json(
          { error: avail.reason ?? 'Slot not available.', errorCode: avail.errorCode ?? 'UNAVAILABLE' },
          { status: 409 },
        );
      }
    } catch (availErr) {
      console.error('[partner reschedule] availability check failed', availErr);
      // Fail OPEN — don't block legit reschedules on a transient DB blip.
      // The subsequent events.update will still fire capacity triggers.
    }
  }

  const nowIso = new Date().toISOString();
  const todayPrefix = `[AUTO ${nowIso.split('T')[0]}] Partner rescheduled online:`;
  const noteTag =
    feeGstIncl > 0
      ? `${todayPrefix} ${job.Start_Date} ${job.Start_Time_Display} → ${body.new_start_date} ${newStartDisplay}. Fee S$${feeGstIncl.toFixed(2)} (incl. 9% GST, rule: ${rule})${auth.paymentTerms === 'end_of_month' ? ' — add to EOM invoice.' : ' — collect from partner.'}`
      : `${todayPrefix} ${job.Start_Date} ${job.Start_Time_Display} → ${body.new_start_date} ${newStartDisplay}. No fee (rule: ${rule}).`;
  const reasonLine = body.reason ? `\nReason: ${body.reason}` : '';
  // Idempotency: avoid double-prepend on retry. Also re-read Note under
  // the lock in case admin edited it between our auth-time fetch and now.
  const { data: freshNote } = await admin
    .from('events')
    .select('"Note"')
    .eq('id', job.id)
    .single();
  const currentNote = (freshNote as { Note?: string | null } | null)?.Note ?? job.Note ?? '';
  const alreadyLogged = currentNote.trimStart().startsWith(todayPrefix);
  const mergedNote = alreadyLogged
    ? currentNote
    : [`${noteTag}${reasonLine}`, currentNote].filter(Boolean).join('\n\n');

  // Preserve original multi-day span: if the event had an End_Date different
  // from Start_Date (overnight / multi-session), shift it by the same delta
  // so a 2-day job stays 2 days after rescheduling.
  const origStart = job.Start_Date ? new Date(job.Start_Date + 'T00:00:00+08:00') : null;
  const origEnd = job.End_Date ? new Date(job.End_Date + 'T00:00:00+08:00') : null;
  const spanDays =
    origStart && origEnd
      ? Math.max(0, Math.round((origEnd.getTime() - origStart.getTime()) / 86_400_000))
      : 0;
  const newStartParsed = new Date(body.new_start_date + 'T00:00:00+08:00');
  const newEndDate =
    spanDays > 0
      ? new Date(newStartParsed.getTime() + spanDays * 86_400_000)
          .toISOString()
          .split('T')[0]
      : body.new_start_date;

  const { error: updateErr } = await admin
    .from('events')
    .update({
      // Restore to the pre-lock lifecycle_state (usually 'active' for a
      // confirmed booking, but could be 'pending' for an unpaid upfront
      // booking — don't silently promote it to active without payment).
      lifecycle_state: job.lifecycle_state,
      Start_Date: body.new_start_date,
      End_Date: newEndDate,
      Start_Time: newStart24,
      Start_Time_Display: newStartDisplay,
      ...(derivedEnd24
        ? { End_Time: derivedEnd24, End_Time_Display: newEndDisplay }
        : {}),
      reschedule_fee: feeGstIncl > 0 ? feeGstIncl : null,
      fee_type: feeGstIncl > 0 ? `reschedule_${rule}` : null,
      fee_applied_at: feeGstIncl > 0 ? nowIso : null,
      rescheduled_at: nowIso,
      rescheduled_by: 'partner (online)',
      Note: mergedNote,
    })
    .eq('id', job.id);

  if (updateErr) {
    console.error('[partner reschedule] update failed', updateErr);
    await admin.from('events').update({ lifecycle_state: job.lifecycle_state }).eq('id', job.id);
    // Surface P0001 trigger messages (capacity, blackout, SOP) directly
    // so the partner sees the real reason instead of a generic 500.
    const pgCode = (updateErr as { code?: string } | null)?.code;
    const pgMsg = (updateErr as { message?: string } | null)?.message ?? '';
    if (pgCode === 'P0001' || /capacity|blackout|SOP|overlap/i.test(pgMsg)) {
      return NextResponse.json({ error: pgMsg || 'Slot not available.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to reschedule booking.' }, { status: 500 });
  }

  const { error: txErr } = await admin.from('job_transactions').insert({
    event_id: job.id,
    transaction_type: 'reschedule',
    fee_rule: rule,
    fee_amount: feeGstIncl,
    refund_amount: 0,
    original_price: Number(job.final_price) || Number(job.Price) || 0,
    original_date: job.Start_Date,
    new_date: body.new_start_date,
    new_start_time: newStart24,
    new_end_time: derivedEnd24 ?? null,
    reason:
      auth.paymentTerms === 'end_of_month'
        ? 'Partner self-rescheduled online — fee added to EOM invoice'
        : 'Partner self-rescheduled online — fee pending collection',
    created_by: `partner:${auth.partnerUserId}`,
  });
  if (txErr) console.error('[partner reschedule] job_transactions insert failed', txErr);

  await admin.from('event_logs').insert({
    event_id: job.id,
    message:
      feeGstIncl > 0
        ? `[Partner] rescheduled online. New: ${body.new_start_date} ${newStartDisplay}. Fee S$${feeGstIncl.toFixed(2)} (rule: ${rule}).`
        : `[Partner] rescheduled online. New: ${body.new_start_date} ${newStartDisplay}. No fee (rule: ${rule}).`,
    created_by: `partner:${auth.partnerUserId}`,
  });

  return NextResponse.json({
    rescheduled: true,
    new_start_date: body.new_start_date,
    new_start_time: newStart24,
    fee_amount: feeGstIncl,
    fee_rule: rule,
    billing:
      feeGstIncl === 0
        ? 'no_fee'
        : auth.paymentTerms === 'end_of_month'
          ? 'eom_invoice'
          : 'manual_collection',
  });
}
