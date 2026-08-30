import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { checkRateLimit } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const postal = req.nextUrl.searchParams.get('postal');

  if (!postal || !/^\d{6}$/.test(postal)) {
    return NextResponse.json({ found: 0 }, { status: 400 });
  }

  // Require a logged-in partner OR a guest session — this endpoint used
  // to be fully anonymous which let bots burn our shared OneMap quota
  // (auth memory: ~3-day token TTL). If quota runs out, every partner's
  // booking flow silently breaks.
  const cookieStore = await cookies();
  const partnerToken = cookieStore.get('dc_partner_session')?.value;
  const guestToken = cookieStore.get('dc_guest_session')?.value;
  if (!partnerToken && !guestToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.JWT_SECRET) {
    console.error('[address/lookup] CRITICAL: JWT_SECRET missing');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  let sessionKey = 'anon';
  try {
    const tokenToVerify = partnerToken ?? guestToken;
    if (tokenToVerify) {
      const { payload } = await jwtVerify(tokenToVerify, secret);
      sessionKey =
        (payload as { id?: string; eventId?: string }).id ??
        (payload as { eventId?: string }).eventId ??
        'anon';
    }
  } catch {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }

  // Per-IP and per-session rate limits. IP prefers cf-connecting-ip to
  // resist X-Forwarded-For spoofing if origin is reached direct.
  const ip =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for') ??
    'unknown';
  if (!(await checkRateLimit(`onemap:session:${sessionKey}`, 40, 60 * 60 * 1000))) {
    return NextResponse.json({ error: 'Too many address lookups. Try again later.' }, { status: 429 });
  }
  if (!(await checkRateLimit(`onemap:ip:${ip}`, 120, 60 * 60 * 1000))) {
    return NextResponse.json({ error: 'Too many address lookups from your network.' }, { status: 429 });
  }

  try {
    const res = await fetch(
      `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${postal}&returnGeom=N&getAddrDetails=Y&pageNum=1`,
      { headers: { Accept: 'application/json' }, next: { revalidate: 0 } }
    );

    if (!res.ok) {
      return NextResponse.json({ found: 0, error: 'OneMap unavailable' }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ found: 0, error: 'Failed to fetch address' }, { status: 500 });
  }
}
