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
import { checkRateLimit } from '@/lib/utils';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';

// Bounded shape — the client-facing wizard is trusted for the *shape*, but
// every field has a hard cap so a compromised or scripted client can't (a)
// bloat DB rows to break replication, (b) smuggle stored-XSS payloads that
// render on the admin dashboard, or (c) submit unbounded arrays that hit
// Postgres row-size limits. Every security-critical column (status,
// payment_status, price, partner_company_id, owned_by_third_party, source,
// lifecycle_state) is ignored here and overridden below with server truth.
// Every field uses .nullish() (accepts null OR undefined) because the booking
// wizard commonly sends explicit `null` for optional slots (e.g.
// `service_subtype: subtype || null`, `duration: ... : null`,
// `Start_Time: convertTo24Hour(slot?.start)` — which returns null).
// Zod v4's plain `.optional()` accepts undefined only and rejects null,
// which used to bomb the whole submit with "Invalid booking data" and
// no user-actionable message.
const bookingSchema = z.object({
  Title: z.string().max(500).nullish(),
  Name: z.string().max(200).nullish(),
  Email: z.string().max(200).nullish(),
  Whatsapp_Number: z.string().max(40).nullish(),
  Start_Date: z.string().max(20).nullish(),
  End_Date: z.string().max(20).nullish(),
  Start_Time: z.string().max(20).nullish(),
  End_Time: z.string().max(20).nullish(),
  Start_Time_Display: z.string().max(40).nullish(),
  End_Time_Display: z.string().max(40).nullish(),
  Service_Type: z.string().max(64).nullish(),
  service_subtype: z.string().max(128).nullish(),
  calendar_id: z.string().max(64).nullish(),
  Unit_type: z.string().max(64).nullish(),
  Unit_sub_type: z.string().max(64).nullish(),
  duration: z.string().max(32).nullish(),
  Extra_Service: z.array(z.string().max(200)).max(50).nullish(),
  Note: z.string().max(4_000).nullish(),
  Assign_Cleaner: z.array(z.unknown()).max(0).nullish(),
  Price: z.number().min(0).max(100_000).nullish(),
  final_price: z.number().min(0).max(100_000).nullish(),
  amount_cents: z.number().int().min(0).max(10_000_000).nullish(),
  gst_rate: z.number().min(0).max(30).nullish(),
  gst_amount: z.number().min(0).max(10_000).nullish(),
  tax_treatment: z.string().max(32).nullish(),
  webhook_processed: z.boolean().nullish(),
  booking_expires_at: z.string().max(40).nullish(),
  // Fields the client MAY send but we always override server-side:
  status: z.string().max(32).nullish(),
  payment_status: z.string().max(32).nullish(),
  owned_by_third_party: z.string().max(64).nullish(),
  partner_company_id: z.string().max(64).nullish(),
  source: z.string().max(32).nullish(),
  lifecycle_state: z.string().max(32).nullish(),
  // Partner brand — client hint used for audit/reporting. Server still
  // re-derives from company_type below to prevent an ID-company partner
  // from labelling a booking as 'agents' (or vice versa) and skirting the
  // downstream rebate logic.
  partner_brand: z.enum(['tcc', 'doctor_clean_id', 'agents']).nullish(),
});
type ClientBooking = z.infer<typeof bookingSchema>;

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

    // Per-partner insert cap. Symmetric with /api/bookings/create so a
    // partner can't route around one endpoint's limit by hitting the other.
    if (!(await checkRateLimit(`booking-create:${partnerUserId}`, 20, 60 * 60 * 1000))) {
      return NextResponse.json(
        { error: 'Too many bookings created recently. Please wait a bit.' },
        { status: 429 }
      );
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

    // 3. Load company for discount + payment terms + company_code + type.
    // company_type drives partner_brand server-side truthing below so a
    // property_manager can't submit partner_brand='doctor_clean_id' to
    // claim the ID rebate on a normal Agents booking.
    const { data: company } = await admin
      .from('partner_companies')
      .select('id, name, company_code, company_type, discount_type, discount_value, payment_terms, is_active')
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

    // 4. Parse client body with zod so oversized strings, oversized
    //    arrays, or unexpected types are rejected before we build the
    //    INSERT payload.
    const raw = await req.json().catch(() => null);
    const parsed = bookingSchema.safeParse(raw);
    if (!parsed.success) {
      // Sentry-report the exact failing field so we don't have to guess
      // which one exploded — "Invalid booking data" alone is useless.
      Sentry.captureMessage('bookings_submit_invalid_body', {
        level: 'warning',
        tags: { route: 'bookings/submit' },
        extra: {
          issues: parsed.error.issues.slice(0, 10).map((i) => ({
            path: i.path.join('.'),
            code: i.code,
            message: i.message,
          })),
        },
      });
      return NextResponse.json({ error: 'Invalid booking data' }, { status: 400 });
    }
    const body: ClientBooking = parsed.data;

    // Idempotency key from header. Client sends the same UUID for a
    // double-click/retry; the DB unique index on
    // (owned_by_third_party, client_request_id) turns the second insert
    // into a 23505 that we handle by returning the ORIGINAL booking.
    // Requires migration 20260831010000_booking_idempotency_key.sql.
    const clientRequestId = req.headers.get('x-idempotency-key');
    if (clientRequestId && !/^[0-9a-f-]{16,64}$/i.test(clientRequestId)) {
      return NextResponse.json({ error: 'Invalid idempotency key' }, { status: 400 });
    }

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

    // Server-truth partner_brand. property_manager companies are ALWAYS
    // 'agents' regardless of what the client sent; interior_design
    // companies accept 'tcc' or 'doctor_clean_id' and default to 'agents'
    // (safe) if the client somehow sent something else. Anything else
    // (unknown/null company_type) also defaults to 'agents'.
    const clientBrand = (body as any).partner_brand as
      | 'tcc' | 'doctor_clean_id' | 'agents' | null | undefined;
    let partnerBrand: 'tcc' | 'doctor_clean_id' | 'agents';
    if (company.company_type === 'property_manager') {
      partnerBrand = 'agents';
    } else if (company.company_type === 'interior_design') {
      partnerBrand = clientBrand === 'tcc' || clientBrand === 'doctor_clean_id'
        ? clientBrand
        : 'agents';
    } else {
      partnerBrand = 'agents';
    }

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
      partner_brand: partnerBrand,
      // Canonical partner source code — actual company link lives in partner_company_id.
      source: 'ID',
      // NULL when either the client didn't send one OR the migration
      // hasn't run yet (INSERT of a NULL to a non-existent column throws
      // — see catch below).
      ...(clientRequestId ? { client_request_id: clientRequestId } : {}),
    };

    let { data: event, error: insErr } = await admin
      .from('events')
      .insert(row)
      .select('id, "Ref_ID"')
      .single();

    // 23505 = unique_violation on the (owned_by_third_party, client_request_id)
    // index → this is a legitimate retry, return the original booking so the
    // client's payment flow continues seamlessly.
    if (insErr && (insErr as any).code === '23505' && clientRequestId) {
      const { data: existing } = await admin
        .from('events')
        .select('id, "Ref_ID"')
        .eq('owned_by_third_party', partnerUserId)
        .eq('client_request_id', clientRequestId)
        .maybeSingle();
      if (existing) {
        event = existing as typeof event;
        insErr = null;
      }
    }

    // Column missing → migration hasn't been applied yet OR PostgREST schema
    // cache is stale after a fresh migration. Retry the insert without the
    // idempotency column so bookings still work.
    //   42703  → raw Postgres undefined_column
    //   PGRST204 → PostgREST schema cache miss (typical when a column was
    //              added after the connection pool warmed up)
    if (
      insErr &&
      clientRequestId &&
      ((insErr as any).code === '42703' ||
        (insErr as any).code === 'PGRST204' ||
        /schema cache/i.test((insErr as any).message ?? ''))
    ) {
      Sentry.captureMessage('client_request_id_column_missing', {
        level: 'warning',
        tags: { route: 'bookings/submit' },
      });
      const { client_request_id: _skip, ...rowNoKey } = row as any;
      const retry = await admin.from('events').insert(rowNoKey).select('id, "Ref_ID"').single();
      event = retry.data as typeof event;
      insErr = retry.error;
    }

    if (insErr || !event) {
      Sentry.captureException(insErr, {
        tags: { route: 'bookings/submit', op: 'events.insert' },
        extra: { partnerUserId },
      });
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
    Sentry.captureException(err, { tags: { route: 'bookings/submit' } });
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
