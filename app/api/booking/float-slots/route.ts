import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/booking/float-slots — returns Deep Cleaning arrival windows
// as configured by the admin in main-web (`float_slot_config` table).
// Wizard fetches on mount and falls back to a hardcoded default if the
// fetch fails so a broken DB read never blocks the flow.
//
// Public — no session gate. The DB rows are just labels + times +
// surcharge amounts, no PII. Same pattern booking-web already uses.

// 12-hour label helper — "09:00:00" → "9:00 AM".
function fmtTime(t: string): string {
  const [hhStr, mmStr] = t.split(':');
  const hh = parseInt(hhStr, 10);
  const mm = mmStr ?? '00';
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return mm === '00' ? `${h12}:00 ${suffix}` : `${h12}:${mm} ${suffix}`;
}

// "9:00 AM" + "9:30 AM" + fee → "9:00–9:30 AM Arrival (+S$50)"
function buildLabel(start: string, end: string, fee: number): string {
  const s = fmtTime(start);
  const e = fmtTime(end);
  // Collapse "9:00 AM–9:30 AM" → "9:00–9:30 AM" when suffixes match.
  const sSuf = s.slice(-2);
  const eSuf = e.slice(-2);
  const range = sSuf === eSuf
    ? `${s.slice(0, -3)}–${e}`
    : `${s}–${e}`;
  const feePart = fee > 0 ? ` (+S$${fee})` : '';
  return `${range} Arrival${feePart}`;
}

export async function GET() {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from('float_slot_config')
      .select('key, label, arrival_start_time, arrival_end_time, fee, sort_order')
      .order('sort_order');

    if (error || !data || data.length === 0) {
      return NextResponse.json({ slots: [], source: 'fallback' });
    }

    const slots = data.map((r) => ({
      key: r.key,
      label: buildLabel(r.arrival_start_time, r.arrival_end_time, Number(r.fee ?? 0)),
      start: fmtTime(r.arrival_start_time),
      end: fmtTime(r.arrival_end_time),
      additionalFee: Number(r.fee ?? 0),
    }));

    return NextResponse.json(
      { slots, source: 'db' },
      { headers: { 'Cache-Control': 'private, max-age=60' } }
    );
  } catch {
    return NextResponse.json({ slots: [], source: 'fallback' });
  }
}
