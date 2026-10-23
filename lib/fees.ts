// Reschedule + cancellation fee helper — port of booking-web/lib/fees.ts.
// Partner portal uses the same `fee_tiers` table + tier-matching rules as
// the customer self-serve flow so the fee a partner sees matches what the
// customer would be charged on the same booking.

import { createAdminClient } from '@/lib/supabase/admin';
import { SignJWT, jwtVerify } from 'jose';

export type FeeKind = 'reschedule' | 'cancel';

// Locked-fee token — HMAC-signs the computed fee for an event so the
// amount the UI shows in cancel-info/reschedule-info is the same amount
// cancel/reschedule actually applies. Fixes a dispute magnet where the
// customer sees "$0" at 48:01h and gets charged "$60" at 47:59h on confirm.
export type FeeTokenPayload = {
  event_id: string;
  kind: FeeKind;
  base_amount: number;
  gst_amount: number;
  amount_with_gst: number;
  tier_hit: number | null;
  reason: FeeResult['reason'];
};

export const FEE_TOKEN_TTL_SECONDS = 10 * 60; // 10-minute lock window

export async function signFeeToken(payload: FeeTokenPayload): Promise<string> {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET missing — cannot sign fee token');
  }
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return await new SignJWT({ ...payload, purpose: 'fee_lock' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${FEE_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifyFeeToken(
  token: string,
  expected: { event_id: string; kind: FeeKind },
): Promise<FeeTokenPayload | null> {
  if (!process.env.JWT_SECRET) return null;
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    if (
      (payload as { purpose?: string }).purpose !== 'fee_lock' ||
      (payload as { event_id?: string }).event_id !== expected.event_id ||
      (payload as { kind?: string }).kind !== expected.kind
    ) {
      return null;
    }
    return payload as unknown as FeeTokenPayload;
  } catch {
    return null;
  }
}

export type FeeResult = {
  amount: number;
  tier_hit: number | null;
  reason: 'admin_waived' | 'no_matching_tier' | 'tier_match';
};

export const GST_RATE = 0.09;

export function feeWithGst(baseAmount: number): { base: number; gst: number; total: number } {
  const base = Math.round(baseAmount * 100) / 100;
  const gst = Math.round(base * GST_RATE * 100) / 100;
  const total = Math.round((base + gst) * 100) / 100;
  return { base, gst, total };
}

export async function computeFee(
  eventId: string,
  kind: FeeKind,
  nowMs?: number,
): Promise<FeeResult> {
  const supabase = createAdminClient();

  const { data: event, error } = await supabase
    .from('events')
    .select(
      'id, Start_Date, Start_Time, Start_Time_Display, Service_Type, reschedule_fee_waived, cancellation_fee_waived',
    )
    .eq('id', eventId)
    .single();

  if (error || !event) {
    throw new Error(`[computeFee] event not found: ${eventId}`);
  }

  const waived =
    kind === 'reschedule'
      ? (event as { reschedule_fee_waived?: boolean }).reschedule_fee_waived
      : (event as { cancellation_fee_waived?: boolean }).cancellation_fee_waived;
  if (waived) {
    return { amount: 0, tier_hit: null, reason: 'admin_waived' };
  }

  const startTs = eventStartMs(event as EventTimeRow);
  if (startTs === null) {
    return { amount: 0, tier_hit: null, reason: 'no_matching_tier' };
  }

  const now = nowMs ?? Date.now();
  const hoursToAppt = Math.max(0, (startTs - now) / (1000 * 60 * 60));

  const svc = (event as { Service_Type?: string | null }).Service_Type ?? null;
  const { data: tiers, error: tiersErr } = await supabase
    .from('fee_tiers')
    .select('hours_before_appointment, amount, service')
    .eq('kind', kind)
    .eq('is_active', true)
    .or(svc ? `service.eq.${svc},service.is.null` : 'service.is.null')
    .order('hours_before_appointment', { ascending: true });

  if (tiersErr) {
    throw new Error(`[computeFee] fee_tiers query failed: ${tiersErr.message}`);
  }

  const rows: Array<{ hours: number; amount: number; specific: boolean }> = (
    (tiers ?? []) as Array<{ hours_before_appointment: number; amount: number | string; service: string | null }>
  ).map((r) => ({
    hours: r.hours_before_appointment,
    amount: parseFloat(String(r.amount)),
    specific: r.service !== null,
  }));

  rows.sort((a, b) => {
    if (a.hours !== b.hours) return a.hours - b.hours;
    return a.specific === b.specific ? 0 : a.specific ? -1 : 1;
  });

  for (const t of rows) {
    if (hoursToAppt < t.hours) {
      return { amount: t.amount, tier_hit: t.hours, reason: 'tier_match' };
    }
  }

  return { amount: 0, tier_hit: null, reason: 'no_matching_tier' };
}

export function ruleFromTier(tierHit: number | null): string {
  if (tierHit == null) return 'no_fee';
  if (tierHit <= 24) return '<24h';
  if (tierHit <= 48) return '<48h';
  if (tierHit <= 168) return '<7d';
  return `<${tierHit}h`;
}

type EventTimeRow = {
  Start_Date?: string | null;
  Start_Time?: string | null;
  Start_Time_Display?: string | null;
};

function eventStartMs(ev: EventTimeRow): number | null {
  const date = ev.Start_Date ?? null;
  if (!date) return null;

  let hh: number | null = null;
  let mm: number | null = null;

  if (ev.Start_Time) {
    const parts = ev.Start_Time.split(':');
    if (parts.length >= 2) {
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (Number.isFinite(h) && Number.isFinite(m)) {
        hh = h;
        mm = m;
      }
    }
  }

  if (hh === null && ev.Start_Time_Display) {
    const match = ev.Start_Time_Display.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (match) {
      let h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const meridiem = (match[3] ?? '').toUpperCase();
      if (meridiem === 'PM' && h !== 12) h += 12;
      if (meridiem === 'AM' && h === 12) h = 0;
      if (Number.isFinite(h) && Number.isFinite(m)) {
        hh = h;
        mm = m;
      }
    }
  }

  if (hh === null || mm === null) return null;

  const iso = `${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+08:00`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}
