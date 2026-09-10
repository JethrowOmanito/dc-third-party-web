// Detects transient upstream errors (Supabase pooler blips, Cloudflare 5xx,
// network drops) that will heal on the next cron/retry tick. Callers
// downgrade these from `Sentry.captureException` (fatal alert email) to
// `Sentry.captureMessage(level: 'warning')` so operators aren't paged for
// self-healing hiccups.
//
// Recognises:
//   • Supabase Supavisor pooler / PostgREST proxy errors:
//       "upstream request timeout", "upstream connect error"
//   • HTTP 5xx status codes that indicate origin unreachable
//   • Cloudflare HTML error pages (521-524)
//   • Node/undici network errors (ETIMEDOUT, ECONNRESET, socket hang up, ...)
//   • Fetch AbortError from our own per-request timeouts
export function isTransientUpstreamError(err: unknown): boolean {
  if (!err) return false;
  const parts: string[] = [];
  if (typeof err === 'string') parts.push(err);
  else if (err instanceof Error) {
    parts.push(err.message ?? '');
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof Error) parts.push(cause.message ?? '');
    else if (typeof cause === 'string') parts.push(cause);
  } else if (typeof err === 'object') {
    const anyErr = err as { message?: unknown; code?: unknown; details?: unknown };
    if (typeof anyErr.message === 'string') parts.push(anyErr.message);
    if (typeof anyErr.details === 'string') parts.push(anyErr.details);
    if (typeof anyErr.code === 'string') parts.push(anyErr.code);
  }
  const blob = parts.join(' | ');
  if (!blob) return false;
  if (/<!DOCTYPE html>|<html|Web server is down|cloudflare/i.test(blob)) return true;
  if (/\b(521|522|523|524|502|503|504)\b/.test(blob)) return true;
  if (/upstream request timeout|upstream connect error|Bad Gateway|Gateway Time-?out|Service Unavailable/i.test(blob)) return true;
  if (/fetch failed|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network|AbortError/i.test(blob)) return true;
  return false;
}
