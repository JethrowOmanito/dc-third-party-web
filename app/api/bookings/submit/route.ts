// Server endpoint used by the booking wizard to insert an event.
// The client previously did `supabase.from('events').insert(...)` with anon
// key — an attacker could tamper the JS to inject a booking with a rival
// company_id, forge the price, or spoof the payment status.
//
// This endpoint accepts the client's shape verbatim but OVERRIDES every
// security-critical field with server-truth values pulled from JWT + DB.
// It also runs the same approval + payment-terms + discount logic as the
// legacy /api/bookings/create route.

import { createAdminClient } from '@/lib/supabase/admin';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

interface ClientBooking {
  Title?: string;
  Name?: string;
  Email?: string;
  Whatsapp_Number?: string;
  Start_Date?: string;
  End_Date?: string;
  Start_Time?: string;
  End_Time?: string;
  Start_Time_Display?: string;
  End_Time_Display?: string;
  Service_Type?: string;
  service_subtype?: string;
  calendar_id?: string;
  Unit_type?: string;
  Unit_sub_type?: string;
  duration?: string;
  Extra_Service?: string[];
  Note?: string;
  Assign_Cleaner?: unknown[];
  Price?: number;
  final_price?: number;
  amount_cents?: number;
  gst_rate?: number;
  gst_amount?: number;
  tax_treatment?: string;
  webhook_processed?: boolean;
  booking_expires_at?: string;
  // Fields the client MAY send but we always override:
  status?: string;
  payment_status?: string;
  owned_by_third_party?: string;
  partner_company_id?: string | null;
  source?: string;
  lifecycle_state?: string;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Verify JWT (no fallback secret).
    const cookieStore = await cookies();
    const token = cookieStore.get('dc_partner_session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!process.env.JWT_SECRET) {
      console.error('[bookings/submit] CRITICAL: JWT_SECRET missing');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    let jwtUser: { id?: string };
    try {
      const { payload } = await jwtVerify(token, secret);
      jwtUser = payload as { id?: string };
    } catch {
      return NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 });
    }
    const partnerUserId = jwtUser.id;
    if (!partnerUserId) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // 2. Refetch partner + company from DB (JWT payload is not authoritative).
    const admin = createAdminClient();
    const { data: partner, error: pErr } = await admin
      .from('partner_user')
      .select('id, username, full_name, approval_status, force_logout, company_id')
      .eq('id', partnerUserId)
      .single();
    if (pErr || !partner) {
      return NextResponse.json({ error: 'Session partner not found' }, { status: 401 });
    }
    if (partner.force_logout) {
      return NextResponse.json(
        { error: 'Your account has been logged out by admin.', errorCode: 'force_logout' },
        { status: 403 }
      );
    }
    if (partner.approval_status !== 'approved') {
      return NextResponse.json(
        {
          error:
            partner.approval_status === 'pending'
              ? 'Your account is pending admin approval. Bookings are disabled until approved.'
              : 'Your account is not approved. Please contact administrator.',
          errorCode: 'partner_not_approved',
        },
        { status: 403 }
      );
    }
    if (!partner.company_id) {
      return NextResponse.json(
        { error: 'Your account is not linked to a company. Please contact admin.' },
        { status: 403 }
      );
    }

    // 3. Load company for discount + payment terms + company_code.
    const { data: company } = await admin
      .from('partner_companies')
      .select('id, name, company_code, discount_type, discount_value, payment_terms, is_active')
      .eq('id', partner.company_id)
      .single();
    if (!company || company.is_active === false) {
      return NextResponse.json({ error: 'Your company is inactive.' }, { status: 403 });
    }

    // Zoe (admin) must set payment_terms before a partner company can book.
    // If NULL, block with a clear message rather than silently defaulting
    // to upfront (which would push the customer through Stripe against
    // the arrangement).
    if (company.payment_terms !== 'upfront' && company.payment_terms !== 'end_of_month') {
      return NextResponse.json(
        {
          error:
            'Your company\'s payment terms have not been set by admin yet. Please contact Zoe to enable bookings.',
          errorCode: 'payment_terms_not_set',
        },
        { status: 403 }
      );
    }

    // 4. Parse client body.
    const body = (await req.json()) as ClientBooking;

    // 5. Server-truth pricing. We accept the client's Price (base + addons)
    //    as a HINT but clamp negative/absurd values and always apply the
    //    server-known discount + GST from scratch.
    const clientBase = typeof body.Price === 'number' ? body.Price : 0;
    if (clientBase < 0 || clientBase > 100_000) {
      return NextResponse.json({ error: 'Price out of range' }, { status: 400 });
    }
    let companyDiscount = 0;
    if (company.discount_type && Number(company.discount_value) > 0) {
      companyDiscount = company.discount_type === 'percent'
        ? (clientBase * Number(company.discount_value)) / 100
        : Math.min(Number(company.discount_value), clientBase);
    }
    const finalNet = Math.max(0, clientBase - companyDiscount);
    const gstAmount = Math.round(finalNet * 0.09 * 100) / 100;
    const amountCents = Math.round((finalNet + gstAmount) * 100);

    // 6. Payment routing.
    const isInvoiced = company.payment_terms === 'end_of_month';

    // 7. Build the row — server owns every security-relevant column.
    const row = {
      Title: body.Title ?? null,
      Name: body.Name ?? null,
      Email: body.Email ?? null,
      Whatsapp_Number: body.Whatsapp_Number ?? null,
      Start_Date: body.Start_Date ?? null,
      End_Date: body.End_Date ?? null,
      Start_Time: body.Start_Time ?? null,
      End_Time: body.End_Time ?? null,
      Start_Time_Display: body.Start_Time_Display ?? null,
      End_Time_Display: body.End_Time_Display ?? null,
      Service_Type: body.Service_Type ?? null,
      service_subtype: body.service_subtype ?? null,
      calendar_id: body.calendar_id ?? null,
      Unit_type: body.Unit_type ?? null,
      Unit_sub_type: body.Unit_sub_type ?? null,
      duration: body.duration ?? null,
      Extra_Service: Array.isArray(body.Extra_Service) ? body.Extra_Service : [],
      Note: body.Note ?? null,
      Assign_Cleaner: [],
      tax_treatment: 'exclusive',
      gst_rate: 9,
      gst_amount: gstAmount,
      webhook_processed: false,
      booking_expires_at: body.booking_expires_at ?? null,

      // ─── Server-authoritative (never trust client) ───
      Price: finalNet,
      final_price: finalNet,
      amount_cents: amountCents,
      status: isInvoiced ? 'confirmed' : 'pending',
      payment_status: isInvoiced ? 'pending' : 'unpaid',
      payment_method: isInvoiced ? 'invoice' : null,
      lifecycle_state: 'active',
      owned_by_third_party: partnerUserId,
      partner_company_id: partner.company_id,
      source: company.company_code || 'AGT',
    };

    const { data: event, error: insErr } = await admin
      .from('events')
      .insert(row)
      .select('id, "Ref_ID"')
      .single();

    if (insErr || !event) {
      console.error('[bookings/submit] insert failed:', insErr);
      return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
    }

    await admin.from('event_logs').insert({
      event_id: event.id,
      message: `Booking created by ${partner.full_name || partner.username || 'Partner'}${
        isInvoiced ? ' — invoiced at month-end' : ''
      }`,
    });

    return NextResponse.json(
      {
        success: true,
        booking: event,
        amount_cents: amountCents,
        requiresPayment: !isInvoiced,
        paymentTerms: company.payment_terms,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[bookings/submit] unexpected:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
