import { NextResponse } from 'next/server';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  // Clear the session cookie both by setting an expired value and by using delete.
  // Doubling up covers different browser cookie-clear behaviors.
  res.cookies.set('dc_partner_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  res.cookies.delete('dc_partner_session');
  return res;
}
