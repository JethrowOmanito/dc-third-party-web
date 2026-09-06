import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminRole } from '@/lib/rbac-server';

// Accepts a single multipart file for either ACRA or UEN. Path in bucket:
//   <company_id>/{acra|uen}.<ext>
// Writes with service role (bucket has no anon policies — custom auth
// story per project rules). After upload, patches acra_doc_url or
// uen_doc_url on the partner_companies row.

const BUCKET = 'partner-company-docs';
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per doc
const ALLOWED = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']);

// Magic-byte signature check — client-provided `file.type` is untrusted.
// A user can upload malware.exe and claim it's application/pdf. Sniffing
// the first few bytes catches this. Returns the real MIME or null if
// the file isn't one of our accepted formats.
function detectMime(bytes: Uint8Array): 'application/pdf' | 'image/png' | 'image/jpeg' | null {
  if (bytes.length < 4) return null;
  // PDF: "%PDF"
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  return null;
}

function extFromMime(mime: string): string {
  switch (mime) {
    case 'application/pdf': return 'pdf';
    case 'image/png':       return 'png';
    case 'image/jpeg':      return 'jpg';
    default:                return 'bin';
  }
}

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

export async function POST(req: NextRequest) {
  const partnerId = await verifySession();
  if (!partnerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // DOM lib FormData type in this repo's tsconfig omits .get() — cast
  // to a narrow parsed shape (same workaround as booking-web/refund-request).
  type ParsedFormData = {
    get(key: string): string | File | null;
  };
  let form: ParsedFormData;
  try {
    form = (await req.formData()) as unknown as ParsedFormData;
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 });
  }

  const docType = String(form.get('doc_type') ?? '');
  const file = form.get('file');

  if (docType !== 'acra' && docType !== 'uen') {
    return NextResponse.json({ error: "doc_type must be 'acra' or 'uen'" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'File is empty' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File must be under 8 MB' }, { status: 413 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'File must be PDF, PNG, or JPG' }, { status: 415 });
  }

  const db = createAdminClient();

  const { data: partner } = await db
    .from('partner_user')
    .select('company_id, partner_role')
    .eq('id', partnerId)
    .single();

  if (!partner?.company_id) {
    return NextResponse.json(
      { error: 'No company linked to this user.' },
      { status: 400 }
    );
  }
  if (!isAdminRole(partner.partner_role)) {
    return NextResponse.json(
      { error: 'Only company admins can upload company docs.' },
      { status: 403 }
    );
  }

  // Read the whole file into memory (max 8MB already enforced) so we
  // can magic-byte-sniff the real MIME. Trusting file.type from the
  // browser lets a user rename malware.exe → application/pdf.
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const sniffedMime = detectMime(bytes);
  if (!sniffedMime) {
    return NextResponse.json(
      { error: 'File must be a real PDF, PNG, or JPG.' },
      { status: 415 }
    );
  }

  // Also nuke any prior upload for this doc slot to avoid orphan
  // objects — user could have first uploaded acra.pdf then re-uploaded
  // as acra.png, leaving the pdf paying storage forever.
  const prefix = `${partner.company_id}/${docType}.`;
  const { data: existing } = await db.storage
    .from(BUCKET)
    .list(partner.company_id, { search: `${docType}.` });
  const stale = (existing ?? [])
    .map((o) => `${partner.company_id}/${o.name}`)
    .filter((k) => k.startsWith(prefix));
  if (stale.length > 0) {
    await db.storage.from(BUCKET).remove(stale);
  }

  const key = `${partner.company_id}/${docType}.${extFromMime(sniffedMime)}`;
  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(key, arrayBuffer, {
      contentType: sniffedMime,
      upsert: true,
    });

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // Bucket is private — record the storage path, not a signed URL (URLs
  // expire). The read side signs on demand.
  const patchCol = docType === 'acra' ? 'acra_doc_url' : 'uen_doc_url';
  const { error: patchErr } = await db
    .from('partner_companies')
    .update({ [patchCol]: key, updated_at: new Date().toISOString() })
    .eq('id', partner.company_id);

  if (patchErr) {
    return NextResponse.json({ error: patchErr.message }, { status: 500 });
  }

  // Auto-approve when the newly-uploaded doc completes the set.
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
    path: key,
    approved: Boolean(readyToApprove) || current?.company_status === 'approved',
  });
}
