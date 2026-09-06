import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminRole } from '@/lib/rbac-server';

// Saves the text fields of a partner company (name, UEN, address). Doc
// uploads go through the sibling /upload route. Auto-flips company_status
// to 'approved' iff both docs are present AND all required fields set.

const schema = z.object({
  name:    z.string().trim().min(2, 'Company name required').max(160),
  uen:     z.string().trim().min(6, 'UEN required').max(32),
  address: z.string().trim().min(4, 'Address required').max(400),
});

async function verifySession(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('dc_partner_session')?.value;
  if (!token || !process.env.JWT_SECRET) return null;
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return (payload as { id?: string }).id ?? null;
  } catch {
    return null;
  }
}

// GET — hydrates the onboarding form on revisit so admin doesn't have
// to re-type UEN / address / name they already saved. Also surfaces
// which docs are already on file (bool flags, never the storage paths).
export async function GET() {
  const partnerId = await verifySession();
  if (!partnerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient();
  const { data: partner } = await db
    .from('partner_user')
    .select('company_id')
    .eq('id', partnerId)
    .single();

  if (!partner?.company_id) {
    return NextResponse.json({ error: 'No company linked to this user.' }, { status: 400 });
  }

  const { data: company } = await db
    .from('partner_companies')
    .select('name, uen, address, acra_doc_url, uen_doc_url, company_status')
    .eq('id', partner.company_id)
    .single();

  return NextResponse.json({
    name: company?.name ?? '',
    uen: company?.uen ?? '',
    address: company?.address ?? '',
    acra_uploaded: Boolean(company?.acra_doc_url),
    uen_uploaded: Boolean(company?.uen_doc_url),
    status: company?.company_status ?? 'pending',
  });
}

export async function POST(req: NextRequest) {
  const partnerId = await verifySession();
  if (!partnerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    );
  }

  const db = createAdminClient();

  // Only admins of the company can update its onboarding fields. Employees
  // shouldn't ever land on this page, but the API enforces the invariant.
  const { data: partner } = await db
    .from('partner_user')
    .select('company_id, partner_role')
    .eq('id', partnerId)
    .single();

  if (!partner?.company_id) {
    return NextResponse.json(
      { error: 'No company linked to this user. Contact admin.' },
      { status: 400 }
    );
  }
  if (!isAdminRole(partner.partner_role)) {
    return NextResponse.json(
      { error: 'Only company admins can complete onboarding.' },
      { status: 403 }
    );
  }

  // Save company fields. Don't touch acra_doc_url / uen_doc_url — those
  // are only set by the upload route so we don't accidentally wipe them
  // when the user re-saves the form.
  const { error: updErr } = await db
    .from('partner_companies')
    .update({
      name: parsed.data.name,
      uen: parsed.data.uen,
      address: parsed.data.address,
      updated_at: new Date().toISOString(),
    })
    .eq('id', partner.company_id);

  if (updErr) {
    // Unique index on uen — friendly message if already taken.
    if ((updErr as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'That UEN is already registered to another company.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Auto-approve when both docs and all fields are present. Docs are
  // set by the upload route; this endpoint just flips status if we're
  // now complete.
  const { data: current } = await db
    .from('partner_companies')
    .select('name, uen, address, acra_doc_url, uen_doc_url, company_status')
    .eq('id', partner.company_id)
    .single();

  const readyToApprove =
    current?.name && current?.uen && current?.address &&
    current?.acra_doc_url && current?.uen_doc_url &&
    current?.company_status !== 'approved';

  if (readyToApprove) {
    await db
      .from('partner_companies')
      .update({ company_status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', partner.company_id);
  }

  return NextResponse.json({
    ok: true,
    approved: Boolean(readyToApprove) || current?.company_status === 'approved',
  });
}
