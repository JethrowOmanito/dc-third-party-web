import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { event_id } = await req.json();

    if (!event_id) {
      return NextResponse.json({ error: 'event_id is required' }, { status: 400 });
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Supabase configuration missing');
    }

    // Call the Supabase Edge Function using the project-specific URL
    const res = await fetch(`https://agyzvknaqnamaoczxgsb.functions.supabase.co/send-job-created-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ event_id }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || 'Failed to send confirmation email');
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Email Confirmation API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
