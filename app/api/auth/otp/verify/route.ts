import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/utils';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  phone: z.string().min(8).max(20).regex(/^[+0-9\s\-()]+$/),
  code: z.string().length(6).regex(/^\d{6}$/),
});

function normalizePhone(input: string): string {
  const cleaned = input.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (/^65\d{8}$/.test(cleaned)) return `+${cleaned}`;
  if (/^[89]\d{7}$/.test(cleaned)) return `+65${cleaned}`;
  return cleaned;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid phone or code format' }, { status: 400 });
    }

    const phone = normalizePhone(parsed.data.phone);
    const code = parsed.data.code;

    // Rate limit verify attempts per phone: 20 per hour
    if (!checkRateLimit(`otp:verify:${phone}`, 20, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many verification attempts.' }, { status: 429 });
    }
    if (!checkRateLimit(`otp:verify-ip:${ip}`, 40, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many attempts from your device.' }, { status: 429 });
    }

    const db = createAdminClient();
    const { data: otp, error: fetchErr } = await db
      .from('partner_signup_otp')
      .select('id, code_hash, expires_at, attempts, verified_at')
      .eq('phone', phone)
      .is('verified_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr) {
      console.error('[otp/verify] fetch error:', fetchErr);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
    if (!otp) {
      return NextResponse.json(
        { error: 'No pending code for this phone. Request a new one.' },
        { status: 404 }
      );
    }

    if (new Date(otp.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This code has expired. Request a new one.' }, { status: 410 });
    }
    if (otp.attempts >= 5) {
      return NextResponse.json(
        { error: 'Too many wrong attempts on this code. Request a new one.' },
        { status: 429 }
      );
    }

    const match = bcrypt.compareSync(code, otp.code_hash);
    if (!match) {
      await db
        .from('partner_signup_otp')
        .update({ attempts: otp.attempts + 1 })
        .eq('id', otp.id);
      return NextResponse.json({ error: 'Incorrect code.' }, { status: 401 });
    }

    const verifiedAt = new Date().toISOString();
    await db
      .from('partner_signup_otp')
      .update({ verified_at: verifiedAt })
      .eq('id', otp.id);

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    const secret = new TextEncoder().encode(jwtSecret);
    const signupToken = await new SignJWT({ phone, purpose: 'partner_signup' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(secret);

    return NextResponse.json({ ok: true, signupToken, phone }, { status: 200 });
  } catch (err) {
    console.error('[otp/verify] unexpected:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
