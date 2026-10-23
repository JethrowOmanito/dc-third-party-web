import { createAdminClient } from '@/lib/supabase/admin';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

// Columns the cancel + reschedule flow needs to read from `events`.
// Extracted to a const so typos (easy in a 90-char quoted-column soup)
// surface as a type mismatch on PartnerJob rather than a silent null at
// runtime.
const PARTNER_JOB_SELECT =
  'id, "Ref_ID", "Title", "Service_Type", service_subtype, "Name", "Email", "Start_Date", "End_Date", "Start_Time", "Start_Time_Display", "End_Time", "End_Time_Display", "Price", final_price, amount_cents, payment_status, lifecycle_state, stripe_payment_intent_id, series_id, housekeeping_session_type, cancellation_fee_paid, cancellation_fee_waived, reschedule_fee_waived, partner_company_id, "Note"';

export type PartnerAuthed = {
  partnerUserId: string;
  companyId: string;
  paymentTerms: 'upfront' | 'end_of_month';
};

export type PartnerJob = {
  id: string;
  Ref_ID: number | string | null;
  Title: string | null;
  Service_Type: string | null;
  service_subtype: string | null;
  Name: string | null;
  Email: string | null;
  Start_Date: string | null;
  End_Date: string | null;
  Start_Time: string | null;
  Start_Time_Display: string | null;
  End_Time: string | null;
  End_Time_Display: string | null;
  Price: number | null;
  final_price: number | null;
  amount_cents: number | null;
  payment_status: string | null;
  lifecycle_state: string | null;
  stripe_payment_intent_id: string | null;
  series_id: string | null;
  housekeeping_session_type: string | null;
  cancellation_fee_paid: boolean | null;
  cancellation_fee_waived: boolean | null;
  reschedule_fee_waived: boolean | null;
  partner_company_id: string | null;
  Note: string | null;
};

// Verifies the partner session cookie + loads the event + confirms the
// event belongs to the signed-in partner's company. Returns 401/403/404
// shaped errors the caller can forward.
export async function authPartnerForJob(jobId: string): Promise<
  | { ok: true; auth: PartnerAuthed; job: PartnerJob }
  | { ok: false; status: number; error: string }
> {
  const cookieStore = await cookies();
  const token = cookieStore.get('dc_partner_session')?.value;
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' };
  if (!process.env.JWT_SECRET) {
    return { ok: false, status: 500, error: 'Server misconfiguration' };
  }
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);

  let partnerUserId: string;
  try {
    const { payload } = await jwtVerify(token, secret);
    partnerUserId = (payload as { id?: string }).id ?? '';
    if (!partnerUserId) return { ok: false, status: 401, error: 'Invalid session' };
  } catch {
    return { ok: false, status: 401, error: 'Session expired. Please log in again.' };
  }

  const admin = createAdminClient();

  const { data: partner } = await admin
    .from('partner_user')
    .select('id, company_id, force_logout, approval_status')
    .eq('id', partnerUserId)
    .single();
  if (!partner) return { ok: false, status: 401, error: 'Session partner not found' };
  if (partner.force_logout) {
    return { ok: false, status: 403, error: 'Your account has been logged out by admin.' };
  }
  if (partner.approval_status !== 'approved') {
    return { ok: false, status: 403, error: 'Your account is pending admin approval.' };
  }
  if (!partner.company_id) {
    return { ok: false, status: 403, error: 'Your account is not linked to a company.' };
  }

  const { data: company } = await admin
    .from('partner_companies')
    .select('id, payment_terms, is_active, company_status')
    .eq('id', partner.company_id)
    .single();
  if (!company || company.is_active === false) {
    return { ok: false, status: 403, error: 'Your company is inactive.' };
  }
  if (company.company_status !== 'approved') {
    return {
      ok: false,
      status: 403,
      error: 'Your company account is not approved. Please contact admin before making changes to a booking.',
    };
  }
  if (company.payment_terms !== 'upfront' && company.payment_terms !== 'end_of_month') {
    return {
      ok: false,
      status: 403,
      error:
        'Your company\'s payment terms are not set. Please contact Zoe before making changes to a booking.',
    };
  }

  const { data: event } = await admin
    .from('events')
    .select(PARTNER_JOB_SELECT)
    .eq('id', jobId)
    .maybeSingle();

  if (!event) {
    return { ok: false, status: 404, error: 'Booking not found' };
  }
  if (event.partner_company_id !== partner.company_id) {
    return { ok: false, status: 403, error: 'This booking does not belong to your company.' };
  }

  return {
    ok: true,
    auth: {
      partnerUserId,
      companyId: partner.company_id,
      paymentTerms: company.payment_terms as 'upfront' | 'end_of_month',
    },
    job: event as PartnerJob,
  };
}
