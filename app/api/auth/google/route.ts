import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/utils';
import { SignJWT, createRemoteJWKSet, jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-real-ip') ??
      req.headers.get('x-forwarded-for') ??
      'unknown';
    if (!(await checkRateLimit(`google-signin:${ip}`, 20, 60 * 60 * 1000))) {
      return NextResponse.json({ error: 'Too many attempts. Please wait.' }, { status: 429 });
    }

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { error: 'Google Sign-In is not configured. Please contact admin.' },
        { status: 501 }
      );
    }

    const { credential } = (await req.json()) as { credential?: string };
    if (!credential) {
      return NextResponse.json({ error: 'Missing credential' }, { status: 400 });
    }

    // Verify Google ID token
    let payload: {
      sub: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
    };
    try {
      const { payload: verified } = await jwtVerify(credential, GOOGLE_JWKS, {
        issuer: ['accounts.google.com', 'https://accounts.google.com'],
        audience: clientId,
      });
      payload = verified as typeof payload;
    } catch (err) {
      console.error('[auth/google] token verification failed:', err);
      return NextResponse.json({ error: 'Invalid Google credential' }, { status: 401 });
    }

    if (!payload.email || !payload.email_verified) {
      return NextResponse.json(
        { error: 'Your Google account email must be verified.' },
        { status: 400 }
      );
    }

    const db = createAdminClient();

    // 1. Try to match by oauth_provider + oauth_subject (returning user)
    let { data: partner } = await db
      .from('partner_user')
      .select(
        `id, username, password_hash, email, full_name, whatsapp_phone, company_id, approval_status, force_logout,
         company:partner_companies!company_id (
           id, name, company_code, company_type, discount_type, discount_value, is_active
         )`
      )
      .eq('oauth_provider', 'google')
      .eq('oauth_subject', payload.sub)
      .maybeSingle();

    // 2. If no direct match, try to link by email (existing password user or legacy row)
    if (!partner) {
      const { data: byEmail } = await db
        .from('partner_user')
        .select(
          `id, username, password_hash, email, full_name, whatsapp_phone, company_id, approval_status, force_logout, oauth_provider, oauth_subject,
           company:partner_companies!company_id (
             id, name, company_code, company_type, discount_type, discount_value, is_active
           )`
        )
        .ilike('email', payload.email)
        .maybeSingle();

      if (byEmail) {
        // Refuse to hijack an account that's linked to another provider
        if (byEmail.oauth_provider && byEmail.oauth_subject && byEmail.oauth_subject !== payload.sub) {
          return NextResponse.json(
            { error: `This email is linked to a different ${byEmail.oauth_provider} account.` },
            { status: 409 }
          );
        }
        // Refuse to silently link into a password-only account — anyone
        // who later claims a legacy corporate mailbox could otherwise
        // take over the associated partner. Force the user to prove
        // password ownership first, then link Google from settings.
        if (byEmail.password_hash && !byEmail.oauth_provider) {
          return NextResponse.json(
            {
              error:
                'An account already exists with this email. Please log in with your password first, then link Google from your account settings.',
              errorCode: 'password_account_exists',
            },
            { status: 409 }
          );
        }
        // Link the Google identity to this account
        await db
          .from('partner_user')
          .update({
            oauth_provider: 'google',
            oauth_subject: payload.sub,
            updated_at: new Date().toISOString(),
          })
          .eq('id', byEmail.id);
        partner = byEmail as unknown as typeof partner;
      }
    }

    // 3. No match at all → tell the client to redirect to signup with pre-filled fields
    if (!partner) {
      return NextResponse.json(
        {
          needsSignup: true,
          prefill: {
            email: payload.email,
            full_name: payload.name ?? [payload.given_name, payload.family_name].filter(Boolean).join(' '),
            oauth_provider: 'google',
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
    console.error('[auth/google] unexpected:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
