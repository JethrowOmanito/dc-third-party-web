import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/utils';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  phone: z.string().min(8).max(20).regex(/^[+0-9\s\-()]+$/),
});

// Normalize a phone number for consistent matching / storage.
// Handles: +65 88656751, 8865 6751, 6588656751, +6588656751, 88656751
function normalizePhone(input: string): string {
  const cleaned = input.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (/^65\d{8}$/.test(cleaned)) return `+${cleaned}`;         // 65 prefix without +
  if (/^[89]\d{7}$/.test(cleaned)) return `+65${cleaned}`;      // 8-digit SG
  return cleaned;
}

function generateCode(): string {
  // CSPRNG — Math.random is predictable and unfit for authentication codes.
  const n = randomInt(0, 1_000_000);
  return String(n).padStart(6, '0');
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-real-ip') ??
      req.headers.get('x-forwarded-for') ??
      'unknown';
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    const phone = normalizePhone(parsed.data.phone);

    // Rate limit per phone: 3 sends per hour
    if (!(await checkRateLimit(`otp:phone:${phone}`, 3, 60 * 60 * 1000))) {
      return NextResponse.json(
        { error: 'Too many OTP requests for this number. Please wait an hour.' },
        { status: 429 }
      );
    }
    // Rate limit per IP: 10 sends per hour
    if (!(await checkRateLimit(`otp:ip:${ip}`, 10, 60 * 60 * 1000))) {
      return NextResponse.json(
        { error: 'Too many OTP requests from your device. Please wait an hour.' },
        { status: 429 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    const db = createAdminClient();

    const code = generateCode();
    const codeHash = bcrypt.hashSync(code, 8);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insErr } = await db.from('partner_signup_otp').insert({
      phone,
      code_hash: codeHash,
      expires_at: expiresAt,
      ip: String(ip).slice(0, 60),
    });

    if (insErr) {
      console.error('[otp/send] insert error:', insErr);
      return NextResponse.json({ error: 'Failed to create OTP' }, { status: 500 });
    }

    // Deliver via WhatsApp. Prefer approved template if configured; fall back to plain text.
    // For AUTHENTICATION-category templates (like partner_signup_otp) Meta requires:
    //   - body component with a single text parameter (the code)
    //   - button component with sub_type=url and the code again (for Copy code button)
    // The send-whatsapp-notification edge fn passes templateParams straight through
    // as the `components` array, so we build the full Meta structure here.
    const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME;
    const templateLang = process.env.WHATSAPP_OTP_TEMPLATE_LANG ?? 'en_US';
    const waPayload = templateName
      ? {
          to: phone,
          message: `${code} is your Doctor Clean verification code.`,
          type: 'template' as const,
          templateName,
          templateLanguage: templateLang,
          templateParams: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: code }],
            },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: code }],
            },
          ],
        }
      : {
          to: phone,
          message: `${code} is your Doctor Clean verification code. Expires in 10 minutes.`,
          type: 'text' as const,
        };

    const waRes = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-notification`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(waPayload),
    });

    // The edge function returns HTTP 200 even when it SKIPS a send (dedup
    // window, monthly cap hit, template disabled, kill switch). Without
    // inspecting the body we'd tell the user "sent!" while nothing left the
    // system — this is what caused users to sit on the code panel waiting
    // for an OTP that never arrived. Parse the body and surface skip
    // reasons as a real error.
    const waBody = await waRes.json().catch(() => ({}));

    if (!waRes.ok) {
      console.error('[otp/send] WA delivery failed:', waBody);
      return NextResponse.json(
        { error: 'Could not send WhatsApp OTP. Check the number or contact admin.' },
        { status: 502 }
      );
    }

    if (waBody && waBody.skipped === true) {
      const reason = String(waBody.reason ?? 'unknown');
      const userMsg =
        reason === 'duplicate_recent'
          ? 'A code was sent to your WhatsApp recently. Please check WhatsApp, or wait up to 10 minutes before requesting a new one.'
          : reason === 'wa_globally_disabled'
          ? 'WhatsApp sending is temporarily disabled. Please contact admin.'
          : reason === 'template_disabled'
          ? 'OTP sending is temporarily unavailable. Please contact admin.'
          : reason.startsWith('wa_cap_reached')
          ? 'Our WhatsApp quota for this month is exhausted. Please contact admin.'
          : `Could not send WhatsApp OTP (${reason}).`;
      // 429 for the dedup case so the client can render it as a soft retry
      // hint, 503 for the harder failures.
      const status = reason === 'duplicate_recent' ? 429 : 503;
      return NextResponse.json(
        { error: userMsg, errorCode: reason },
        { status }
      );
    }

    return NextResponse.json({ ok: true, phone, expiresIn: 600 }, { status: 200 });
  } catch (err) {
    console.error('[otp/send] unexpected:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
