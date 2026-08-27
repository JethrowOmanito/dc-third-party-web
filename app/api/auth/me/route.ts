import { createAdminClient } from '@/lib/supabase/admin';
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

    // Always fetch fresh state from the DB so approval flips propagate without
    // requiring a re-login. Also refreshes company_discount and company_name.
    const db = createAdminClient();
    const { data: partner, error } = await db
      .from('partner_user')
      .select(
        `id, username, email, full_name, whatsapp_phone,
         company_id, approval_status, force_logout,
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
      company_payment_terms: (company?.payment_terms ?? 'upfront') as 'upfront' | 'end_of_month',
      approval_status: partner.approval_status as 'pending' | 'approved' | 'rejected',
    };

    // Rotate the JWT so subsequent requests carry the fresh approval_status.
    // This means /api/bookings/create and /api/checkout/create-intent will see
    // the updated state without needing the client to re-authenticate.
    const newToken = await new SignJWT({ ...user })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret);

    const response = NextResponse.json({ user }, { status: 200 });
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
