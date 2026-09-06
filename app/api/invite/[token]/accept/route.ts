import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/utils';

// POST /api/invite/[token]/accept — public. Creates a new partner_user
// under the invite's company_id + role_to_assign, marks the invite used,
// and sets the session cookie so the employee lands straight in the
// dashboard. Auto-approves the account — the admin has vouched by
// generating the link, and the employee inherits an already-approved
// company.

const schema = z.object({
  full_name: z.string().trim().min(2).max(160),
  username:  z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/, 'Letters, numbers, dot, dash, underscore only'),
  password:  z.string().min(8).max(128),
  email:     z.string().trim().email().optional().nullable(),
  whatsapp_phone: z.string().trim().min(6).max(32).optional().nullable(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'Invalid invite link.' }, { status: 400 });
  }
  if (!process.env.JWT_SECRET) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  // Rate-limit by IP — this route runs bcrypt (cost 12, ~250ms) on every
  // hit, so an unlimited endpoint is a CPU-amplification DoS surface
  // even for a valid token. Also caps token-guessing throughput.
  const ip =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for') ??
    'unknown';
  if (!(await checkRateLimit(`invite:accept:${ip}`, 10, 60 * 1000))) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a minute and try again.' },
      { status: 429 }
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    );
  }

  const db = createAdminClient();

  // ── Atomic invite reservation ──
  // UPDATE with `.is('used_at', null)` is atomic in Postgres — two
  // concurrent callers cannot both match the same row, so this
  // eliminates the TOCTOU race that a read-then-write pattern had.
  // We also enforce the expiry inline so a stale invite can't be
  // reserved. If nothing matches, `.single()` yields no row.
  const nowIso = new Date().toISOString();
  const { data: invite } = await db
    .from('partner_invites')
    .update({ used_at: nowIso })
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', nowIso)
    .select('id, company_id, role_to_assign')
    .maybeSingle();

  if (!invite) {
    // Collapsed to one message so a caller can't distinguish
    // "wrong token" from "used" from "expired" via response text.
    return NextResponse.json({ error: 'This invite is no longer valid.' }, { status: 410 });
  }

  // Pull company for the safeUser payload + gate that it's still approved.
  // If not approved, release the reservation so the admin can send a new
  // invite once onboarding is complete (best-effort — worst case burns
  // the token, admin generates another).
  const { data: company } = await db
    .from('partner_companies')
    .select('id, name, company_code, company_type, discount_type, discount_value, payment_terms, company_status, partner_tier')
    .eq('id', invite.company_id)
    .single();

  if (!company || company.company_status !== 'approved') {
    await db.from('partner_invites').update({ used_at: null }).eq('id', invite.id);
    return NextResponse.json({ error: 'Inviting company is not active.' }, { status: 409 });
  }

  // Duplicate username / email checks (mirrors /api/auth/signup semantics).
  const [{ data: usernameHit }, { data: emailHit }] = await Promise.all([
    db.from('partner_user').select('id').ilike('username', parsed.data.username).maybeSingle(),
    parsed.data.email
      ? db.from('partner_user').select('id').ilike('email', parsed.data.email).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (usernameHit) return NextResponse.json({ error: 'This username is already taken.' }, { status: 409 });
  if (emailHit)    return NextResponse.json({ error: 'This email is already registered.' }, { status: 409 });

  const password_hash = await bcrypt.hash(parsed.data.password, 12);
  const now = new Date().toISOString();

  const { data: inserted, error: insErr } = await db
    .from('partner_user')
    .insert({
      username: parsed.data.username,
      password_hash,
      email: parsed.data.email ?? null,
      full_name: parsed.data.full_name,
      whatsapp_phone: parsed.data.whatsapp_phone ?? null,
      company_id: invite.company_id,
      partner_role: invite.role_to_assign,
      // Invited employees are auto-approved — the admin has vouched by
      // generating the link.
      approval_status: 'approved',
      tnc_accepted_at: now,
    })
    .select('id, username, email, full_name, whatsapp_phone, company_id, partner_role')
    .single();

  if (insErr || !inserted) {
    const code = (insErr as { code?: string } | null)?.code;
    if (code === '23505') {
      return NextResponse.json({ error: 'Username or email already registered.' }, { status: 409 });
    }
    return NextResponse.json({ error: insErr?.message ?? 'Failed to create account' }, { status: 500 });
  }

  // Invite was already marked used_at above (atomic reservation). Now
  // that the user row exists, backfill used_by so admins can see who
  // consumed the invite in the audit trail. Best-effort — if this
  // fails the account still exists.
  await db
    .from('partner_invites')
    .update({ used_by: inserted.id })
    .eq('id', invite.id);

  const safeUser = {
    id: inserted.id,
    username: inserted.username,
    name: inserted.full_name ?? inserted.username,
    email: inserted.email ?? undefined,
    whatsapp_phone: inserted.whatsapp_phone ?? undefined,
    company_id: inserted.company_id,
    company_name: company.name,
    company_code: company.company_code ?? undefined,
    company_type: company.company_type ?? undefined,
    company_discount_type: (company.discount_type ?? null) as 'percent' | 'flat' | null,
    company_discount_value: Number(company.discount_value ?? 0),
    company_payment_terms: (company.payment_terms ?? null) as 'upfront' | 'end_of_month' | null,
    company_status: company.company_status as 'approved',
    partner_tier: (company.partner_tier ?? 'Standard Partner') as string,
    approval_status: 'approved' as const,
    partner_role: (inserted.partner_role ?? 'employee') as 'admin' | 'employee',
  };

  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const loginAt = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ ...safeUser, login_at: loginAt })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret);

  const res = NextResponse.json({ user: safeUser }, { status: 201 });
  res.cookies.set('dc_partner_session', jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  });
  return res;
}
