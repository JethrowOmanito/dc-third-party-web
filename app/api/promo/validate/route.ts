import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { checkRateLimit } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    // Require a partner session — unauth validators let bots enumerate
    // every valid promo code by dictionary attack.
    const cookieStore = await cookies();
    const token = cookieStore.get('dc_partner_session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!process.env.JWT_SECRET) {
      console.error('[promo/validate] CRITICAL: JWT_SECRET missing');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    let partnerUserId: string | undefined;
    try {
      const { payload } = await jwtVerify(token, secret);
      partnerUserId = (payload as { id?: string }).id;
    } catch {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }
    if (!partnerUserId) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Prefer CF-Connecting-IP; fall back sanely for local/dev.
    const ip =
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-real-ip') ??
      req.headers.get('x-forwarded-for') ??
      'unknown';

    // Per-partner + per-IP buckets — enough headroom for legitimate
    // typo-retry but small enough to make brute-forcing impractical.
    if (!(await checkRateLimit(`promo:partner:${partnerUserId}`, 20, 15 * 60 * 1000))) {
      return NextResponse.json({ error: 'Too many promo attempts. Try again later.' }, { status: 429 });
    }
    if (!(await checkRateLimit(`promo:ip:${ip}`, 60, 15 * 60 * 1000))) {
      return NextResponse.json({ error: 'Too many promo attempts from your network.' }, { status: 429 });
    }

    const { code, totalPrice } = await req.json();

    if (!code || typeof code !== 'string' || code.length > 64) {
      return NextResponse.json({ error: 'Invalid promo code.' }, { status: 400 });
    }
    if (typeof totalPrice !== 'number' || totalPrice < 0 || totalPrice > 100_000) {
      return NextResponse.json({ error: 'Invalid totalPrice.' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    const { data: promo, error } = await adminSupabase
      .from('promo_codes')
      .select('id, code, description, discount_type, discount_value, min_booking_amount, max_uses, uses_count, valid_from, valid_until, is_active')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .single();

    if (error || !promo) {
      return NextResponse.json({ valid: false, error: 'Promo code not found or inactive.' });
    }

    const now = new Date();
    if (promo.valid_from && new Date(promo.valid_from) > now) {
      return NextResponse.json({ valid: false, error: 'This promo code is not yet active.' });
    }
    if (promo.valid_until && new Date(promo.valid_until) < now) {
      return NextResponse.json({ valid: false, error: 'This promo code has expired.' });
    }
    if (promo.max_uses !== null && (promo.uses_count || 0) >= promo.max_uses) {
      return NextResponse.json({ valid: false, error: 'This promo code has reached its usage limit.' });
    }
    if (promo.min_booking_amount && totalPrice < promo.min_booking_amount) {
      return NextResponse.json({
        valid: false,
        error: `Minimum booking amount of S$${promo.min_booking_amount.toFixed(2)} required for this code.`,
      });
    }

    const discount =
      promo.discount_type === 'percentage'
        ? (totalPrice * promo.discount_value) / 100
        : promo.discount_value;

    const discountedTotal = Math.max(0, totalPrice - discount);

    return NextResponse.json({
      valid: true,
      promo: {
        id: promo.id,
        code: promo.code,
        description: promo.description,
        discount_type: promo.discount_type,
        discount_value: promo.discount_value,
        min_booking_amount: promo.min_booking_amount,
      },
      discount,
      discountedTotal,
    });
  } catch (err: any) {
    console.error('[promo-validate]', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
