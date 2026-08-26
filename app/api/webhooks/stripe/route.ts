import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';

// Module-level singleton — avoids re-instantiating Stripe on every webhook call.
const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: (process.env.STRIPE_API_VERSION || '2026-03-25.dahlia') as any,
});

// Mark booking refunded (full) or log partial refund. Idempotent under Stripe replay.
async function markBookingRefunded(
  supabase: ReturnType<typeof createAdminClient>,
  bookingId: string,
  amountRefundedCents: number,
  isFullRefund: boolean
) {
  const db = supabase as any;
  const sgd = (amountRefundedCents / 100).toFixed(2);

  if (isFullRefund) {
    const { data: updatedRows, error } = await db
      .from('events')
      .update({ status: 'refunded', payment_status: 'refunded' })
      .eq('id', bookingId)
      .neq('status', 'refunded')
      .select('id');
    if (error) {
      console.error(`[webhook] Failed to mark booking ${bookingId} refunded:`, error);
      return;
    }
    if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
      // Already refunded — skip duplicate log.
      return;
    }
  }

  const logMsg = isFullRefund
    ? `Refunded S$${sgd} via Stripe (full refund)`
    : `Partial refund of S$${sgd} via Stripe — booking status unchanged`;
  const { error: logErr } = await db
    .from('event_logs')
    .insert({ event_id: bookingId, message: logMsg });
  if (logErr) console.error(`[webhook] Failed to insert refund log for booking ${bookingId}:`, logErr);
}

// Record each Stripe refund exactly once (dedup by refund_id PK).
// Recomputes events.refund_amount_cents from source of truth.
async function recordNewRefunds(
  supabase: ReturnType<typeof createAdminClient>,
  eventId: string,
  chargeId: string
): Promise<number> {
  const db = supabase as any;
  let refundList: Stripe.ApiList<Stripe.Refund>;
  try {
    refundList = await stripeClient.refunds.list({ charge: chargeId, limit: 100 });
  } catch (e) {
    console.error('[webhook] failed to list refunds for charge', chargeId, e);
    return 0;
  }

  let newlyAddedCents = 0;
  for (const rf of refundList.data) {
    if (rf.status !== 'succeeded') continue;
    const { data: inserted, error: insErr } = await db
      .from('stripe_refund_events')
      .insert({ refund_id: rf.id, event_id: eventId, amount_cents: rf.amount })
      .select('refund_id');
    if (insErr) {
      // 23505 = unique_violation — refund already recorded, expected on replay.
      if ((insErr as any).code !== '23505') {
        console.error('[webhook] failed to record refund', rf.id, insErr);
      }
      continue;
    }
    if (Array.isArray(inserted) && inserted.length > 0) {
      newlyAddedCents += rf.amount;
    }
  }

  if (newlyAddedCents > 0) {
    const { data: allRefunds } = await db
      .from('stripe_refund_events')
      .select('amount_cents')
      .eq('event_id', eventId);
    const totalCents = (allRefunds ?? []).reduce(
      (s: number, r: any) => s + (r.amount_cents ?? 0),
      0
    );
    const { error: totalErr } = await db
      .from('events')
      .update({ refund_amount_cents: totalCents })
      .eq('id', eventId);
    if (totalErr) console.error('[webhook] failed to update refund_amount_cents', totalErr);
  }

  return newlyAddedCents;
}

