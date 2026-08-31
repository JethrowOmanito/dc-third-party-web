import { NextRequest, NextResponse } from 'next/server';

// Same-origin Origin/Referer check. `SameSite=lax` blocks most cross-site
// POSTs already, but a subdomain compromise or a fetch(...) triggered by
// a malicious page reachable via link would still work. Defence-in-depth.
function isSameOrigin(req: NextRequest): boolean {
  const host = req.headers.get('host');
  if (!host) return false;
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const check = (value: string | null): boolean => {
    if (!value) return false;
    try {
      return new URL(value).host === host;
    } catch {
      return false;
    }
  };
  // If neither header is present at all, refuse — modern browsers always
  // send at least one of Origin/Referer on same-origin POSTs.
  if (!origin && !referer) return false;
  return check(origin) || check(referer);
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Cross-origin request refused' }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true });
  // Clear both partner and guest sessions on any logout — a partner may
  // have been elevated from a guest session, and vice-versa; leaving
  // stale cookies behind causes confusing UX on the next login.
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 0,
    path: '/',
  };
  res.cookies.set('dc_partner_session', '', cookieOpts);
  res.cookies.set('dc_guest_session', '', cookieOpts);
  res.cookies.delete('dc_partner_session');
  res.cookies.delete('dc_guest_session');
  return res;
}
