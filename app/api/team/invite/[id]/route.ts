import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminRole } from '@/lib/rbac-server';

// DELETE /api/team/invite/[id] — revoke an unused invite. Admin only,
// only within the caller's own company.

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: 'Invite id required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get('dc_partner_session')?.value;
  if (!token || !process.env.JWT_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let partnerId: string | undefined;
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    partnerId = (payload as { id?: string }).id;
  } catch {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }
  if (!partnerId) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  const db = createAdminClient();
  const { data: partner } = await db
    .from('partner_user')
    .select('company_id, partner_role')
    .eq('id', partnerId)
    .single();

  if (!partner?.company_id || !isAdminRole(partner.partner_role)) {
    return NextResponse.json({ error: 'Admin role required.' }, { status: 403 });
  }

  // Scope the delete to the caller's own company so a compromised admin
  // from company A can't nuke company B's invites.
  const { error } = await db
    .from('partner_invites')
    .delete()
    .eq('id', id)
    .eq('company_id', partner.company_id)
    .is('used_at', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
