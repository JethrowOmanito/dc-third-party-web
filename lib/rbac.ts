import type { User } from '@/types';
import { isAdminRole } from '@/lib/rbac-server';

// RBAC helper for the third-party-web partner portal.
// Two effective roles today:
//   • 'admin' (also matches the legacy 'interior_designer' value while
//     Phase 2 cleanup migration is pending)
//   • 'employee' — invited by the admin, no revenue visibility
//
// Rule of thumb: admins see everything; employees can view their
// schedule + book jobs but cannot see money-related pages.
//
// Keep the path list narrow — only pages that must be gated. Everything
// not listed here is open to both roles.

const ADMIN_ONLY_PREFIXES = [
  '/dashboard/analytics',
  '/dashboard/pending-payments',
  '/dashboard/settings/team',       // Phase 5: invite management
  '/dashboard/settings/company',    // company profile
];

export type EffectiveRole = 'admin' | 'employee';

export function effectiveRole(user: User | null | undefined): EffectiveRole {
  if (!user) return 'employee';
  return isAdminRole(user.partner_role) ? 'admin' : 'employee';
}

export function canAccess(user: User | null | undefined, path: string): boolean {
  const role = effectiveRole(user);
  if (role === 'admin') return true;
  return !ADMIN_ONLY_PREFIXES.some((p) => path.startsWith(p));
}

// Convenience for React components that want to show/hide nav items.
export function isAdminOnlyPath(path: string): boolean {
  return ADMIN_ONLY_PREFIXES.some((p) => path.startsWith(p));
}
