import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// ─── Edge-compatible rate limit store ────────────────────────────────────────
// Uses globalThis so state persists across requests in the same edge worker process.
// Cloudflare handles network-level DDoS before requests reach this layer.

type RLEntry = { count: number; resetAt: number };
declare global {
  // eslint-disable-next-line no-var
  var __mwRl: Map<string, RLEntry> | undefined;
}

function rlStore(): Map<string, RLEntry> {
  if (!globalThis.__mwRl) globalThis.__mwRl = new Map();
  // Prune when large to prevent memory growth in long-lived edge workers
  if (globalThis.__mwRl.size > 50_000) {
    const now = Date.now();
    for (const [k, v] of globalThis.__mwRl) {
      if (now > v.resetAt) globalThis.__mwRl.delete(k);
    }
  }
  return globalThis.__mwRl;
}

function checkLimit(
  key: string,
  max: number,
  windowMs: number
): { ok: boolean; retryAfterSec: number; remaining: number } {
  const s = rlStore();
  const now = Date.now();
  const e = s.get(key);

  if (!e || now > e.resetAt) {
    s.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0, remaining: max - 1 };
  }
  if (e.count >= max) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((e.resetAt - now) / 1000),
      remaining: 0,
    };
  }
  e.count++;
  return { ok: true, retryAfterSec: 0, remaining: max - e.count };
}

// ─── Rate limit tiers (matched in order — first prefix match wins) ────────────
// These limits are the last code-level defence; Cloudflare WAF/rate-limit rules
// should be configured to block at the network edge before reaching here.
const TIERS = [
  // Auth brute-force: 5 attempts per 15 min per IP
  { prefix: '/api/auth/login', max: 5,   windowMs: 15 * 60 * 1000 },
  // Guest ref-lookup: 10 attempts per 15 min per IP
  { prefix: '/api/auth/guest', max: 10,  windowMs: 15 * 60 * 1000 },
  // General API flood: 60 requests per minute per IP
  { prefix: '/api/',           max: 60,  windowMs: 60 * 1000 },
  // Login page flood: 30 requests per minute per IP
  { prefix: '/login',          max: 30,  windowMs: 60 * 1000 },
] as const;

// ─── Bot / scanner detection ──────────────────────────────────────────────────
// Block well-known exploit scanners and missing/suspicious user-agents.
// Cloudflare Bot Management handles this at a deeper level — this is a code-level backup.
const BAD_UA = [
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /zgrab/i,
  /dirbuster/i,
  /gobuster/i,
  /nuclei/i,
  /acunetix/i,
  /nessus/i,
  /openvas/i,
  /burpsuite/i,
  /hydra/i,
  /metasploit/i,
  /havij/i,
  /w3af/i,
  /python-requests\/[01]\./i, // old/raw python scrapers
  /curl\/[0-7]\./i,            // very old curl (commonly used in scanners)
];

function isBadBot(ua: string | null): boolean {
  if (!ua || ua.trim().length < 5) return true; // missing or near-empty UA
  return BAD_UA.some((p) => p.test(ua));
}

// ─── Real IP extraction (Cloudflare-aware) ────────────────────────────────────
// When Cloudflare proxies traffic, the real visitor IP is in cf-connecting-ip.
// Without Cloudflare, fall back to x-forwarded-for / x-real-ip.
function getClientIp(req: NextRequest): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

// ─── 429 response helper ──────────────────────────────────────────────────────
function tooManyRequests(retryAfterSec: number, limit: number): NextResponse {
  return new NextResponse(
    JSON.stringify({ error: 'Too many requests. Please slow down.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(
          Math.ceil((Date.now() + retryAfterSec * 1000) / 1000)
        ),
      },
    }
  );
}

// ─── Middleware ───────────────────────────────────────────────────────────────
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = getClientIp(request);
  const ua = request.headers.get('user-agent');

  // 1. Block known exploit scanners on sensitive paths
  const isSensitive =
    pathname.startsWith('/api/') || pathname.startsWith('/login');
  if (isSensitive && isBadBot(ua)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // 2. Edge-level rate limiting — runs before any page/API handler
  const tier = TIERS.find((t) => pathname.startsWith(t.prefix));
  if (tier) {
    const key = `${tier.prefix}:${ip}`;
    const result = checkLimit(key, tier.max, tier.windowMs);
    if (!result.ok) {
      return tooManyRequests(result.retryAfterSec, tier.max);
    }
  }

  // 3. Supabase session refresh (cookie propagation)
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Public routes — no auth check needed
  const publicPaths = ['/login', '/track'];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));
  if (isPublic) return supabaseResponse;

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
