// Server-authoritative event_chats writer. The wizard used to call
// supabase.from('event_chats').insert(...) directly from the browser
// with client-supplied user_id / sender_role — meaning any partner
// could impersonate a cleaner or admin in any event's chat thread.
// This route stamps user_id + sender_role from the JWT and verifies
// the partner owns (or has visibility on) the target event.

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/utils';

const schema = z.object({
  event_id: z.string().min(1).max(64),
  message: z.string().min(1).max(4_000),
});

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('dc_partner_session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!process.env.JWT_SECRET) {
      console.error('[chat/send] CRITICAL: JWT_SECRET missing');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    let payload: { id?: string; username?: string; company_id?: string | null };
    try {
      const { payload: p } = await jwtVerify(token, secret);
      payload = p as typeof payload;
    } catch {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }
    const userId = payload.id;
    const username = payload.username;
    if (!userId || !username) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const ip =
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-real-ip') ??
      req.headers.get('x-forwarded-for') ??
      'unknown';

    // Bucket per partner + per IP — chat isn't high-volume for legit use.
    if (!(await checkRateLimit(`chat:partner:${userId}`, 120, 60 * 60 * 1000))) {
      return NextResponse.json({ error: 'Too many messages. Try again later.' }, { status: 429 });
    }
    if (!(await checkRateLimit(`chat:ip:${ip}`, 240, 60 * 60 * 1000))) {
      return NextResponse.json({ error: 'Too many messages from your network.' }, { status: 429 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid message' }, { status: 400 });
    }
    const { event_id, message } = parsed.data;

    // Verify the partner owns the event, or that the event belongs to
    // their company. Prevents chatting into an unrelated partner's job
    // thread just by knowing an event UUID.
    const admin = createAdminClient();
    const { data: ev } = await admin
      .from('events')
      .select('id, owned_by_third_party, partner_company_id')
      .eq('id', event_id)
      .maybeSingle();
    if (!ev) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    const ownsEvent = ev.owned_by_third_party === userId;
    const sameCompany =
      !!payload.company_id && ev.partner_company_id === payload.company_id;
    if (!ownsEvent && !sameCompany) {
      return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
    }

    const { error: insErr } = await admin.from('event_chats').insert({
      event_id,
      user: username,
      user_id: userId,
      message,
      sender_role: 'thirdparty',
      is_read: false,
    });
    if (insErr) {
      console.error('[chat/send] insert failed:', insErr);
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[chat/send] unexpected:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
