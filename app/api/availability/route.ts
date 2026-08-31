import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Deep-cleaning-only availability check for the partner portal.
// Mirrors booking-web's /api/availability deep-cleaning path.

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Missing or invalid date. Use YYYY-MM-DD.' }, { status: 400 });
  }

  const [dy, dm, dd] = date.split('-').map(Number);
  const calCheck = new Date(dy, dm - 1, dd);
  if (calCheck.getFullYear() !== dy || calCheck.getMonth() !== dm - 1 || calCheck.getDate() !== dd) {
    return NextResponse.json({ error: 'Invalid date.' }, { status: 400 });
  }

  // Compare midnight-SGT to midnight-SGT explicitly. Parsing "YYYY-MM-DDT00:00:00"
  // without a Z uses server-local TZ (UTC on Vercel/VPS), so the naïve parse can
  // reject valid same-day bookings during the 00:00–08:00 SGT boundary window.
  const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
  const selected = new Date(Date.UTC(dy, dm - 1, dd) - SGT_OFFSET_MS);
  const today = new Date(Math.floor((Date.now() + SGT_OFFSET_MS) / 86_400_000) * 86_400_000 - SGT_OFFSET_MS);
  const maxDate = new Date(today);
  maxDate.setMonth(maxDate.getMonth() + 3);

  if (selected < today) {
    return NextResponse.json({ error: 'Date cannot be in the past.' }, { status: 400 });
  }
  if (selected > maxDate) {
    return NextResponse.json({ error: 'Date too far in advance (max 3 months).' }, { status: 400 });
  }

  const admin = createAdminClient();

  const [{ data: rows, error }, { data: slotConfigs }] = await Promise.all([
    admin
      .from('Capacity')
      .select('"Start_Time", "End_Time", capacity, booked_count')
      .eq('date_capacity', date)
      .eq('service', 'Float')
      .order('"Start_Time"')
      .limit(20),
    admin
      .from('float_slot_config')
      .select('key, label, start_time, end_time, arrival_start_time, arrival_end_time, fee, sort_order')
      .order('sort_order'),
  ]);

  if (error) {
    console.error('[availability]', error);
    return NextResponse.json({ error: 'Failed to load slots.' }, { status: 500 });
  }

  function fmtTime(t: string): string {
    const [hh, mm] = t.split(':');
    const h = parseInt(hh, 10);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return mm === '00' ? `${h12}:00 ${suffix}` : `${h12}:${mm} ${suffix}`;
  }

  type SlotConfig = {
    key: string;
    label: string;
    start_time: string;
    end_time: string;
    arrival_start_time: string | null;
    arrival_end_time: string | null;
    fee: number;
  };
  const slotMeta: Record<string, { label: string; start: string; end: string; fee: number }> = {};
  for (const cfg of ((slotConfigs ?? []) as SlotConfig[])) {
    const displayStart = cfg.arrival_start_time ?? cfg.start_time;
    const displayEnd = cfg.arrival_end_time ?? cfg.end_time;
    slotMeta[cfg.start_time] = {
      label: cfg.label,
      start: fmtTime(displayStart),
      end: fmtTime(displayEnd),
      fee: cfg.fee ?? 0,
    };
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ unconfigured: true, slots: [] });
  }

  type CapacityRow = { Start_Time: string | null; End_Time: string | null; capacity: number | null; booked_count: number | null };
  const slots = (rows as unknown as CapacityRow[]).map((row) => {
    const meta = slotMeta[row.Start_Time ?? ''];
    // Fail closed on null capacity — a misconfigured slot must NOT accept
    // unlimited bookings. Ops should see the slot as unavailable and fix it.
    const available = (row.booked_count ?? 0) < (row.capacity ?? 0);
    const rawStart = row.Start_Time ?? '';
    const rawEnd = row.End_Time ?? '';
    return {
      start: meta?.start ?? (rawStart ? fmtTime(rawStart) : rawStart),
      end: meta?.end ?? (rawEnd ? fmtTime(rawEnd) : rawEnd),
      label: meta?.label ?? (rawStart ? fmtTime(rawStart) : rawStart),
      fee: meta?.fee ?? 0,
      available,
    };
  });

  return NextResponse.json(
    { slots },
    { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' } }
  );
}
