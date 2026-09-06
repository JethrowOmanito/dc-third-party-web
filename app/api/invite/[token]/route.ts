import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/utils';

// GET /api/invite/[token] — public. Validates that the token exists,
// hasn't been used, hasn't expired, and returns the minimal fields the
// signup page needs (company name + role_to_assign). Never returns the
// company_id or any PII.

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'Invalid invite link.' }, { status: 400 });
  }

  // Rate-limit by IP so an attacker can't scrape the invites table via
  // token enumeration. 30/min is generous for a human clicking a link.
  const ip =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for') ??
    'unknown';
  if (!(await checkRateLimit(`invite:lookup:${ip}`, 30, 60 * 1000))) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  const db = createAdminClient();
  const { data: invite } = await db
    .from('partner_invites')
    .select('id, company_id, role_to_assign, email, expires_at, used_at')
    .eq('token', token)
    .maybeSingle();

  if (!invite) {
    return NextResponse.json({ error: 'This invite link is not valid.' }, { status: 404 });
  }
  if (invite.used_at) {
    return NextResponse.json({ error: 'This invite has already been used.' }, { status: 410 });
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'This invite has expired. Ask your admin to send a new one.' }, { status: 410 });
  }

  const { data: company } = await db
    .from('partner_companies')
    .select('name, company_status')
    .eq('id', invite.company_id)
    .single();

  if (!company || company.company_status !== 'approved') {
    return NextResponse.json({ error: 'The inviting company account is not active yet.' }, { status: 409 });
  }

  return NextResponse.json({
    company_name: company.name,
    role: invite.role_to_assign,
    email_hint: invite.email,
  });
}
