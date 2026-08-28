import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/utils';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  phone: z.string().min(8).max(20).regex(/^[+0-9\s\-()]+$/),
});

// Normalize a phone number for consistent matching / storage.
function normalizePhone(input: string): string {
  const cleaned = input.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (/^[89]\d{7}$/.test(cleaned)) return `+65${cleaned}`;
  return cleaned;
}

function generateCode(): string {
  const n = Math.floor(Math.random() * 1_000_000);
  return String(n).padStart(6, '0');
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    const phone = normalizePhone(parsed.data.phone);

    // Rate limit per phone: 3 sends per hour
    if (!checkRateLimit(`otp:phone:${phone}`, 3, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Too many OTP requests for this number. Please wait an hour.' },
        { status: 429 }
      );
    }
    // Rate limit per IP: 10 sends per hour
    if (!checkRateLimit(`otp:ip:${ip}`, 10, 60 * 60 * 1000)) {
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

    if (!waRes.ok) {
      const waErr = await waRes.json().catch(() => ({}));
      console.error('[otp/send] WA delivery failed:', waErr);
      return NextResponse.json(
        { error: 'Could not send WhatsApp OTP. Check the number or contact admin.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, phone, expiresIn: 600 }, { status: 200 });
  } catch (err) {
    console.error('[otp/send] unexpected:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
