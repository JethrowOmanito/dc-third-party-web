import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  // Allow: numeric Ref_IDs, UUIDs, alphanumeric reference codes, hyphens, slashes, spaces
  referenceNumber: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9\-_/\s]+$/),
});

// UUID v4 pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Numeric Ref_ID (short booking number)
const NUMERIC_REGEX = /^\d+$/;

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
    const body = await req.json();

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid reference number' }, { status: 400 });
    }

    const key = `ref-login:${ip}`;
    if (!checkRateLimit(key, 10, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait 15 minutes.' },
        { status: 429 }
      );
    }

    const { referenceNumber } = parsed.data;
    const ref = referenceNumber.trim();
    const supabase = await createClient();

    // Strategy:
    // 1. Numeric string (e.g. "1042") → Ref_ID lookup via RPC
    // 2. UUID → RPC lookup, fallback to direct id query
    // 3. Text code → company_reference column

    let event: Record<string, any> | null = null;
    const SELECT_COLS = 'id, "Ref_ID", Title, Name, Start_Date, Start_Time_Display, End_Time_Display, Service_Type, lifecycle_state, company_reference';

    if (NUMERIC_REGEX.test(ref)) {
      // Numeric Ref_ID — use RPC (handles both int and UUID in the DB function)
      const { data: rpcRows } = await supabase
        .rpc('get_event_for_guest', { event_id: ref });
      event = rpcRows && rpcRows.length > 0 ? rpcRows[0] : null;
    } else if (UUID_REGEX.test(ref)) {
      // UUID — try RPC first, then direct id lookup
      const { data: rpcRows } = await supabase
        .rpc('get_event_for_guest', { event_id: ref });
      event = rpcRows && rpcRows.length > 0 ? rpcRows[0] : null;

      if (!event) {
        const { data } = await supabase
          .from('events')
          .select(SELECT_COLS)
          .eq('id', ref)
          .maybeSingle();
        event = data ?? null;
      }
    } else {
      // Text reference code → search company_reference column
      const { data } = await supabase
        .from('events')
        .select(SELECT_COLS)
        .eq('company_reference', ref)
        .maybeSingle();
      event = data ?? null;
    }

    if (!event) {
      return NextResponse.json(
        { error: 'No booking found with this reference number' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        session: {
          isGuest: true,
          eventId: event.id,
          customerName: event.Name || event.Title || 'Customer',
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
