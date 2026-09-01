// Password reset — step 2: verify OTP + set a new password.
//
// The OTP must have been created by /api/auth/forgot-password/send-otp for
// this exact phone. After a successful reset, we set force_logout = true so
// any stolen sessions are kicked on their next /api/auth/me refresh. The
// user still has to log in with the new password.

import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/phone';
import { checkRateLimit } from '@/lib/utils';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  phone: z.string().min(8).max(20).regex(/^[+0-9\s\-()]+$/),
  code: z.string().length(6).regex(/^\d{6}$/),
  new_password: z.string().min(8).max(128),
});

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
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }

    const phone = normalizePhone(parsed.data.phone);
    if (!phone) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }
    const { code, new_password } = parsed.data;

    if (!(await checkRateLimit(`pwreset-verify:phone:${phone}`, 10, 60 * 60 * 1000))) {
      return NextResponse.json({ error: 'Too many reset attempts. Try again later.' }, { status: 429 });
    }
    if (!(await checkRateLimit(`pwreset-verify:ip:${ip}`, 20, 60 * 60 * 1000))) {
      return NextResponse.json({ error: 'Too many attempts from your device.' }, { status: 429 });
    }

    const db = createAdminClient();

    // Grab the newest unverified OTP for this phone.
    const { data: otp, error: otpErr } = await db
      .from('partner_signup_otp')
      .select('id, code_hash, expires_at, attempts, verified_at')
      .eq('phone', phone)
      .is('verified_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpErr) {
      console.error('[forgot-password/reset] otp fetch:', otpErr);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
    if (!otp) {
      return NextResponse.json({ error: 'No pending code. Request a new one.' }, { status: 404 });
    }
    if (new Date(otp.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This code has expired. Request a new one.' }, { status: 410 });
    }
    if (otp.attempts >= 5) {
      return NextResponse.json({ error: 'Too many wrong attempts. Request a new one.' }, { status: 429 });
    }

    const match = bcrypt.compareSync(code, otp.code_hash);
    if (!match) {
      await db.from('partner_signup_otp').update({ attempts: otp.attempts + 1 }).eq('id', otp.id);
      return NextResponse.json({ error: 'Incorrect code.' }, { status: 401 });
    }

    // OTP is valid. Look up the partner and update their password.
    const { data: partner } = await db
      .from('partner_user')
      .select('id, username')
      .eq('whatsapp_phone', phone)
      .maybeSingle();

    if (!partner) {
      // The OTP was valid but no partner exists for this phone. Consume the
      // OTP so it can't be reused, and tell the caller to sign up instead.
      await db.from('partner_signup_otp').update({ verified_at: new Date().toISOString() }).eq('id', otp.id);
      return NextResponse.json(
        { error: 'No account found for this WhatsApp number. Please sign up instead.' },
        { status: 404 }
      );
    }

    const passwordHash = await bcrypt.hash(new_password, 12);
    const now = new Date().toISOString();

    const [{ error: updErr }, _] = await Promise.all([
      db.from('partner_user')
        .update({ password_hash: passwordHash, force_logout: true, updated_at: now })
        .eq('id', partner.id),
      db.from('partner_signup_otp')
        .update({ verified_at: now })
        .eq('id', otp.id),
    ]);
    void _;

    if (updErr) {
      console.error('[forgot-password/reset] password update failed:', updErr);
      return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
    }

    console.info(`[forgot-password/reset] password reset for username=${partner.username}`);

    return NextResponse.json({ ok: true, username: partner.username }, { status: 200 });
  } catch (err) {
    console.error('[forgot-password/reset] unexpected:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
