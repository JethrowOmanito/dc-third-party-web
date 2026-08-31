// Server endpoint for the "chat inquiry" flow — the partner clicks the
// chat-inquiry option in the booking wizard and we insert a placeholder
// `events` row so the ensuing chat has something to attach to.
//
// This route replaces a client-side `supabase.from('events').insert(...)`
// that used the anon key and let the browser pass its own `Price`,
// `owned_by_third_party`, and `source`. Every security-relevant column
// is now overridden with server-truth values from JWT + DB.

import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/utils';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';

const schema = z.object({
  Title: z.string().max(500),
  Name: z.string().max(200).optional(),
  Email: z.string().max(200).optional(),
  Whatsapp_Number: z.string().max(40).optional(),
  Start_Date: z.string().max(20).nullable().optional(),
  Service_Type: z.string().max(64).optional(),
  Note: z.string().max(4_000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('dc_partner_session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!process.env.JWT_SECRET) {
      console.error('[inquiry-chat] CRITICAL: JWT_SECRET missing');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    let jwtUser: { id?: string };
    try {
      const { payload } = await jwtVerify(token, secret);
      jwtUser = payload as { id?: string };
    } catch {
      return NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 });
    }
    const partnerUserId = jwtUser.id;
    if (!partnerUserId) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Share the same booking-create budget so chat-inquiry can't be used
    // as an unlimited insert side-channel around the /api/bookings/submit
    // rate limit.
    if (!(await checkRateLimit(`booking-create:${partnerUserId}`, 20, 60 * 60 * 1000))) {
      return NextResponse.json(
        { error: 'Too many bookings created recently. Please wait a bit.' },
        { status: 429 }
      );
    }

    const admin = createAdminClient();
    const { data: partner, error: pErr } = await admin
      .from('partner_user')
      .select('id, approval_status, force_logout, company_id')
      .eq('id', partnerUserId)
      .single();
    if (pErr || !partner) {
      return NextResponse.json({ error: 'Session partner not found' }, { status: 401 });
    }
    if (partner.force_logout) {
      return NextResponse.json(
        { error: 'Your account has been logged out by admin.', errorCode: 'force_logout' },
        { status: 403 }
      );
    }
    if (partner.approval_status !== 'approved') {
      return NextResponse.json(
        {
          error:
            partner.approval_status === 'pending'
              ? 'Your account is pending admin approval. Bookings are disabled until approved.'
              : 'Your account is not approved. Please contact administrator.',
          errorCode: 'partner_not_approved',
        },
        { status: 403 }
      );
    }
    if (!partner.company_id) {
      return NextResponse.json(
        { error: 'Your account is not linked to a company. Please contact admin.' },
        { status: 403 }
      );
    }

    const raw = await req.json().catch(() => null);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid inquiry data' }, { status: 400 });
    }
    const body = parsed.data;

    const row = {
      Title: body.Title,
      Name: body.Name ?? null,
      Email: body.Email ?? null,
      Whatsapp_Number: body.Whatsapp_Number ?? null,
      Start_Date: body.Start_Date ?? null,
      Service_Type: body.Service_Type ?? null,
      Note: body.Note ?? null,
      Assign_Cleaner: [],
      // ─── Server-authoritative ───
      Price: 0,
      status: 'pending',
      lifecycle_state: 'active',
      source: 'ID',
      owned_by_third_party: partnerUserId,
      partner_company_id: partner.company_id,
    };

    const { data: event, error: insErr } = await admin
      .from('events')
      .insert(row)
      .select('id')
      .single();

    if (insErr || !event) {
      Sentry.captureException(insErr, {
        tags: { route: 'bookings/inquiry-chat', op: 'events.insert' },
        extra: { partnerUserId },
      });
      return NextResponse.json({ error: 'Failed to initialize chat' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: event.id }, { status: 201 });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'bookings/inquiry-chat' } });
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
