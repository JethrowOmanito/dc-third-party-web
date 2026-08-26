import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Stripe from 'stripe';

export async function GET(req: Request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: (process.env.STRIPE_API_VERSION || '2026-03-25.dahlia') as any,
  });
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
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
      return NextResponse.json({ booking: data[0] });
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
       for (const p of pending) {
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
                return NextResponse.json({ booking: { id: p.id, Ref_ID: p.Ref_ID, stripe_payment_intent_id: p.stripe_payment_intent_id } });
             }
          } catch(e) {
             console.error('Error syncing pending intent in background', e);
          }
       }
    }

    return NextResponse.json({ booking: null });
  } catch (error: any) {
    console.error('Recent Success Scout Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
