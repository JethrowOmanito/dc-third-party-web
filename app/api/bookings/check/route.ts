import { NextRequest, NextResponse } from 'next/server';
import { validateBookingAvailability } from '@/lib/api/availability-check';

/**
 * GET /api/bookings/check?service=...&date=...&start=...&end=...
 * Utility endpoint for secondary checks (mobile app, etc.)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const service      = searchParams.get('service');
  const date         = searchParams.get('date');
  const start        = searchParams.get('start');
  const end          = searchParams.get('end');
  const duration     = searchParams.get('duration');
  const propertyType = searchParams.get('property') ?? undefined;

  if (!service || !date || !start || !end) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  try {
    const res = await validateBookingAvailability(
      service,
      date,
      start,
      end,
      duration ? parseInt(duration) : undefined,
      propertyType
    );
    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
