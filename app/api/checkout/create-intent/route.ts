import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: (process.env.STRIPE_API_VERSION || '2026-03-25.dahlia') as any,
  });
  try {
    // 1. FORTRESS: Custom JWT Authentication Guard
    const cookieStore = await cookies();
    const token = cookieStore.get('dc_partner_session')?.value;
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'doctor-clean-partner-secret-well-change-this-soon');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized: Please log in to pay.' }, { status: 401 });
    }

    let user: any;
    try {
      const { payload } = await jwtVerify(token, secret);
      user = payload;
    } catch (err) {
      console.error('[Stripe Intent] JWT verification failed:', err);
      return NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 });
    }

    // 1b. Approval gate — pending or rejected partners cannot pay
    if (user.approval_status && user.approval_status !== 'approved') {
      return NextResponse.json(
        {
          error:
            user.approval_status === 'pending'
              ? 'Your account is pending admin approval. Bookings are disabled until approved.'
              : 'Your account is not approved. Please contact administrator.',
          errorCode: 'partner_not_approved',
        },
        { status: 403 }
      );
    }

    const { bookingId, customerEmail } = await req.json();

    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId is required.' }, { status: 400 });
    }

    // 2. FORTRESS: Ownership & Price Integrity
    // We fetch the booking using Admin client to ensure we get the "Real" price from the server
    const adminSupabase = createAdminClient();
    const { data: booking, error: bError } = await adminSupabase
      .from('events')
      .select('id, amount_cents, owned_by_third_party, status, stripe_payment_intent_id')
      .eq('id', bookingId)
      .single();

    if (bError || !booking) {
      console.error('[Stripe Intent] Booking lookup failed:', { bookingId, bError });
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
    }

    // Security Check: Does the logged-in user own this booking?
    if (booking.owned_by_third_party !== user.id) {
      return NextResponse.json({ error: 'Security Violation: You do not own this booking.' }, { status: 403 });
    }

    // Security Check: Is it already confirmed?
    if (booking.status === 'confirmed') {
      return NextResponse.json({ error: 'This booking is already paid and confirmed.' }, { status: 400 });
    }

    // 3. FORTRESS: Protect against Price Tampering
    // We use the amount_cents from the database, NOT the amount_cents from the client request!
    const secureAmount = booking.amount_cents;
    if (!secureAmount || secureAmount <= 0) {
       return NextResponse.json({ error: 'Invalid booking amount. Please contact support.' }, { status: 400 });
    }

    // 4. Reuse existing intent if already linked (idempotency — avoids duplicate intents on retry)
    const existingIntentId = (booking as any).stripe_payment_intent_id;
    if (existingIntentId) {
      try {
        const existing = await stripe.paymentIntents.retrieve(existingIntentId);
        const reusable = !['canceled', 'succeeded'].includes(existing.status);
        // Reuse only if the amount hasn't changed (add-on toggled after last attempt)
        if (reusable && existing.amount === secureAmount) {
          return NextResponse.json({ client_secret: existing.client_secret, id: existing.id });
        }
        // Otherwise cancel the stale one so we can create fresh
        if (reusable) {
          try { await stripe.paymentIntents.cancel(existing.id); } catch {}
        }
      } catch (retrieveErr) {
        console.warn('[Stripe Intent] Failed to retrieve existing intent, creating new one:', retrieveErr);
      }
    }

    // 5. Create Payment Intent — use automatic_payment_methods so Stripe picks the right ones
    // per region and dashboard settings (card / PayNow / GrabPay / Apple Pay / Google Pay).
    // No idempotency key — we handle dedup via DB reuse logic above; a sticky key would
    // return a canceled intent forever if the first attempt failed to link.
    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: secureAmount,
        currency: 'sgd',
        automatic_payment_methods: { enabled: true },
        receipt_email: (customerEmail || (user as any).email) as string | undefined,
        // Human-readable description shown on Stripe dashboard, receipts, and some wallets.
        description: `Doctor Clean — Partner Booking #${String(bookingId).slice(0, 8).toUpperCase()}`,
        // Statement descriptor suffix (appended to the account-level prefix on card statements). Max 22 chars total.
        statement_descriptor_suffix: 'DC PARTNER',
        metadata: {
          bookingId: bookingId,
          userId: String(user.id ?? ''),
          source: 'doctor_clean_partner_web',
          partnerName: String((user as any).company_name || (user as any).username || 'Partner').slice(0, 80),
        },
      });
    } catch (stripeErr: any) {
      console.error('[Stripe Intent] paymentIntents.create failed:', {
        bookingId,
        secureAmount,
        stripeType: stripeErr?.type,
        stripeCode: stripeErr?.code,
        stripeMessage: stripeErr?.message,
      });
      return NextResponse.json(
        { error: `Stripe: ${stripeErr?.message || 'payment initialization failed.'}` },
        { status: 500 }
      );
    }

    // 6. Link intent to booking so the webhook can find it
    const { error: linkError } = await adminSupabase
      .from('events')
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq('id', bookingId);

    if (linkError) {
      console.error('[Stripe Intent] DB Link Error:', linkError);
      // Best-effort cancel so we don't leak an unlinked intent
      try { await stripe.paymentIntents.cancel(paymentIntent.id); } catch {}
      return NextResponse.json({ error: 'Failed to initialize payment. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({
      client_secret: paymentIntent.client_secret,
      id: paymentIntent.id,
    });
  } catch (error: any) {
    console.error('[Stripe Intent] Unhandled error:', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
    });
    return NextResponse.json(
      { error: error?.message ? `Init failed: ${error.message}` : 'Payment initialization failed. Please try again.' },
      { status: 500 }
    );
  }
}
