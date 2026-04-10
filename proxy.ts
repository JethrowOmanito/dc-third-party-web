import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// ─── Edge-compatible rate limit store ────────────────────────────────────────
type RLEntry = { count: number; resetAt: number };
declare global {
  // eslint-disable-next-line no-var
  var __mwRl: Map<string, RLEntry> | undefined;
}

function rlStore(): Map<string, RLEntry> {
  if (!globalThis.__mwRl) globalThis.__mwRl = new Map();
  // Prune when large to prevent memory growth in long-lived edge workers
  if (globalThis.__mwRl.size > 20_000) { // Reduced size for performance
    const now = Date.now();
    let count = 0;
    for (const [k, v] of globalThis.__mwRl) {
      if (now > v.resetAt) {
        globalThis.__mwRl.delete(k);
        count++;
      }
      if (count > 500) break; // Incremental pruning to avoid CPU spikes
    }
  }
  return globalThis.__mwRl;
}

function checkLimit(
  key: string,
  max: number,
  windowMs: number
): { ok: boolean; retryAfterSec: number; remaining: number } {
  try {
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
  } catch (err) {
    console.error('Rate limit check failed:', err);
    return { ok: true, retryAfterSec: 0, remaining: 1 }; // Fail open
  }
}

const TIERS = [
  { prefix: '/api/auth/login', max: 5,   windowMs: 15 * 60 * 1000 },
  { prefix: '/api/auth/guest', max: 10,  windowMs: 15 * 60 * 1000 },
  { prefix: '/api/',           max: 60,  windowMs: 60 * 1000 },
  { prefix: '/login',          max: 30,  windowMs: 60 * 1000 },
] as const;

// ─── Bot / scanner detection ──────────────────────────────────────────────────
const BAD_UA = [
  /sqlmap/i, /nikto/i, /nmap/i, /masscan/i, /zgrab/i, /dirbuster/i, /gobuster/i,
  /nuclei/i, /acunetix/i, /nessus/i, /openvas/i, /burpsuite/i, /hydra/i, /metasploit/i,
  /havij/i, /w3af/i, /python-requests\/[01]\./i, /curl\/[0-7]\./i,
  /GPTBot/i, /ChatGPT-User/i, /OAI-SearchBot/i, /ClaudeBot/i, /anthropic-ai/i,
  /Claude-Web/i, /CCBot/i, /PerplexityBot/i, /Meta-ExternalAgent/i, /FacebookBot/i,
  /Bytespider/i, /ImagesiftBot/i, /Omgili/i, /Omgilibot/i, /YouBot/i, /cohere-ai/i,
  /AI2Bot/i, /Diffbot/i, /AhrefsBot/i, /SemrushBot/i, /MJ12bot/i, /DotBot/i,
  /BLEXBot/i, /PetalBot/i, /DataForSeoBot/i,
];

function isBadBot(ua: string | null): boolean {
  if (!ua || ua.trim().length < 5) return true;
  return BAD_UA.some((p) => p.test(ua));
}

function getClientIp(req: NextRequest): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

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

// ─── Proxy (Successor to Middleware in Next.js 16) ──────────────────────────────
export async function proxy(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;
    const ip = getClientIp(request);
    const ua = request.headers.get('user-agent');

    // 1. Bot prevention
    const isSensitive = pathname.startsWith('/api/') || pathname.startsWith('/login');
    if (isSensitive && isBadBot(ua)) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // 2. Rate limiting
    const tier = TIERS.find((t) => pathname.startsWith(t.prefix));
    if (tier) {
      const key = `${tier.prefix}:${ip}`;
      const result = checkLimit(key, tier.max, tier.windowMs);
      if (!result.ok) {
        return tooManyRequests(result.retryAfterSec, tier.max);
      }
    }

    // 3. Supabase session refresh
    let supabaseResponse = NextResponse.next({ request });

    // Defensive check for environment variables to prevent Edge crash
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('CRITICAL: Supabase environment variables are missing.');
      // Fail safely for public paths, but this will likely break authenticated paths
      return supabaseResponse;
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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
    });

    // CRITICAL: Refresh the auth token by checking the user
    // This handles the cookie propagation for Server Components
    await supabase.auth.getUser();

    return supabaseResponse;
  } catch (err) {
    // Catch-all to prevent 500 MIDDLEWARE_INVOCATION_FAILED
    console.error('Proxy Error:', err);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
