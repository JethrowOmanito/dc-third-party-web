/**
 * Centralised rate limiter — works in both Node.js (API routes) and Edge Runtime (middleware).
 *
 * Uses globalThis so the Map persists across requests within the same worker/serverless
 * container, providing effective protection against burst attacks.
 *
 * On Vercel + Cloudflare: Cloudflare handles network-level DDoS at the edge;
 * this layer handles application-level rate limiting per IP.
 *
 * Upgrade path: swap the store() implementation below with Upstash Redis
 * by setting UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN env vars.
 */

type RLEntry = { count: number; resetAt: number };

declare global {
  // eslint-disable-next-line no-var
  var __rlStore: Map<string, RLEntry> | undefined;
}

function store(): Map<string, RLEntry> {
  if (!globalThis.__rlStore) {
    globalThis.__rlStore = new Map();
  }
  // Prune expired entries when the store grows large (prevent memory leaks in long-lived workers)
  if (globalThis.__rlStore.size > 20_000) {
    const now = Date.now();
    for (const [k, v] of globalThis.__rlStore) {
      if (now > v.resetAt) globalThis.__rlStore.delete(k);
    }
  }
  return globalThis.__rlStore;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  /** Seconds until the window resets — 0 when allowed */
  retryAfterSec: number;
}

/**
 * Sliding fixed-window rate limiter.
 * @param key     Unique key (e.g. "login:<ip>:<username>")
 * @param max     Max requests allowed in the window
 * @param windowMs Window size in milliseconds
 */
export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const s = store();
  const now = Date.now();
  const entry = s.get(key);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs;
    s.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: max - 1, resetAt, retryAfterSec: 0 };
  }

  if (entry.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: max - entry.count,
    resetAt: entry.resetAt,
    retryAfterSec: 0,
  };
}

export function resetLimit(key: string): void {
  globalThis.__rlStore?.delete(key);
}

// ─── Backward-compatible exports (used by API routes via lib/utils.ts) ────────

export function checkRateLimit(key: string, max = 5, windowMs = 15 * 60 * 1000): boolean {
  return rateLimit(key, max, windowMs).allowed;
}

export function resetRateLimit(key: string): void {
  resetLimit(key);
}