// Helper: Mark booking as paid and log it
async function markBookingPaid(supabase: ReturnType<typeof createAdminClient>, bookingId: string, paymentIntentId: string, paymentMethod: string) {
  // Idempotency: Check if already processed
  const { data: existing } = await supabase
    .from('events')
    .select('webhook_processed')
    .eq('id', bookingId)
    .single();

  if (existing?.webhook_processed) {
    console.log(`Booking ${bookingId} already processed. Skipping duplicate webhook.`);
    return { alreadyProcessed: true };
  }

  // Update the existing pending booking to active (do NOT overwrite Note)
  const updatePayload: any = {
    lifecycle_state: 'active',
    status: 'confirmed',
    payment_status: 'paid',
    payment_date: new Date().toISOString(),
    webhook_processed: true,
  };

  // CLEAN UP THE NOTE FIELD: Aggressively remove any "Paid via Stripe" text
  const { data: currentBooking } = await supabase.from('events').select('"Note"').eq('id', bookingId).single();
  if (currentBooking && currentBooking.Note) {
     const cleanedNote = currentBooking.Note.replace(/.*Paid via Stripe.*/gi, '').trim();
     updatePayload.Note = cleanedNote;
  }

  const { error: updateError } = await supabase.from('events')
    .update(updatePayload)
    .eq('id', bookingId);

  if (updateError) {
    console.error('Error updating event from webhook:', updateError);
    return { error: updateError };
  }

  // Write to event_logs instead of the Note field
  await supabase.from('event_logs').insert({
    event_id: bookingId,
    message: `Status: Paid via Stripe (${paymentMethod})`,
  });

  // Trigger email confirmation after successful DB update
  try {
    const emailRes = await fetch(`https://agyzvknaqnamaoczxgsb.functions.supabase.co/send-job-created-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({ event_id: bookingId }),
    });

    if (!emailRes.ok) {
      const errorText = await emailRes.text();
      console.error('Email function returned an error:', errorText);
    } else {
      console.log('Email confirmation triggered successfully for booking:', bookingId);
    }
  } catch (emailError) {
    console.error('Failed to trigger email confirmation from webhook:', emailError);
  }

  // Fire WhatsApp booking confirmation. Fetches the fresh booking row so we have
  // all the fields the template needs. Fire-and-forget — webhook must respond fast.
  try {
    const { data: pb } = await (supabase as any)
      .from('events')
      .select('"Name","Whatsapp_Number","Title","Start_Date","Start_Time_Display","End_Time_Display","Service_Type","service_subtype","final_price","Ref_ID"')
      .eq('id', bookingId)
      .maybeSingle();
    if (pb) {
      await sendBookingConfirmationWhatsApp(pb, bookingId, pb.Ref_ID);
    }
  } catch (waErr) {
    console.error('[webhook] whatsapp confirmation failed:', waErr);
  }

  return { success: true };
}

// ─── WhatsApp booking confirmation ─────────────────────────────────────────
// Ported from booking-web. Sends the `booking_confirmation` template via the
// send-whatsapp-notification edge function, with atomic claim to prevent
// duplicates when Stripe replays webhooks.
async function sendBookingConfirmationWhatsApp(
  pb: any,
  eventId: string,
  refId: number | string | null | undefined
) {
  const rawPhone = pb?.Whatsapp_Number;
  if (!rawPhone) return; // No WhatsApp number captured — skip silently.

  // Normalize to E.164 without leading +. Meta rejects the + prefix.
  const to = String(rawPhone).replace(/\D/g, '');
  if (!to) return;

  const service = String(pb?.Service_Type ?? '').toLowerCase();
  const isHousekeeping = service.includes('housekeeping');

  // Human-readable service name for the template.
  const serviceDisplay = pb?.Service_Type === 'Float'
    ? (pb?.service_subtype ? `Deep Cleaning (${pb.service_subtype})` : 'Deep Cleaning')
    : (pb?.Service_Type ?? 'Cleaning');

  const startDisplay = pb?.Start_Time_Display ?? '';
  const endDisplay = pb?.End_Time_Display ?? '';
  const timeParam = isHousekeeping && startDisplay && endDisplay
    ? `${startDisplay} - ${endDisplay}`
    : (startDisplay && endDisplay ? `${startDisplay} - ${endDisplay}` : (startDisplay || endDisplay || 'TBD'));

  const totalSgd = pb?.final_price != null ? Number(pb.final_price).toFixed(2) : '0.00';
  const bookingRef = refId != null ? `DC-${String(refId).toUpperCase()}` : 'DC-BOOKING';
  const templateName = 'booking_confirmation';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole || !eventId) return;

  // Atomically claim the notification slot BEFORE calling Meta. Only proceed
  // if we're the first request to flip the flag; concurrent webhook replays
  // (payment_intent.succeeded + charge.succeeded) short-circuit here.
  const claimRes = await fetch(
    `${supabaseUrl}/rest/v1/events?id=eq.${eventId}&whatsapp_notified=is.false`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ whatsapp_notified: true }),
    }
  ).catch(() => null);

  if (!claimRes || !claimRes.ok) {
    console.error('[webhook] whatsapp claim PATCH failed:', claimRes?.status);
    return;
  }
  const claimedRows = await claimRes.json().catch(() => []);
  if (!Array.isArray(claimedRows) || claimedRows.length === 0) {
    console.log('[webhook] whatsapp confirmation already sent for', eventId);
    return;
  }

  // 7 params for the approved `booking_confirmation` template:
  // customer, booking_id, address, date, time, service, total_sgd
  const params = [
    pb?.Name ?? 'Customer',
    bookingRef,
    pb?.Title ?? '',
    pb?.Start_Date ?? '',
    timeParam,
    serviceDisplay,
    totalSgd,
  ];

  const res = await fetch(
    `${supabaseUrl}/functions/v1/send-whatsapp-notification`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRole}`,
      },
      body: JSON.stringify({
        to,
        type: 'template',
        templateName,
        templateLanguage: 'en_US',
        templateParams: [
          {
            type: 'body',
            parameters: params.map((text) => ({ type: 'text', text: String(text) })),
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    console.error('[webhook] whatsapp confirmation error:', res.status, body);
    // Rollback the claim so a retry can send.
    await fetch(`${supabaseUrl}/rest/v1/events?id=eq.${eventId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ whatsapp_notified: false }),
    }).catch(() => {});
    return;
  }
  console.log('[webhook] whatsapp confirmation sent to', to, 'for booking', bookingRef);
}

export async function POST(req: Request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: (process.env.STRIPE_API_VERSION || '2026-03-25.dahlia') as any,
  });
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET as string;

  const body = await req.text();
  const signature = (await headers()).get('stripe-signature') as string;

  let event: Stripe.Event;

  if (!webhookSecret) {
    console.error('CRITICAL: STRIPE_WEBHOOK_SECRET is not set in environment variables! Webhook signature verification will fail.');
  }

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}. Ensure STRIPE_WEBHOOK_SECRET matches your Stripe CLI or Dashboard secret.`);
    return NextResponse.json({ error: 'Webhook Error' }, { status: 400 });
  }

  const supabase = createAdminClient();

  console.log(`[Webhook] Event type: ${event.type}`);

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const { bookingId } = paymentIntent.metadata;

    if (!bookingId) {
      console.error('[Webhook] Missing bookingId in metadata');
      return NextResponse.json({ error: 'Missing Metadata' }, { status: 400 });
    }

    // Detect payment method more robustly
    let methodLabel = 'Card';
    const charge = paymentIntent.latest_charge as any;
    
    // Priority 1: Check actual charge details
    if (typeof charge === 'object' && charge?.payment_method_details?.type) {
       const pmType = charge.payment_method_details.type;
       methodLabel = pmType === 'paynow' ? 'PayNow' : 
                     pmType === 'grabpay' ? 'GrabPay' : 
                     pmType === 'card' ? 'Card' : pmType.charAt(0).toUpperCase() + pmType.slice(1);
    } 
    // Priority 2: Fallback to payment_method_types
    else if (paymentIntent.payment_method_types?.length) {
       if (paymentIntent.payment_method_types.includes('paynow')) methodLabel = 'PayNow';
       else if (paymentIntent.payment_method_types.includes('grabpay')) methodLabel = 'GrabPay';
    }

    console.log(`Payment succeeded for booking: ${bookingId} via ${methodLabel}`);

    const result = await markBookingPaid(supabase, bookingId, paymentIntent.id, methodLabel);
    if (result?.error) {
      await supabase.from('event_logs').insert({
        event_id: bookingId,
        message: `System: Webhook FAILED to mark as paid. Error: ${JSON.stringify(result.error)}`,
      });
    }
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    const intentId = typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : (charge.payment_intent as any)?.id;

    if (intentId) {
      const { data: booking } = await supabase
        .from('events')
        .select('id')
        .eq('stripe_payment_intent_id', intentId)
        .maybeSingle();

      if (booking) {
        const isFullRefund =
          (charge as any).refunded === true ||
          (charge.amount_refunded ?? 0) >= charge.amount;

        // Record each refund exactly once, and update events.refund_amount_cents
        await recordNewRefunds(supabase, booking.id, charge.id);
        await markBookingRefunded(supabase, booking.id, charge.amount_refunded ?? 0, isFullRefund);

        console.log(
          `[Webhook] charge.refunded: booking ${booking.id}, amount ${charge.amount_refunded}, full=${isFullRefund}`
        );
      } else {
        console.log(`[Webhook] Refund received but no booking found for intent ${intentId}`);
      }
    }
  }

  if (event.type === 'charge.succeeded') {
    const charge = event.data.object as Stripe.Charge;
    const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;

    if (intentId) {
      // Look up the booking by the linked payment intent
      const { data: booking } = await supabase
        .from('events')
        .select('id, webhook_processed')
        .eq('stripe_payment_intent_id', intentId)
        .single();

      if (booking) {
        if (!booking.webhook_processed) {
          const pmType = charge.payment_method_details?.type || 'card';
          const methodLabel = pmType === 'grabpay' ? 'GrabPay' : pmType === 'paynow' ? 'PayNow' : 'Card';
          
          console.log(`[Webhook] Fallback charge.succeeded for booking: ${booking.id} via ${methodLabel}`);
          const result = await markBookingPaid(supabase, booking.id, intentId, methodLabel);
          if (result?.error) {
            await supabase.from('event_logs').insert({
              event_id: booking.id,
              message: `System: Webhook Fallback FAILED. Error: ${JSON.stringify(result.error)}`,
            });
          }
        }
      } else {
         console.log(`[Webhook] Charge received but no booking found for intent ${intentId}`);
      }
    }
  }

  return NextResponse.json({ received: true });
}
