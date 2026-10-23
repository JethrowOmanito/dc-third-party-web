import { NextRequest, NextResponse } from 'next/server';
import { authPartnerForJob } from '@/lib/partner-job-auth';
import { computeFee, feeWithGst, type FeeResult } from '@/lib/fees';
import { checkRateLimit } from '@/lib/utils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ip =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for') ??
    'unknown';
  if (!(await checkRateLimit(`partner-reschedule-info:${ip}`, 30, 60_000))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const r = await authPartnerForJob(id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  let fee: FeeResult = { amount: 0, tier_hit: null, reason: 'no_matching_tier' };
  try {
    fee = await computeFee(r.job.id, 'reschedule');
  } catch (e) {
    console.error('[partner reschedule-info] computeFee failed:', e);
  }

  const { gst, total } = feeWithGst(fee.amount);

  return NextResponse.json({
    job: {
      id: r.job.id,
      Ref_ID: r.job.Ref_ID,
      Title: r.job.Title,
      Service_Type: r.job.Service_Type,
      Start_Date: r.job.Start_Date,
      Start_Time: r.job.Start_Time,
      Start_Time_Display: r.job.Start_Time_Display,
      End_Time: r.job.End_Time,
      End_Time_Display: r.job.End_Time_Display,
      Price: r.job.Price,
      payment_status: r.job.payment_status,
      lifecycle_state: r.job.lifecycle_state,
    },
    fee: {
      amount: fee.amount,
      gst_amount: gst,
      amount_with_gst: total,
      gst_rate: 0.09,
      tier_hit: fee.tier_hit,
      reason: fee.reason,
      waived: Boolean(r.job.reschedule_fee_waived),
    },
    payment_terms: r.auth.paymentTerms,
  });
}
