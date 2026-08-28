import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateBookingAvailability } from '@/lib/api/availability-check';

const bookingSchema = z.object({
  service: z.string(),
  date: z.string(),
  slot: z.object({
    label: z.string(),
    start: z.string(),
    end: z.string(),
    additionalFee: z.number().optional(),
  }),
  subtype: z.string().optional(),
  propertyType: z.enum(['hdb', 'condo']),
  pricingId: z.string(),
  addonIds: z.array(z.string()).optional(),
  contact: z.object({
    name: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().min(1),
    notes: z.string().optional(),
  }),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Auth check
    const cookieStore = await cookies();
    const token = cookieStore.get('dc_partner_session')?.value;
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // No fallback — if JWT_SECRET is missing, refuse instead of using a
    // hard-coded value that could allow signed-token forgery.
    if (!process.env.JWT_SECRET) {
      console.error('CRITICAL: JWT_SECRET env var is not set');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload: user } = await jwtVerify(token, secret);

    // 1b. Approval gate — DB is authoritative, not the JWT. A partner who was
    // approved at login then later rejected by admin still has a valid JWT
    // marked 'approved'; refetch here so their old JWT can't sneak past.
    const partnerUserId = user.id as string | undefined;
    if (!partnerUserId) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }
    const { data: liveStatus } = await (await createClient())
      .from('partner_user')
      .select('approval_status, force_logout')
      .eq('id', partnerUserId)
      .single();
    const liveApproval = liveStatus?.approval_status ?? user.approval_status;
    if (liveStatus?.force_logout) {
      return NextResponse.json(
        { error: 'Your account has been logged out by admin.', errorCode: 'force_logout' },
        { status: 403 }
      );
    }
    if (liveApproval && liveApproval !== 'approved') {
      return NextResponse.json(
        {
          error:
            liveApproval === 'pending'
              ? 'Your account is pending admin approval. Bookings are disabled until approved.'
              : 'Your account is not approved. Please contact administrator.',
          errorCode: 'partner_not_approved',
        },
        { status: 403 }
      );
    }

    // 2. Parse body
    const body = await req.json();
    const parsed = bookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid booking data', details: parsed.error.format() }, { status: 400 });
    }

    const data = parsed.data;
    const supabase = await createClient();

    // 2.5 Validation: Capacity & Cleaner Availability
    const availability = await validateBookingAvailability(
      data.service,
      data.date,
      data.slot.start,
      data.slot.end
    );

    if (!availability.available) {
      return NextResponse.json({ 
        error: availability.reason || 'Requested slot is no longer available.',
        errorCode: availability.errorCode
      }, { status: 409 }); // 409 Conflict
    }

    // 3. Server-side price calculation (Hardening against tampering)
    // Fetch original pricing and addons from DB
    const [pricingRes, addonsRes] = await Promise.all([
      // Refuse inactive pricing rows so clients can't book against a
      // deprecated price the admin has archived.
      supabase.from('service_pricing').select('*').eq('id', data.pricingId).eq('is_active', true).single(),
      data.addonIds && data.addonIds.length > 0 
        ? supabase.from('service_addons').select('*').in('id', data.addonIds)
        : Promise.resolve({ data: [] }),
    ]);

    if (pricingRes.error || !pricingRes.data) {
      return NextResponse.json({ error: 'Invalid pricing selection' }, { status: 400 });
    }

    const basePrice = pricingRes.data.price || 0;
    const addonsTotal = (addonsRes.data || []).reduce((sum, a) => sum + (a.price || 0), 0);
    const slotFee = data.slot.additionalFee || 0;
    const subtotal = basePrice + addonsTotal + slotFee;

    // Server-side company discount + payment terms lookup (never trust client for pricing).
    // partnerUserId is already declared + validated above (approval gate).
    const { data: partnerRow } = await supabase
      .from('partner_user')
      .select('company_id, partner_companies!company_id(id, discount_type, discount_value, payment_terms)')
      .eq('id', partnerUserId)
      .maybeSingle();

    const partnerCompany = partnerRow?.partner_companies as
      | { id: string; discount_type: 'percent' | 'flat' | null; discount_value: number | string | null; payment_terms: 'upfront' | 'end_of_month' | null }
      | { id: string; discount_type: 'percent' | 'flat' | null; discount_value: number | string | null; payment_terms: 'upfront' | 'end_of_month' | null }[]
      | undefined;
    const co = Array.isArray(partnerCompany) ? partnerCompany[0] : partnerCompany;

    let companyDiscount = 0;
    if (co?.discount_type && Number(co.discount_value) > 0) {
      companyDiscount = co.discount_type === 'percent'
        ? (subtotal * Number(co.discount_value)) / 100
        : Math.min(Number(co.discount_value), subtotal);
    }
    const finalTotal = Math.max(0, subtotal - companyDiscount);
    const gstAmount = Math.round(finalTotal * 0.09 * 100) / 100;

    // Zoe (admin) must set payment_terms before a partner company can book.
    // If NULL, refuse instead of silently defaulting to upfront (which
    // would push the customer through Stripe against the arrangement).
    if (co?.payment_terms !== 'upfront' && co?.payment_terms !== 'end_of_month') {
      return NextResponse.json(
        {
          error:
            'Your company\'s payment terms have not been set by admin yet. Please contact Zoe to enable bookings.',
          errorCode: 'payment_terms_not_set',
        },
        { status: 403 }
      );
    }
    const paymentTerms: 'upfront' | 'end_of_month' = co.payment_terms;
    const isInvoiced = paymentTerms === 'end_of_month';

    // 4. Insert Booking
    const { data: event, error: insertError } = await supabase.from('events').insert({
      Title: data.contact.address,
      Service_Type: data.service,
      Start_Date: data.date,
      Start_Time_Display: data.slot.start,
      End_Time_Display: data.slot.end,
      Name: data.contact.name,
      Whatsapp_Number: data.contact.phone,
      Email: data.contact.email,
      Note: data.contact.notes,
      Price: finalTotal,
      final_price: finalTotal,
      tax_treatment: 'exclusive',
      gst_rate: 9,
      gst_amount: gstAmount,
      // End-of-month partners: booking is confirmed immediately and will be
      // invoiced at month-end. No Stripe intent required.
      status: isInvoiced ? 'confirmed' : 'pending',
      payment_status: isInvoiced ? 'invoice' : 'unpaid',
      owned_by_third_party: partnerUserId,
      partner_company_id: partnerRow?.company_id ?? null,
      // Unit & Size go to specific columns, not Extra_Service
      Unit_type: data.propertyType === 'hdb' ? 'HDB' : (data.propertyType === 'condo' ? 'Condo/APT' : 'Landed'),
      Unit_sub_type: data.subtype || null,
      // Extra_Service is for Add-ons (Scrubbing, Blinds, etc.)
      Extra_Service: (addonsRes.data || []).map(a => a.name),
      source: (user as any).company_code || 'AGT',
      lifecycle_state: 'active',
    }).select().single();
    
    if (event) {
       // Log the creation for the History tab
       const supabaseAdmin = createAdminClient(); // Need admin to bypass RLS for logs usually
       await supabaseAdmin.from('event_logs').insert({
         event_id: event.id,
         message: `Booking created by ${user.email || user.username || 'Partner'}`
       });
    }

    if (insertError) {
      console.error('Booking insertion error:', insertError);
      return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
    }

    return NextResponse.json(
      { success: true, booking: event, paymentTerms, requiresPayment: !isInvoiced },
      { status: 201 }
    );

  } catch (err) {
    console.error('Booking API Error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
