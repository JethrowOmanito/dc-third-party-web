import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, resetRateLimit } from '@/lib/utils';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(6).max(128),
});

export async function POST(req: NextRequest) {
  try {
    // Prefer Cloudflare's connecting-IP header — nginx trusts it and the
    // plain x-forwarded-for is client-settable if origin is reached
    // bypassing Cloudflare (would defeat the per-IP+per-username limit).
    const ip =
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-real-ip') ??
      req.headers.get('x-forwarded-for') ??
      'unknown';
    const body = await req.json();

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const { username, password } = parsed.data;
    const rateLimitKey = `login:${ip}:${username}`;

    if (!(await checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000))) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Please wait 15 minutes.' },
        { status: 429 }
      );
    }

    const supabase = await createClient();

    const { data: partner, error } = await supabase
      .from('partner_user')
      .select(
        `id, username, password_hash, email, full_name, whatsapp_phone,
         company_id, approval_status, force_logout,
         company:partner_companies!company_id (
           id, name, company_code, company_type, discount_type, discount_value, payment_terms, is_active
         )`
      )
      .eq('username', username.trim())
      .single();

    if (error || !partner) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    const passwordValid = partner.password_hash
      ? bcrypt.compareSync(password, partner.password_hash)
      : false;

    if (!passwordValid) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
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

    await resetRateLimit(rateLimitKey);

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
    if (!jwtSecret) {
      console.error('CRITICAL: JWT_SECRET environment variable is not set!');
      return NextResponse.json({ error: 'System configuration error' }, { status: 500 });
    }
    const secret = new TextEncoder().encode(jwtSecret);
    // Stamp login_at so /api/auth/me can enforce an absolute 7-day
    // lifetime across refreshes, not a rolling forever-session.
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
    console.error('Login error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
