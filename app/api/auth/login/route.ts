import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, resetRateLimit } from '@/lib/utils';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(6).max(128),
});

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
    const body = await req.json();

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const { username, password } = parsed.data;
    const rateLimitKey = `login:${ip}:${username}`;

    if (!checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Please wait 15 minutes.' },
        { status: 429 }
      );
    }

    const supabase = await createClient();

    const { data: userData, error } = await supabase
      .from('user')
      .select(
        'id, username, password, password_hash, role, service_assigned, privilege, color_label, house_assigned, whatsapp_phone, company_name, company_code, company_type, force_logout'
      )
      .eq('username', username.trim())
      .single();

    if (error || !userData) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    // Verify password
    let passwordValid = false;
    if (userData.password_hash) {
      passwordValid = bcrypt.compareSync(password, userData.password_hash);
    } else if (userData.password) {
      // Some accounts may have bcrypt stored in the legacy password column
      if (userData.password.startsWith("$2")) {
        passwordValid = bcrypt.compareSync(password, userData.password);
      } else {
        passwordValid = userData.password === password;
      }
    }

    if (!passwordValid) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    if (userData.role !== 'thirdparty') {
      return NextResponse.json(
        { error: 'This portal is for partner companies only.' },
        { status: 403 }
      );
    }

    // Check force_logout
    if ((userData as any).force_logout) {
      return NextResponse.json({ error: 'Your account has been logged out by admin.' }, { status: 403 });
    }

    resetRateLimit(rateLimitKey);

    // Return user data (strip password fields)
    const { password: _p, password_hash: _ph, ...safeUser } = userData as any;

    return NextResponse.json({ user: safeUser }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
