import { normalizePhone } from '@/lib/phone';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/utils';
import { signupSchema } from '@/lib/validations/auth.schema';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-real-ip') ??
      req.headers.get('x-forwarded-for') ??
      'unknown';
    if (!(await checkRateLimit(`signup:${ip}`, 5, 60 * 60 * 1000))) {
      return NextResponse.json({ error: 'Too many signup attempts. Please try again later.' }, { status: 429 });
    }

    const body = await req.json();
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const {
      username,
      password,
      full_name,
      email,
      whatsapp_phone,
      company_id,
      partner_role,
      signup_token,
      oauth_provider,
      oauth_subject,
    } = parsed.data;

    const usingOAuth = !!oauth_provider && !!oauth_subject;

    // Must have EITHER a password OR an OAuth identity
    if (!usingOAuth && (!password || password.length < 8)) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    // Require WhatsApp OTP verification token (proves phone ownership)
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });

    const normalizedPhone = normalizePhone(whatsapp_phone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: 'Include your country code, e.g. +65 8888 8888 or +91 99558 32189.' },
        { status: 400 }
      );
    }

    // Skip OTP requirement in dev if BYPASS_OTP=1 for testing.
    // Belt-and-braces: even if the env var is somehow set in prod (misconfig,
    // leftover from a rollback, or an attacker who reaches the VPS shell),
    // NODE_ENV gates it off. The bypass is a dev-only convenience.
    const bypassOtp =
      process.env.NODE_ENV !== 'production' &&
      process.env.PARTNER_SIGNUP_BYPASS_OTP === '1';
    if (!bypassOtp) {
      if (!signup_token) {
        return NextResponse.json(
          { error: 'Please verify your WhatsApp number first.', errorCode: 'otp_required' },
          { status: 400 }
        );
      }
      try {
        const { payload } = await jwtVerify(signup_token, new TextEncoder().encode(jwtSecret));
        if (payload.purpose !== 'partner_signup' || payload.phone !== normalizedPhone) {
          return NextResponse.json(
            { error: 'Verification token does not match your phone number.', errorCode: 'otp_mismatch' },
            { status: 400 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: 'Verification token expired. Please verify your phone again.', errorCode: 'otp_expired' },
          { status: 400 }
        );
      }
    }

    const supabase = await createClient();

    // Check username availability
    const { data: existingUsername } = await supabase
      .from('partner_user')
      .select('id')
      .eq('username', username.trim())
      .maybeSingle();
    if (existingUsername) {
      return NextResponse.json({ error: 'This username is already taken.' }, { status: 409 });
    }

    // Check email availability (email-based social login collides with existing accounts)
    const { data: existingEmail } = await supabase
      .from('partner_user')
      .select('id')
      .ilike('email', email.trim())
      .maybeSingle();
    if (existingEmail) {
      return NextResponse.json({ error: 'This email is already registered.' }, { status: 409 });
    }

    // Verify the picked company exists and is active
    const { data: company, error: coErr } = await supabase
      .from('partner_companies')
      .select('id, name, company_code, company_type, is_active, discount_type, discount_value')
      .eq('id', company_id)
      .single();
    if (coErr || !company || !company.is_active) {
      return NextResponse.json({ error: 'Selected company is not available.' }, { status: 400 });
    }

    const password_hash = password ? await bcrypt.hash(password, 12) : null;
    const now = new Date().toISOString();

    const { data: inserted, error: insErr } = await supabase
      .from('partner_user')
      .insert({
        username: username.trim(),
        password_hash,
        email: email.trim().toLowerCase(),
        full_name: full_name.trim(),
        whatsapp_phone: normalizedPhone,
        company_id,
        partner_role,
        approval_status: 'pending',
        tnc_accepted_at: now,
        wa_verified_at: bypassOtp ? null : now,
        oauth_provider: oauth_provider ?? null,
        oauth_subject: oauth_subject ?? null,
      })
      .select('id, username, email, full_name, whatsapp_phone, company_id, approval_status, partner_role')
      .single();

    if (insErr || !inserted) {
      // TOCTOU: two concurrent signups can both pass the username/email
      // pre-checks then race the insert — Postgres unique constraints
      // then reject one with error code 23505. Surface a friendly 409
      // instead of leaking the raw error or returning a 500.
      const pgCode = (insErr as { code?: string } | null)?.code;
      const msg = String((insErr as { message?: string } | null)?.message ?? '');
      if (pgCode === '23505') {
        const isEmail = /email/i.test(msg);
        const isUser = /username/i.test(msg);
        const isPhone = /whatsapp/i.test(msg) || /phone/i.test(msg);
        const which = isEmail ? 'email' : isUser ? 'username' : isPhone ? 'WhatsApp number' : 'account';
        return NextResponse.json(
          { error: `This ${which} is already registered.` , errorCode: 'duplicate' },
          { status: 409 }
        );
      }
      console.error('[signup] insert error:', insErr);
      return NextResponse.json({ error: 'Failed to create account. Please try again.' }, { status: 500 });
    }

    const safeUser = {
      id: inserted.id,
      username: inserted.username,
      name: inserted.full_name ?? inserted.username,
      email: inserted.email ?? undefined,
      whatsapp_phone: inserted.whatsapp_phone ?? undefined,
      company_id: inserted.company_id,
      company_name: company.name,
      company_code: company.company_code ?? undefined,
      company_type: company.company_type ?? undefined,
      company_discount_type: (company.discount_type ?? null) as 'percent' | 'flat' | null,
      company_discount_value: Number(company.discount_value ?? 0),
      approval_status: 'pending' as const,
      partner_role: (inserted.partner_role ?? partner_role) as 'interior_designer' | 'agent' | 'other',
    };

    const secret = new TextEncoder().encode(jwtSecret);
    const loginAt = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ ...safeUser, login_at: loginAt })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret);

    const response = NextResponse.json({ user: safeUser }, { status: 201 });
    response.cookies.set('dc_partner_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('[signup] unexpected:', err);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
