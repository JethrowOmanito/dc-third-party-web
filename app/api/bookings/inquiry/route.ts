import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/utils';

// Bounded shape — the raw endpoint used to accept arbitrary JSON, which
// let bots flood the inquiries table and potentially store XSS payloads
// that would render in the admin UI.
const schema = z.object({
  customerInfo: z.record(z.string(), z.unknown()).refine(
    (v) => JSON.stringify(v).length < 4_000,
    { message: 'customerInfo too large' }
  ),
  serviceInfo: z.record(z.string(), z.unknown()).refine(
    (v) => JSON.stringify(v).length < 4_000,
    { message: 'serviceInfo too large' }
  ),
  inquiryType: z.string().min(1).max(64),
  notes: z.string().max(2_000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Prefer Cloudflare's connecting-IP header for accurate rate-limit
    // buckets even if a request reaches origin bypassing CF.
    const ip =
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-real-ip') ??
      req.headers.get('x-forwarded-for') ??
      'unknown';

    // Require a partner session — inquiries used to be fully anonymous,
    // which made this a spam / storage-flood sink.
    const cookieStore = await cookies();
    const token = cookieStore.get('dc_partner_session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!process.env.JWT_SECRET) {
      console.error('[bookings/inquiry] CRITICAL: JWT_SECRET missing');
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

    // Two rate-limit buckets — narrow bucket per partner (stops one
    // account from spamming), broader bucket per IP (stops multiple
    // accounts from the same origin).
    if (!(await checkRateLimit(`inquiry:partner:${partnerUserId}`, 5, 60 * 60 * 1000))) {
      return NextResponse.json(
        { error: 'You have submitted many inquiries recently. Please try again later.' },
        { status: 429 }
      );
    }
    if (!(await checkRateLimit(`inquiry:ip:${ip}`, 20, 60 * 60 * 1000))) {
      return NextResponse.json(
        { error: 'Too many inquiries from your network. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid inquiry data' }, { status: 400 });
    }
    const { customerInfo, serviceInfo, inquiryType, notes } = parsed.data;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('booking_inquiries')
      .insert({
        customer_info: customerInfo,
        service_info: serviceInfo,
        inquiry_type: inquiryType,
        notes: notes ?? '',
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[bookings/inquiry] insert failed:', error);
      return NextResponse.json({ error: 'Failed to submit inquiry' }, { status: 500 });
    }

    return NextResponse.json({ success: true, inquiryId: data.id });
  } catch (err) {
    console.error('[bookings/inquiry] unexpected:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
