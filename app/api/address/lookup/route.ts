import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const postal = req.nextUrl.searchParams.get('postal');

  if (!postal || !/^\d{6}$/.test(postal)) {
    return NextResponse.json({ found: 0 }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${postal}&returnGeom=N&getAddrDetails=Y&pageNum=1`,
      { headers: { Accept: 'application/json' }, next: { revalidate: 0 } }
    );

    if (!res.ok) {
      return NextResponse.json({ found: 0, error: 'OneMap unavailable' }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ found: 0, error: 'Failed to fetch address' }, { status: 500 });
  }
}
