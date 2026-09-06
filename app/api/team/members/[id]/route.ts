import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminRole } from '@/lib/rbac-server';

// PATCH /api/team/members/[id] — change a member's role (admin ↔ employee)
// DELETE /api/team/members/[id] — remove a member from the company
//
// Both are admin-only, both are scoped to the caller's own company. The
// caller cannot demote or remove themselves — the UI hides the actions
// on the caller's own row, and the API rejects self-modification as a
// second line of defence.

const patchSchema = z.object({
  role: z.enum(['admin', 'employee']),
});

async function requireAdmin(): Promise<
  { partnerId: string; companyId: string } | { error: string; status: number }
> {
  const cookieStore = await cookies();
  const token = cookieStore.get('dc_partner_session')?.value;
  if (!token || !process.env.JWT_SECRET) return { error: 'Unauthorized', status: 401 };
  let partnerId: string | undefined;
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    partnerId = (payload as { id?: string }).id;
  } catch {
    return { error: 'Session expired', status: 401 };
  }
  if (!partnerId) return { error: 'Invalid session', status: 401 };

  const db = createAdminClient();
  const { data: partner } = await db
    .from('partner_user')
    .select('company_id, partner_role')
    .eq('id', partnerId)
    .single();
  if (!partner?.company_id || !isAdminRole(partner.partner_role)) {
    return { error: 'Admin role required.', status: 403 };
  }
  return { partnerId, companyId: partner.company_id };
}

// Guard: the caller can't touch a member outside their own company AND
// can't touch themselves via this endpoint (prevents self-demotion or
// self-removal — orphaned admin state is a support headache).
async function assertActionable(
  memberId: string,
  session: { partnerId: string; companyId: string },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (memberId === session.partnerId) {
    return { ok: false, error: 'You cannot change or remove your own account here.', status: 400 };
  }
  const db = createAdminClient();
  const { data: target } = await db
    .from('partner_user')
    .select('id, company_id')
    .eq('id', memberId)
    .single();
  if (!target) return { ok: false, error: 'Member not found.', status: 404 };
  if (target.company_id !== session.companyId) {
    return { ok: false, error: 'Member not in your company.', status: 403 };
  }
  return { ok: true };
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await requireAdmin();
  if ('error' in session) return NextResponse.json({ error: session.error }, { status: session.status });

  const check = await assertActionable(id, session);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'role must be admin or employee' }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: patched, error } = await db
    .from('partner_user')
    .update({ partner_role: parsed.data.role, force_logout: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', session.companyId) // belt-and-braces cross-tenant guard
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!patched || patched.length === 0) {
    // Member was deleted between assertActionable and here — treat as
    // 404 so admin sees a clear error instead of silent success.
    return NextResponse.json({ error: 'Member no longer exists.' }, { status: 404 });
  }

  // force_logout=true above nudges the target's client to re-auth on
  // next /api/auth/me poll — new role kicks in on their next fresh
  // login (login route auto-clears the flag).
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await requireAdmin();
  if ('error' in session) return NextResponse.json({ error: session.error }, { status: session.status });

  const check = await assertActionable(id, session);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const db = createAdminClient();
  // Hard delete. If a member ever needs to be re-invited they can go
  // through the invite flow again with the same email.
  const { error } = await db.from('partner_user').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
