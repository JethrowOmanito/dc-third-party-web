import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    // Was fully unauthenticated → any caller could pass any event_id and
    // trigger the confirmation email edge function, spamming customers
    // with (real) Doctor Clean emails. Now: partner must be logged in AND
    // own the event. Also throttled per partner.
    const cookieStore = await cookies();
    const token = cookieStore.get('dc_partner_session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!process.env.JWT_SECRET) {
      console.error('[bookings/confirm] CRITICAL: JWT_SECRET missing');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    let partnerUserId: string | undefined;
    try {
      const { payload } = await jwtVerify(token, secret);
      partnerUserId = (payload as { id?: string }).id;
    } catch {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }
    if (!partnerUserId) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    if (!(await checkRateLimit(`confirm:partner:${partnerUserId}`, 30, 60 * 60 * 1000))) {
      return NextResponse.json({ error: 'Too many confirmations. Try again later.' }, { status: 429 });
    }

    const { event_id } = await req.json().catch(() => ({} as { event_id?: string }));
    if (!event_id || typeof event_id !== 'string') {
      return NextResponse.json({ error: 'event_id is required' }, { status: 400 });
    }

    // Ownership check — the partner must own the event they're
    // requesting a confirmation email for.
    const admin = createAdminClient();
    const { data: ev } = await admin
      .from('events')
      .select('id, owned_by_third_party')
      .eq('id', event_id)
      .single();
    if (!ev || ev.owned_by_third_party !== partnerUserId) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error('[bookings/confirm] Supabase env missing');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const res = await fetch(`https://agyzvknaqnamaoczxgsb.functions.supabase.co/send-job-created-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ event_id }),
    });

    if (!res.ok) {
      console.error('[bookings/confirm] edge fn failed:', await res.text().catch(() => ''));
      return NextResponse.json({ error: 'Failed to send confirmation email' }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[bookings/confirm] unexpected:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
