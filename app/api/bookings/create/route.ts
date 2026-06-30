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

    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET || 'doctor-clean-partner-secret-well-change-this-soon'
    );
    const { payload: user } = await jwtVerify(token, secret);

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
      supabase.from('service_pricing').select('*').eq('id', data.pricingId).single(),
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
    const finalTotal = basePrice + addonsTotal + slotFee;

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
      owned_by_third_party: user.id,
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

    return NextResponse.json({ success: true, booking: event }, { status: 201 });

  } catch (err) {
    console.error('Booking API Error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
