import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateInviteToken } from '@/lib/invites';
import { checkRateLimit } from '@/lib/utils';
import { isAdminRole } from '@/lib/rbac-server';

// Admin-only endpoints for the /dashboard/settings/team page.
//   GET  → list team members + pending invites for the caller's company
//   POST → generate a new invite link (role='employee' unless overridden)

// Invite links can only ever create employees. Admin promotion happens
// through PATCH /api/team/members/[id] by an existing admin — this
// prevents a leaked WhatsApp-forwarded link from turning a random
// recipient into a company admin. If we ever need admin invites,
// re-open this + add email binding and a rate-limit / cap.
const postSchema = z.object({
  email: z.string().email().optional().nullable(),
});

async function requireAdminSession(): Promise<
  { partnerId: string; companyId: string } | { error: string; status: number }
> {
  const cookieStore = await cookies();
  const token = cookieStore.get('dc_partner_session')?.value;
  if (!token || !process.env.JWT_SECRET) {
    return { error: 'Unauthorized', status: 401 };
  }
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    const partnerId = (payload as { id?: string }).id;
    if (!partnerId) return { error: 'Invalid session', status: 401 };

    const db = createAdminClient();
    const { data: partner } = await db
      .from('partner_user')
      .select('id, company_id, partner_role')
      .eq('id', partnerId)
      .single();
    if (!partner?.company_id) {
      return { error: 'No company linked to this user.', status: 400 };
    }
    if (!isAdminRole(partner.partner_role)) {
      return { error: 'Admin role required.', status: 403 };
    }
    return { partnerId, companyId: partner.company_id };
  } catch {
    return { error: 'Session expired', status: 401 };
  }
}

export async function GET() {
  const session = await requireAdminSession();
  if ('error' in session) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }
  const db = createAdminClient();

  const [membersRes, invitesRes] = await Promise.all([
    db.from('partner_user')
      .select('id, username, full_name, email, partner_role, approval_status, created_at')
      .eq('company_id', session.companyId)
      .order('created_at', { ascending: true }),
    db.from('partner_invites')
      .select('id, token, email, role_to_assign, expires_at, used_at, created_at')
      .eq('company_id', session.companyId)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  ]);

  return NextResponse.json({
    members: membersRes.data ?? [],
    invites: invitesRes.data ?? [],
  });
}

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if ('error' in session) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  // Cap invite generation so a compromised admin session (or a bug in
  // the UI) can't flood partner_invites. 20/hour is well above any
  // real onboarding cadence.
  if (!(await checkRateLimit(`invite:create:${session.companyId}`, 20, 60 * 60 * 1000))) {
    return NextResponse.json(
      { error: 'Too many invites generated recently. Please wait an hour.' },
      { status: 429 }
    );
  }

  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const db = createAdminClient();
  const token = generateInviteToken();

  const { data, error } = await db
    .from('partner_invites')
    .insert({
      token,
      company_id: session.companyId,
      email: parsed.data.email ?? null,
      // Hardcoded — invites always create employees. See postSchema comment.
      role_to_assign: 'employee',
      created_by: session.partnerId,
      // expires_at defaults to now() + 7 days per schema
    })
    .select('id, token, expires_at')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create invite' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, invite: data });
}
