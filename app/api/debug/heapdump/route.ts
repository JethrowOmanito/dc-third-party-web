import { NextRequest, NextResponse } from 'next/server';
import { writeHeapSnapshot } from 'v8';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Only accept requests that reach the pm2 process directly on the VPS.
// nginx sits between Cloudflare and pm2, so a legitimate curl from the
// VPS shell (or from ssh -L 3001:localhost:3001 followed by curl
// http://127.0.0.1:3001/...) will present a loopback source address.
// Any hit routed through Cloudflare will not, so token compromise alone
// is not enough to trigger a heap snapshot from the public internet.
const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function connectingIp(req: NextRequest): string {
  // Prefer CF-Connecting-IP so nginx-proxied requests are correctly
  // categorised as public even though the socket is loopback.
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return '';
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const expected = process.env.DEBUG_TOKEN;

  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Defence-in-depth: even with the right token, only allow requests
  // that originate on the box itself. Prevents a leaked token from
  // dumping (and thereby exfiltrating in-memory secrets like JWT_SECRET
  // and SUPABASE_SERVICE_ROLE_KEY) through Cloudflare.
  const ip = connectingIp(req);
  if (!LOOPBACK_IPS.has(ip)) {
    return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
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
