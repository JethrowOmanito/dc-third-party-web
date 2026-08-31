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
    const ip =
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-real-ip') ??
      req.headers.get('x-forwarded-for') ??
      'unknown';
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid phone or code format' }, { status: 400 });
    }

    const phone = normalizePhone(parsed.data.phone);
    const code = parsed.data.code;

    if (!(await checkRateLimit(`wa-login:${phone}`, 20, 60 * 60 * 1000))) {
      return NextResponse.json({ error: 'Too many login attempts.' }, { status: 429 });
    }
    if (!(await checkRateLimit(`wa-login-ip:${ip}`, 40, 60 * 60 * 1000))) {
      return NextResponse.json({ error: 'Too many attempts from your device.' }, { status: 429 });
    }

    const db = createAdminClient();

    // 1. Verify the OTP code (same logic as /api/auth/otp/verify)
    const { data: otp, error: otpErr } = await db
      .from('partner_signup_otp')
      .select('id, code_hash, expires_at, attempts, verified_at')
      .eq('phone', phone)
      .is('verified_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpErr) {
      console.error('[wa-login] otp fetch error:', otpErr);
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

    // Mark OTP verified so it can't be reused
    await db
      .from('partner_signup_otp')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', otp.id);

    // 2. Look up the partner account by phone
    const { data: partner, error: pErr } = await db
      .from('partner_user')
      .select(
        `id, username, email, full_name, whatsapp_phone,
         company_id, approval_status, force_logout,
         company:partner_companies!company_id (
           name, company_code, company_type, discount_type, discount_value, payment_terms
         )`
      )
      .eq('whatsapp_phone', phone)
      .maybeSingle();

    if (pErr) {
      console.error('[wa-login] partner lookup error:', pErr);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    // No account for this phone → return a signup_token so the client can
    // continue directly into the signup wizard without asking for OTP again.
    if (!partner) {
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
      return NextResponse.json(
        {
          needsSignup: true,
          phone,
          signupToken,
          message: 'No partner account registered with this WhatsApp number.',
        },
        { status: 200 }
      );
    }

    if (partner.approval_status === 'rejected') {
      return NextResponse.json(
        { error: 'Your account application was not approved. Please contact administrator.' },
        { status: 403 }
      );
    }
    if (partner.force_logout) {
      return NextResponse.json(
        { error: 'Your account has been logged out by admin.' },
        { status: 403 }
      );
    }

    const company = Array.isArray(partner.company) ? partner.company[0] : partner.company;
    const safeUser = {
      id: partner.id,
      username: partner.username,
      name: partner.full_name ?? partner.username,
      email: partner.email ?? undefined,
      whatsapp_phone: partner.whatsapp_phone ?? undefined,
      company_id: partner.company_id,
      company_name: company?.name ?? undefined,
      company_code: company?.company_code ?? undefined,
      company_type: company?.company_type ?? undefined,
      company_discount_type: (company?.discount_type ?? null) as 'percent' | 'flat' | null,
      company_discount_value: Number(company?.discount_value ?? 0),
      company_payment_terms: (company?.payment_terms ?? null) as 'upfront' | 'end_of_month' | null,
      approval_status: partner.approval_status as 'pending' | 'approved' | 'rejected',
    };

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    const secret = new TextEncoder().encode(jwtSecret);
    const loginAt = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ ...safeUser, login_at: loginAt })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret);

    const response = NextResponse.json({ user: safeUser }, { status: 200 });
    response.cookies.set('dc_partner_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    });
    return response;
  } catch (err) {
    console.error('[wa-login] unexpected:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
