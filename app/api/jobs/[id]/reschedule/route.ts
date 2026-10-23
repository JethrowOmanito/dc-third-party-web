import { NextRequest, NextResponse } from 'next/server';
import { authPartnerForJob } from '@/lib/partner-job-auth';
import { computeFee, feeWithGst, ruleFromTier } from '@/lib/fees';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/utils';
import { z } from 'zod';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

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
});

const STATUS_MESSAGES: Record<string, string> = {
  cancelled: 'This booking has been cancelled and cannot be rescheduled.',
  completed: 'This booking is already completed.',
  deleted: 'This booking is no longer available.',
  rescheduled: 'This booking has already been rescheduled. Please contact admin for further changes.',
  cancelling: 'This booking is currently being processed. Please wait a moment and try again.',
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

  const TERMINAL = new Set(['cancelled', 'completed', 'deleted', 'rescheduled', 'cancelling']);
  if (job.lifecycle_state && TERMINAL.has(job.lifecycle_state)) {
    const msg = STATUS_MESSAGES[job.lifecycle_state] ?? 'This booking cannot be rescheduled.';
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  if (job.Start_Date) {
    const todaySGT = new Date(
      Math.floor((Date.now() + SGT_OFFSET_MS) / 86_400_000) * 86_400_000 - SGT_OFFSET_MS,
    );
    const target = new Date(job.Start_Date + 'T00:00:00+08:00');
    const daysDelta = Math.floor((target.getTime() - todaySGT.getTime()) / 86_400_000);
    if (daysDelta < 0) {
      return NextResponse.json(
        { error: 'This booking has already passed. Contact admin on WhatsApp if a change is still needed.' },
        { status: 400 },
      );
    }
  }

  if (job.series_id && job.housekeeping_session_type === 'online_4x') {
    return NextResponse.json(
      { error: 'Series bookings require admin assistance. Please contact Zoe.' },
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
  if (newStartMs < Date.now() + 60 * 60_000) {
    return NextResponse.json(
      { error: 'New appointment must be at least 1 hour in the future.' },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Optimistic lock
  const { data: locked } = await admin
    .from('events')
    .update({ lifecycle_state: 'cancelling' }) // transient; flipped back below
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

  // Fee is computed BEFORE the move (against original Start_Date/Time).
  let computed;
  try {
    computed = await computeFee(job.id, 'reschedule');
  } catch (feeErr) {
    console.error('[partner reschedule] computeFee failed', feeErr);
    await admin.from('events').update({ lifecycle_state: job.lifecycle_state }).eq('id', job.id);
    return NextResponse.json({ error: 'Could not calculate reschedule fee.' }, { status: 500 });
  }

  const feeGstIncl = feeWithGst(computed.amount).total;
  const rule = ruleFromTier(computed.tier_hit);

  // Normalize new time
  const newStart24 = body.new_start_time.length === 5 ? `${body.new_start_time}:00` : body.new_start_time;
  const newEnd24 = body.new_end_time
    ? body.new_end_time.length === 5
      ? `${body.new_end_time}:00`
      : body.new_end_time
    : null;
  const newStartDisplay = toDisplay(newStart24.slice(0, 5));
  const newEndDisplay = newEnd24 ? toDisplay(newEnd24.slice(0, 5)) : null;

  const nowIso = new Date().toISOString();
  const noteTag =
    feeGstIncl > 0
      ? `[AUTO ${nowIso.split('T')[0]}] Partner rescheduled online: ${job.Start_Date} ${job.Start_Time_Display} → ${body.new_start_date} ${newStartDisplay}. Fee S$${feeGstIncl.toFixed(2)} (incl. 9% GST, rule: ${rule})${auth.paymentTerms === 'end_of_month' ? ' — add to EOM invoice.' : ' — collect from partner.'}`
      : `[AUTO ${nowIso.split('T')[0]}] Partner rescheduled online: ${job.Start_Date} ${job.Start_Time_Display} → ${body.new_start_date} ${newStartDisplay}. No fee (rule: ${rule}).`;
  const reasonLine = body.reason ? `\nReason: ${body.reason}` : '';
  const mergedNote = [`${noteTag}${reasonLine}`, job.Note ?? ''].filter(Boolean).join('\n\n');

  const { error: updateErr } = await admin
    .from('events')
    .update({
      lifecycle_state: 'active',
      Start_Date: body.new_start_date,
      End_Date: body.new_start_date,
      Start_Time: newStart24,
      Start_Time_Display: newStartDisplay,
      ...(newEnd24
        ? { End_Time: newEnd24, End_Time_Display: newEndDisplay }
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
    return NextResponse.json({ error: 'Failed to reschedule booking.' }, { status: 500 });
  }

  await admin.from('job_transactions').insert({
    event_id: job.id,
    transaction_type: 'partner_reschedule',
    fee_rule: rule,
    fee_amount: feeGstIncl,
    refund_amount: 0,
    original_price: Number(job.final_price) || Number(job.Price) || 0,
    original_date: job.Start_Date,
    reason:
      auth.paymentTerms === 'end_of_month'
        ? 'Partner self-rescheduled online — fee added to EOM invoice'
        : 'Partner self-rescheduled online — fee pending collection',
    created_by: `partner:${auth.partnerUserId}`,
  });

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
