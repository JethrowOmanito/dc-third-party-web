import { randomBytes } from 'crypto';

// Invite tokens are 32 hex chars (128 bits of entropy). Long enough to
// resist bruteforce; short enough for a shareable URL. Stored as-is —
// no hashing at rest since a leaked DB row is already game-over for
// the app, and we need to look up by exact string on acceptance.
export function generateInviteToken(): string {
  return randomBytes(16).toString('hex');
}

// Client-side reads NEXT_PUBLIC_APP_URL directly (Next inlines it at
// build time only when accessed literally). Fall back to the passed
// origin so we can still work in dev when the env var isn't set.
export function buildInviteUrl(token: string, origin?: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    origin ||
    '';
  const cleanBase = base.replace(/\/$/, '');
  return `${cleanBase}/invite/${token}`;
}
