// Password reset — step 1: send an OTP to the partner's registered WhatsApp.
//
// Enumeration-safe: always returns 200 whether or not the phone is registered.
// The OTP is only actually queued+delivered if a partner_user row exists for
// that phone. Rate limits and template selection reuse the existing signup
// OTP infra so an attacker can't burn the send-otp endpoint faster than they
// could burn /api/auth/otp/send.

import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/phone';
import { checkRateLimit } from '@/lib/utils';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  phone: z.string().min(8).max(20).regex(/^[+0-9\s\-()]+$/),
});

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-real-ip') ??
      req.headers.get('x-forwarded-for') ??
      'unknown';

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    const phone = normalizePhone(parsed.data.phone);
    if (!phone) {
      return NextResponse.json(
        { error: 'Include your country code, e.g. +65 8888 8888 or +91 99558 32189.' },
        { status: 400 }
      );
    }

    // Rate limit per phone: 3 sends per hour (mirrors signup OTP).
    if (!(await checkRateLimit(`pwreset:phone:${phone}`, 3, 60 * 60 * 1000))) {
      return NextResponse.json(
        { error: 'Too many reset requests for this number. Please wait an hour.' },
        { status: 429 }
      );
    }
    if (!(await checkRateLimit(`pwreset:ip:${ip}`, 10, 60 * 60 * 1000))) {
      return NextResponse.json(
        { error: 'Too many reset requests from your device. Please wait an hour.' },
        { status: 429 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    const db = createAdminClient();

    // Only send if a partner exists — but return 200 either way so a caller
    // can't fingerprint which phones are registered.
    const { data: partner } = await db
      .from('partner_user')
      .select('id, full_name, username')
      .eq('whatsapp_phone', phone)
      .maybeSingle();

    if (!partner) {
      return NextResponse.json({ ok: true, phone, expiresIn: 600 }, { status: 200 });
    }

    const code = generateCode();
    const codeHash = bcrypt.hashSync(code, 8);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insErr } = await db.from('partner_signup_otp').insert({
      phone,
      code_hash: codeHash,
      expires_at: expiresAt,
      ip: String(ip).slice(0, 60),
    });
    if (insErr) {
      console.error('[forgot-password/send-otp] insert error:', insErr);
      return NextResponse.json({ error: 'Failed to create OTP' }, { status: 500 });
    }

    const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME;
    const templateLang = process.env.WHATSAPP_OTP_TEMPLATE_LANG ?? 'en_US';
    const waPayload = templateName
      ? {
          to: phone,
          message: `${code} is your Doctor Clean password-reset code.`,
          type: 'template' as const,
          templateName,
          templateLanguage: templateLang,
          templateParams: [
            { type: 'body', parameters: [{ type: 'text', text: code }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
          ],
        }
      : {
          to: phone,
          message: `${code} is your Doctor Clean password-reset code. Expires in 10 minutes.`,
          type: 'text' as const,
        };

    const waRes = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-notification`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(waPayload),
    });
    const waBody = await waRes.json().catch(() => ({}));

    if (!waRes.ok) {
      console.error('[forgot-password/send-otp] WA delivery failed:', waBody);
      return NextResponse.json(
        { error: 'Could not send WhatsApp code. Try again or contact admin.' },
        { status: 502 }
      );
    }

    if (waBody && waBody.skipped === true) {
      const reason = String(waBody.reason ?? 'unknown');
      const userMsg =
        reason === 'duplicate_recent'
          ? 'A code was sent to your WhatsApp recently. Please check WhatsApp or wait a few minutes.'
          : `Could not send code (${reason}).`;
      const status = reason === 'duplicate_recent' ? 429 : 503;
      return NextResponse.json({ error: userMsg, errorCode: reason }, { status });
    }

    return NextResponse.json({ ok: true, phone, expiresIn: 600 }, { status: 200 });
  } catch (err) {
    console.error('[forgot-password/send-otp] unexpected:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
