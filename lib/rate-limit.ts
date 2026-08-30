/**
 * Rate limiter — Redis-backed when REDIS_URL is set, in-memory fallback otherwise.
 *
 * With multiple pm2 instances, Redis-backed limiting is REQUIRED for correctness;
 * otherwise an attacker gets N-instance-count multiplied attempts before hitting
 * the app-level limit. Cloudflare + nginx limit_req provide edge defense-in-depth.
 */

import type { Redis as IORedisClient } from 'ioredis';

type RLEntry = { count: number; resetAt: number };

declare global {
  // eslint-disable-next-line no-var
  var __rlStore: Map<string, RLEntry> | undefined;
  // eslint-disable-next-line no-var
  var __rlRedis: IORedisClient | null | undefined;
}

function memStore(): Map<string, RLEntry> {
  if (!globalThis.__rlStore) {
    globalThis.__rlStore = new Map();
  }
  if (globalThis.__rlStore.size > 20_000) {
    const now = Date.now();
    for (const [k, v] of globalThis.__rlStore) {
      if (now > v.resetAt) globalThis.__rlStore.delete(k);
    }
  }
  return globalThis.__rlStore;
}

function redis(): IORedisClient | null {
  if (globalThis.__rlRedis !== undefined) return globalThis.__rlRedis;
  const url = process.env.REDIS_URL;
  if (!url) {
    globalThis.__rlRedis = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const IORedis = require('ioredis');
    const client: IORedisClient = new IORedis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 500,
    });
    client.on('error', () => {
      // Silently degrade — memory fallback covers Redis outages
    });
    globalThis.__rlRedis = client;
    return client;
  } catch {
    globalThis.__rlRedis = null;
    return null;
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
}

async function redisLimit(
  client: IORedisClient,
  key: string,
  max: number,
  windowMs: number,
): Promise<RateLimitResult | null> {
  try {
    const rkey = `rl:${key}`;
    const [countStr, ttlMs] = (await client
      .multi()
      .incr(rkey)
      .pexpire(rkey, windowMs, 'NX')
      .pttl(rkey)
      .exec()
      .then((res) => [res?.[0]?.[1], res?.[2]?.[1]])) as [unknown, unknown];

    const count = Number(countStr ?? 0);
    const ttl = Number(ttlMs ?? windowMs);
    const resetAt = Date.now() + Math.max(ttl, 0);

    if (count > max) {
      return { allowed: false, remaining: 0, resetAt, retryAfterSec: Math.ceil(Math.max(ttl, 0) / 1000) };
    }
    return { allowed: true, remaining: max - count, resetAt, retryAfterSec: 0 };
  } catch {
    return null;
  }
}

function memLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const s = memStore();
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
  return { allowed: true, remaining: max - entry.count, resetAt: entry.resetAt, retryAfterSec: 0 };
}

export async function rateLimit(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  const client = redis();
  if (client) {
    const r = await redisLimit(client, key, max, windowMs);
    if (r) return r;
  }
  return memLimit(key, max, windowMs);
}

export async function resetLimit(key: string): Promise<void> {
  const client = redis();
  if (client) {
    try { await client.del(`rl:${key}`); } catch { /* ignore */ }
  }
  globalThis.__rlStore?.delete(key);
}

// ─── Backward-compatible sync exports (used by API routes via lib/utils.ts) ────
// These block on Redis; if Redis is slow they still return quickly (500ms connect timeout).

export async function checkRateLimit(key: string, max = 5, windowMs = 15 * 60 * 1000): Promise<boolean> {
  return (await rateLimit(key, max, windowMs)).allowed;
}

export async function resetRateLimit(key: string): Promise<void> {
  await resetLimit(key);
}
