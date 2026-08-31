import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/utils';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';

export async function GET(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: (process.env.STRIPE_API_VERSION || '2026-03-25.dahlia') as any,
  });
  try {
    // Previously read `userId` from the query string and trusted it — any
    // caller could pass any partner UUID and read that partner's recent
    // bookings, plus trigger billable Stripe intent retrievals. Now the
    // partner is derived from the verified JWT and the query string is
    // ignored.
    const cookieStore = await cookies();
    const token = cookieStore.get('dc_partner_session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!process.env.JWT_SECRET) {
      console.error('[recent-success] CRITICAL: JWT_SECRET missing');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    let userId: string | undefined;
    try {
      const { payload } = await jwtVerify(token, secret);
      userId = (payload as { id?: string }).id;
    } catch {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Per-partner throttle. Dashboard polls every 5s = 12/min; cap at 30/min
    // so a runaway tab or a script can't amplify the Stripe fan-out below.
    if (!(await checkRateLimit(`recent-success:${userId}`, 30, 60_000))) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const supabase = createAdminClient();

    // Look for confirmed bookings in the last 5 minutes
    // We check updated_at to catch the moment it was confirmed by webhook
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('events')
      .select('id, Ref_ID, status, stripe_payment_intent_id')
      .eq('owned_by_third_party', userId)
      .eq('status', 'confirmed')
      // Try updated_at first, fall back to created_at logic if needed internally in query
      .gte('updated_at', fiveMinutesAgo)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
       console.error('[RecentSuccess] Query Error:', error);
       // Fallback to searching without updated_at if the column doesn't exist?
       // For now, assume it exists as per common patterns.
       throw error;
    }

    if (data && data.length > 0) {
      return NextResponse.json(
        { booking: data[0] },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    // BACKGROUND SYNC FOR ASYNC PAYMENTS (e.g. PayNow)
    // If the user returned to the dashboard while waiting for a payment, we actively poll Stripe here.
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: pending } = await supabase
      .from('events')
      .select('id, Ref_ID, stripe_payment_intent_id')
      .eq('owned_by_third_party', userId)
      .eq('status', 'pending')
      .not('stripe_payment_intent_id', 'is', null)
      .gte('created_at', fifteenMinutesAgo);

    if (pending && pending.length > 0) {
       // Cap the Stripe amplification. A partner with 20 abandoned intents used
       // to trigger 20 sequential Stripe API calls per dashboard poll (every 5s);
       // 3 is enough to sync a legitimate in-flight PayNow/GrabPay flow.
       const capped = pending.slice(0, 3);
       for (const p of capped) {
          try {
             const intent = await stripe.paymentIntents.retrieve(p.stripe_payment_intent_id);
             if (intent.status === 'succeeded') {
                const charge = intent.latest_charge as any;
                const pmType = typeof charge === 'object' ? charge?.payment_method_details?.type : (intent.payment_method_types?.[0] || 'card');
                const methodLabel = pmType === 'grabpay' ? 'GrabPay' : pmType === 'paynow' ? 'PayNow' : 'Card';

                await supabase.from('events').update({
                   status: 'confirmed',
                   payment_status: 'paid',
                   payment_date: new Date().toISOString(),
                   lifecycle_state: 'active',
                   webhook_processed: true,
                }).eq('id', p.id);

                await supabase.from('event_logs').insert({
                   event_id: p.id,
                   message: `Status: Paid via Stripe`,
                });

                // Return this one so they get redirected to success page!
                return NextResponse.json(
                  { booking: { id: p.id, Ref_ID: p.Ref_ID, stripe_payment_intent_id: p.stripe_payment_intent_id } },
                  { headers: { 'Cache-Control': 'private, no-store' } }
                );
             }
          } catch (e) {
             Sentry.captureException(e, {
               tags: { route: 'bookings/recent-success', op: 'stripe.retrieve' },
               extra: { intentId: p.stripe_payment_intent_id, bookingId: p.id },
             });
          }
       }
    }

    return NextResponse.json(
      { booking: null },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'bookings/recent-success' } });
    return NextResponse.json({ error: 'Failed to check recent bookings' }, { status: 500 });
  }
}
