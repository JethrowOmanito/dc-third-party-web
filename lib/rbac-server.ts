// Server-side role check used by all admin-gated API routes.
// Mirrors the client-side `effectiveRole` in @/lib/rbac so the API
// enforces the exact same admin membership the UI enforces — any
// legacy value (null / 'agent' / 'other') is treated as employee.
//
// If we ever tighten by removing legacy 'interior_designer' after the
// Phase 2 cleanup migration, update BOTH files together.
export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'interior_designer';
}
