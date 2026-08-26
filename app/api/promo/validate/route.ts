import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const { code, totalPrice } = await req.json();

    if (!code || typeof totalPrice !== 'number') {
      return NextResponse.json({ error: 'code and totalPrice are required.' }, { status: 400 });
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
