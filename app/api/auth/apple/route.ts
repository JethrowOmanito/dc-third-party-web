import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/utils';
import { SignJWT, createRemoteJWKSet, jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-real-ip') ??
      req.headers.get('x-forwarded-for') ??
      'unknown';
    if (!(await checkRateLimit(`apple-signin:${ip}`, 20, 60 * 60 * 1000))) {
      return NextResponse.json({ error: 'Too many attempts. Please wait.' }, { status: 429 });
    }

    const servicesId = process.env.APPLE_SERVICES_ID;
    if (!servicesId) {
      return NextResponse.json(
        { error: 'Apple Sign-In is not configured. Please contact admin.' },
        { status: 501 }
      );
    }

    const body = (await req.json()) as {
      identityToken?: string;
      user?: { name?: { firstName?: string; lastName?: string }; email?: string };
    };
    const idToken = body.identityToken;
    if (!idToken) {
      return NextResponse.json({ error: 'Missing identity token' }, { status: 400 });
    }

    // Verify Apple ID token
    let payload: { sub: string; email?: string; email_verified?: boolean | string };
    try {
      const { payload: verified } = await jwtVerify(idToken, APPLE_JWKS, {
        issuer: 'https://appleid.apple.com',
        audience: servicesId,
      });
      payload = verified as typeof payload;
    } catch (err) {
      console.error('[auth/apple] token verification failed:', err);
      return NextResponse.json({ error: 'Invalid Apple credential' }, { status: 401 });
    }

    // Apple returns email + name ONLY on the very first sign-in. We prefer the token's email,
    // fall back to what the client sends (also captured on that first sign-in).
    const email = payload.email ?? body.user?.email;
    const nameFromUser = body.user?.name
      ? [body.user.name.firstName, body.user.name.lastName].filter(Boolean).join(' ')
      : undefined;

    // Apple sends email_verified as a boolean OR the string "true"/"false".
    // Normalize before trusting — an unverified email must NOT be used to
    // link into a pre-existing password account (would enable takeover of
    // legacy accounts by anyone claiming a matching email in Apple).
    const emailVerified =
      payload.email_verified === true ||
      payload.email_verified === 'true';

    const db = createAdminClient();

    // 1. Try to match by oauth_subject
    let { data: partner } = await db
      .from('partner_user')
      .select(
        `id, username, password_hash, email, full_name, whatsapp_phone, company_id, approval_status, force_logout, partner_role,
         company:partner_companies!company_id (
           id, name, company_code, company_type, discount_type, discount_value, is_active
         )`
      )
      .eq('oauth_provider', 'apple')
      .eq('oauth_subject', payload.sub)
      .maybeSingle();

    // 2. If no match, try email — but ONLY when Apple asserts the email is
    // verified. Otherwise anyone who registers an Apple ID configured with
    // a victim's email could silently link into the victim's password
    // account. Password-only rows are also refused: the user must sign in
    // with password first and then explicitly link Apple (see below).
    if (!partner && email && emailVerified) {
      const { data: byEmail } = await db
        .from('partner_user')
        .select(
          `id, username, password_hash, email, full_name, whatsapp_phone, company_id, approval_status, force_logout, oauth_provider, oauth_subject, partner_role,
           company:partner_companies!company_id (
             id, name, company_code, company_type, discount_type, discount_value, is_active
           )`
        )
        .ilike('email', email)
        .maybeSingle();

      if (byEmail) {
        if (byEmail.oauth_provider && byEmail.oauth_subject && byEmail.oauth_subject !== payload.sub) {
          return NextResponse.json(
            { error: `This email is linked to a different ${byEmail.oauth_provider} account.` },
            { status: 409 }
          );
        }
        // Refuse to silently link into a password-only account — return
        // 409 with a clear message so the user logs in with password
        // first, then links Apple from their profile.
        if (byEmail.password_hash && !byEmail.oauth_provider) {
          return NextResponse.json(
            {
              error:
                'An account already exists with this email. Please log in with your password first, then link Apple from your account settings.',
              errorCode: 'password_account_exists',
            },
            { status: 409 }
          );
        }
        await db
          .from('partner_user')
          .update({
            oauth_provider: 'apple',
            oauth_subject: payload.sub,
            updated_at: new Date().toISOString(),
          })
          .eq('id', byEmail.id);
        partner = byEmail as unknown as typeof partner;
      }
    }

    // 3. No match → prompt signup with what Apple gave us
    if (!partner) {
      return NextResponse.json(
        {
          needsSignup: true,
          prefill: {
            email: email ?? '',
            full_name: nameFromUser ?? '',
            oauth_provider: 'apple',
            oauth_subject: payload.sub,
          },
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
      approval_status: partner.approval_status as 'pending' | 'approved' | 'rejected',
      partner_role: ((partner as { partner_role?: string | null }).partner_role ?? null) as 'interior_designer' | 'agent' | 'other' | null,
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
    console.error('[auth/apple] unexpected:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
