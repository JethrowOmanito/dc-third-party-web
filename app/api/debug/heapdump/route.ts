import { NextRequest, NextResponse } from 'next/server';
import { writeHeapSnapshot } from 'v8';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const expected = process.env.DEBUG_TOKEN;

  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const outDir = process.env.HEAPDUMP_DIR ?? '/tmp';
  const filename = `heap-${process.pid}-${Date.now()}.heapsnapshot`;
  const filepath = path.join(outDir, filename);

  const writtenPath = writeHeapSnapshot(filepath);

  return NextResponse.json({
    ok: true,
    pid: process.pid,
    filepath: writtenPath,
    rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    heapUsed_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });
}
