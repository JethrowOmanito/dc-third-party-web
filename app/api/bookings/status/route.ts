import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { checkRateLimit } from '@/lib/utils';

export async function GET(req: Request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: (process.env.STRIPE_API_VERSION || '2026-03-25.dahlia') as any,
  });
  try {
    const { searchParams } = new URL(req.url);
    const bookingId = searchParams.get('id');
    const refId = searchParams.get('ref_id');
    const guestEmail = searchParams.get('email');
    const intentIdFromUrl = searchParams.get('payment_intent');

    if (!bookingId && !intentIdFromUrl && !refId) {
      return NextResponse.json({ error: 'Search criteria required' }, { status: 400 });
    }

    // Prefer Cloudflare's connecting-IP header for rate-limit accuracy.
    const ip =
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-real-ip') ??
      req.headers.get('x-forwarded-for') ??
      'unknown';

    const supabase = createAdminClient();
    let query = supabase.from('events').select('id, status, payment_status, stripe_payment_intent_id, Ref_ID, webhook_processed, Email, owned_by_third_party');

    // --- SECURITY GATE 1: AUTHENTICATED UUID LOOKUP ---
    if (bookingId && !refId && !intentIdFromUrl) {
       // FORTRESS: Verify custom partner session instead of Supabase Auth
       const cookieStore = await cookies();
       const token = cookieStore.get('dc_partner_session')?.value;
       // No fallback — refuse if JWT_SECRET is missing rather than fall
       // back to a string that lives in the repo.
       if (!process.env.JWT_SECRET) {
         console.error('[bookings/status] CRITICAL: JWT_SECRET missing');
         return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
       }
       const secret = new TextEncoder().encode(process.env.JWT_SECRET);

       if (!token) {
         return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
       }

       let partnerUser: any;
       try {
         const { payload } = await jwtVerify(token, secret);
         partnerUser = payload;
       } catch (err) {
         return NextResponse.json({ error: 'Session expired' }, { status: 401 });
       }
       
       query = query.eq('id', bookingId);
       const { data: booking, error } = await query.single();
       
       if (!booking || booking.owned_by_third_party !== partnerUser.id) {
         return NextResponse.json({ error: 'Access Denied' }, { status: 403 });
       }

       // SYNC ENHANCEMENT: Even in Gate 1, if we have an intent ID, let's sync it!
       if (booking.stripe_payment_intent_id) {
          const intent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
          if (intent.status === 'succeeded' && booking.payment_status !== 'paid') {
             await supabase.from('events').update({
               status: 'confirmed',
               payment_status: 'paid',
               payment_date: new Date().toISOString(),
               webhook_processed: true,
             }).eq('id', booking.id);
             booking.status = 'confirmed';
             booking.payment_status = 'paid';
          }
       }

       return renderSuccess(booking, 'authenticated');
    }

    // --- SECURITY GATE 2: GUEST TWO-FACTOR LOOKUP ---
    if (refId) {
       if (!guestEmail) {
         return NextResponse.json({ error: 'Email verification required' }, { status: 400 });
       }

       // Rate-limit this branch aggressively — Ref_IDs are short numeric
       // strings and could otherwise be enumerated with a guessed customer
       // email to confirm which bookings exist.
       if (!(await checkRateLimit(`bookings-status-guest:${ip}`, 10, 15 * 60 * 1000))) {
         return NextResponse.json(
           { error: 'Too many attempts. Please wait 15 minutes.' },
           { status: 429 }
         );
       }

       const { data: booking, error } = await query.eq('Ref_ID', refId).single();

       // Null-safe compare — some bookings have Email = null (walk-in /
       // partner bookings where the partner didn't collect one).
       const emailMatches =
         typeof booking?.Email === 'string' &&
         booking.Email.toLowerCase() === guestEmail.toLowerCase();
       if (!booking || !emailMatches) {
         return NextResponse.json({ error: 'Invalid Reference ID or Email' }, { status: 404 });
       }
       return renderSuccess(booking, 'guest_verified');
    }

    // --- SECURITY GATE 3: STRIPE REDIRECT (Instant Sync) ---
    if (intentIdFromUrl) {
       const { data: booking, error: bError } = await query.eq('stripe_payment_intent_id', intentIdFromUrl).single();
       
       if (!booking) {
          console.error(`[Status API] No booking found for intent ${intentIdFromUrl}`);
          return NextResponse.json({ error: 'Payment intent not linked' }, { status: 404 });
       }
       
       // Instant Sync with Stripe
       const intent = await stripe.paymentIntents.retrieve(intentIdFromUrl, {
         expand: ['latest_charge']
       });
       
        if (intent.status === 'succeeded' || intent.status === 'processing') {
           const isPaid = intent.status === 'succeeded';
           
           // Detect payment method for the log
           let methodLabel = 'Card';
           const charge = intent.latest_charge as any;
           
           // Priority 1: Check actual charge details
           if (typeof charge === 'object' && charge?.payment_method_details?.type) {
              const pmType = charge.payment_method_details.type;
              methodLabel = pmType === 'paynow' ? 'PayNow' : 
                            pmType === 'grabpay' ? 'GrabPay' : 
                            pmType === 'card' ? 'Card' : pmType.charAt(0).toUpperCase() + pmType.slice(1);
           } 
           // Priority 2: Fallback to payment_method_types
           else if (intent.payment_method_types?.length) {
              if (intent.payment_method_types.includes('paynow')) methodLabel = 'PayNow';
              else if (intent.payment_method_types.includes('grabpay')) methodLabel = 'GrabPay';
           }

           // UNIVERSAL SYNC: Update if there's any discrepancy
           if ((isPaid && booking.payment_status !== 'paid') || (isPaid && !booking.webhook_processed) || (booking.status === 'pending' && isPaid)) {
              console.log(`[Status API] Force-syncing success state for booking ${booking.id}`);
              
              const updatePayload: any = {
                status: isPaid ? 'confirmed' : 'pending',
                lifecycle_state: 'active',
                webhook_processed: isPaid,
              };

              if (isPaid) {
                updatePayload.payment_status = 'paid';
                updatePayload.payment_date = new Date().toISOString();
                updatePayload.payment_method = methodLabel;
                
                // CLEAN UP THE NOTE FIELD: Aggressively remove any "Paid via Stripe" text
                const { data: currentBooking } = await supabase.from('events').select('"Note"').eq('id', booking.id).single();
                if (currentBooking && currentBooking.Note) {
                   const cleanedNote = currentBooking.Note.replace(/.*Paid via Stripe.*/gi, '').trim();
                   updatePayload.Note = cleanedNote;
                }
              }

              const { error: updateError } = await supabase.from('events').update(updatePayload).eq('id', booking.id);
              
              if (updateError) {
                console.error('DB Update Error in status sync:', updateError);
              } else {
                 if (isPaid) {
                    await supabase.from('event_logs').insert({
                      event_id: booking.id,
                      message: `Status: Paid via Stripe (${methodLabel})`,
                    });
                    
                    booking.status = 'confirmed';
                    booking.payment_status = 'paid';
                    booking.webhook_processed = true;
                 }
              }
           } else {
              // Discrepancy block skipped (already marked paid), but let's double check the history log
              if (isPaid) {
                 const { data: logs } = await supabase.from('event_logs')
                    .select('id')
                    .eq('event_id', booking.id)
                    .ilike('message', '%Paid via Stripe%')
                    .limit(1);
                 
                 if (!logs || logs.length === 0) {
                    await supabase.from('event_logs').insert({
                      event_id: booking.id,
                      message: `Status: Paid via Stripe (${methodLabel})`,
                    });
                 }
                 
                 booking.status = 'confirmed';
                 booking.payment_status = 'paid';
                 booking.webhook_processed = true;
              }
           }
        }
        return renderSuccess(booking, 'stripe_sync');
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  } catch (error: any) {
    console.error('Status Check Error:', error);
    return NextResponse.json({ error: 'Internal system error' }, { status: 500 });
  }
}

function renderSuccess(booking: any, source: string) {
  return NextResponse.json({ 
    id: booking.id,
    status: booking.status,
    payment_status: booking.payment_status,
    Ref_ID: booking.Ref_ID,
    processed: booking.webhook_processed,
    source: source
  });
}
