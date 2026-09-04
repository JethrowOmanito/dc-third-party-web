// GET /api/pricing?brand=tcc | doctor_clean_id | agents
//
// Returns pricing catalog rows for the booking wizard. Routing pricing through
// the server (rather than letting the client hit Supabase directly) keeps the
// brand→table mapping in one place, protects RLS gaps on the branded catalogs
// (which are partner-only data), and means the client never sees the anon key
// contorting a `.from('tcc_pricing')` call for what is really a permission
// check.
//
// Contract:
//   brand=tcc              → SELECT from tcc_pricing
//   brand=doctor_clean_id  → SELECT from id_pricing
//   brand=agents           → { rows: [] } (agents still use the existing
//                             service_pricing.partner_price flow inline in
//                             the wizard — nothing new to return here)
//
// Response: { rows: TccIdPricingRow[] } for tcc / doctor_clean_id.
//
// Auth: partner session cookie required — the branded catalog is only
// meaningful for logged-in partners, and we want the rate-limit key to bind
// to the partner_user id (not just an IP that a botnet can rotate).

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/utils';

const BRAND_TABLE: Record<string, string> = {
  tcc: 'tcc_pricing',
  doctor_clean_id: 'id_pricing',
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const brand = url.searchParams.get('brand') ?? '';

  if (brand === 'agents' || brand === '') {
    // Agents keep reading service_pricing directly from the wizard; nothing
    // to return here. Still 200 so the client doesn't have to special-case.
    return NextResponse.json(
      { rows: [] },
      { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const table = BRAND_TABLE[brand];
  if (!table) {
    return NextResponse.json({ error: 'Unknown brand' }, { status: 400 });
  }

  // Auth — same JWT contract as /api/auth/me and /api/bookings/submit.
  const cookieStore = await cookies();
  const token = cookieStore.get('dc_partner_session')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('[pricing] CRITICAL: JWT_SECRET missing');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  let partnerUserId: string | undefined;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    partnerUserId = (payload as { id?: string }).id;
  } catch {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }
  if (!partnerUserId) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  // Cheap catalog reads shouldn't be a runaway loop from a stuck component;
  // 120/min is well above any legitimate booking wizard usage.
  if (!(await checkRateLimit(`pricing:${partnerUserId}`, 120, 60_000))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from(table)
      .select(
        'id, section, subgroup, unit_label, sqft_label, ala_carte_price, scrubbing_price, scrubbing_formaldehyde_price, is_tbq, sort_order, is_active',
      )
      .eq('is_active', true)
      .order('section')
      .order('sort_order');

    if (error) {
      console.error('[pricing] db error', { table, error });
      return NextResponse.json({ error: 'Failed to load pricing' }, { status: 500 });
    }

    return NextResponse.json(
      { rows: data ?? [] },
      { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (err) {
    console.error('[pricing] unexpected', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
