import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/utils';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('dc_partner_session')?.value;

    if (!token) {
      return NextResponse.json({ error: 'No session' }, { status: 401 });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('CRITICAL: JWT_SECRET environment variable is not set!');
      return NextResponse.json({ error: 'System configuration error' }, { status: 500 });
    }

    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, secret);

    const partnerId = payload.id as string | undefined;
    if (!partnerId) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Per-partner throttle — each call runs a Supabase join + rotates the JWT.
    // 30/min is well above legitimate use (dashboard polls ~1/5s = 12/min);
    // a compromised cookie or runaway client can't amplify beyond this.
    if (!(await checkRateLimit(`me:${partnerId}`, 30, 60_000))) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // Absolute session lifetime: refuse to refresh sessions that were
    // first issued more than 7 days ago. Otherwise the /me refresh loop
    // extends the JWT by 24h on every call → an active user's session
    // could live forever, defeating the point of an expiry.
    // Legacy tokens without login_at fall back to their iat claim so
    // they cap out roughly on the same window from their original login.
    const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60;
    const loginAt =
      (typeof payload.login_at === 'number' ? payload.login_at : undefined) ??
      (typeof payload.iat === 'number' ? payload.iat : undefined);
    if (loginAt && Math.floor(Date.now() / 1000) - loginAt > SEVEN_DAYS_SEC) {
      const res = NextResponse.json(
        { error: 'Session expired. Please log in again.', errorCode: 'session_max_age' },
        { status: 401 }
      );
      res.cookies.delete('dc_partner_session');
      return res;
    }

    // Always fetch fresh state from the DB so approval flips propagate without
    // requiring a re-login. Also refreshes company_discount and company_name.
    const db = createAdminClient();
    const { data: partner, error } = await db
      .from('partner_user')
      .select(
        `id, username, email, full_name, whatsapp_phone,
         company_id, approval_status, force_logout, partner_role,
         company:partner_companies!company_id (
           name, company_code, company_type, discount_type, discount_value, payment_terms
         )`
      )
      .eq('id', partnerId)
      .single();

    if (error || !partner) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    if (partner.force_logout) {
      const res = NextResponse.json(
        { error: 'Your account has been logged out by admin.' },
        { status: 401 }
      );
      res.cookies.delete('dc_partner_session');
      return res;
    }

    const company = Array.isArray(partner.company) ? partner.company[0] : partner.company;
    const user = {
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
      partner_role: (partner.partner_role ?? null) as 'interior_designer' | 'agent' | 'other' | null,
    };

    // Rotate the JWT so subsequent requests carry the fresh approval_status.
    // This means /api/bookings/create and /api/checkout/create-intent will see
    // the updated state without needing the client to re-authenticate.
    // Preserve `login_at` from the previous token so the absolute
    // 7-day cap enforced above continues to count from the ORIGINAL
    // login, not from each refresh.
    const preservedLoginAt = loginAt ?? Math.floor(Date.now() / 1000);
    const newToken = await new SignJWT({ ...user, login_at: preservedLoginAt })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret);

    const response = NextResponse.json(
      { user },
      { status: 200, headers: { 'Cache-Control': 'private, no-store' } }
    );
    response.cookies.set('dc_partner_session', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    });
    return response;
  } catch (error) {
    console.error('[auth/me] error:', error);
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
}
