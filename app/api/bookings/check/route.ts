import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { validateBookingAvailability } from '@/lib/api/availability-check';
import { checkRateLimit } from '@/lib/utils';

/**
 * GET /api/bookings/check?service=...&date=...&start=...&end=...
 *
 * Wizard-side availability probe. Runs 4 heavy Supabase queries per call
 * (events by date, cleaner_breaks, leave_requests, capacity). Requires
 * an authenticated partner session and is per-partner rate-limited so
 * anon callers can't cheaply DoS the DB or scrape cleaner-leave data.
 */
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('dc_partner_session')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.JWT_SECRET) {
    console.error('[bookings/check] CRITICAL: JWT_SECRET missing');
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

  const ip =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for') ??
    'unknown';
  if (!(await checkRateLimit(`avail:partner:${partnerUserId}`, 60, 60 * 1000))) {
    return NextResponse.json({ error: 'Too many availability checks. Slow down.' }, { status: 429 });
  }
  if (!(await checkRateLimit(`avail:ip:${ip}`, 120, 60 * 1000))) {
    return NextResponse.json({ error: 'Too many availability checks from your network.' }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const service      = searchParams.get('service');
  const date         = searchParams.get('date');
  const start        = searchParams.get('start');
  const end          = searchParams.get('end');
  const duration     = searchParams.get('duration');
  const propertyType = searchParams.get('property') ?? undefined;

  if (!service || !date || !start || !end) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  try {
    const res = await validateBookingAvailability(
      service,
      date,
      start,
      end,
      duration ? parseInt(duration) : undefined,
      propertyType
    );
    return NextResponse.json(res);
  } catch (err) {
    console.error('[bookings/check] unexpected:', err);
    return NextResponse.json({ error: 'Availability check failed' }, { status: 500 });
  }
}
