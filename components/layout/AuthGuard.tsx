'use client';
import { useAuthStore } from '@/store/authStore';
import { Loader2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { canAccess, effectiveRole } from '@/lib/rbac';
import { isAdminRole } from '@/lib/rbac-server';

// Routes that stay accessible even when the user's company isn't
// approved yet — otherwise the redirect below would trap them in a
// loop or block them from logging out.
//
// `startsWith` for the onboarding tree so any /onboarding/* subpage
// works, and exact-match for /settings so the profile page (logout
// button) is reachable BUT /settings/team etc. are NOT — you can't
// invite employees to a company that isn't approved yet.
const ONBOARDING_PREFIX = '/dashboard/onboarding';
const SETTINGS_ROOT = '/dashboard/settings';
function isCompanyGateExempt(path: string): boolean {
  return path.startsWith(ONBOARDING_PREFIX) || path === SETTINGS_ROOT;
}

// Roles that are treated as "boss / admin" and required to complete
// the company onboarding flow before accessing the rest of the
// dashboard. Employees inherit an already-approved company and skip
// this gate entirely. Uses the shared lib/rbac-server.isAdminRole so
// the server and client agree on which values count as admin.

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, _hasHydrated, setUser } = useAuthStore();
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (!_hasHydrated) return;

    const verifySession = async (initial: boolean) => {
      if (initial) setIsVerifying(true);
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          // Only push a fresh user into the store when meaningful fields
          // changed. Otherwise every 30s poll triggers a cascade of re-renders
          // (dashboard was flashing on nav-back because loadData re-ran).
          const current = useAuthStore.getState().user;
          const next = data.user;
          const changed =
            !current ||
            current.id !== next.id ||
            current.approval_status !== next.approval_status ||
            current.company_id !== next.company_id ||
            current.company_status !== next.company_status ||
            current.partner_role !== next.partner_role ||
            current.partner_tier !== next.partner_tier ||
            current.company_discount_value !== next.company_discount_value ||
            current.company_discount_type !== next.company_discount_type ||
            current.company_payment_terms !== next.company_payment_terms ||
            current.company_name !== next.company_name;
          if (changed) setUser(next);
        } else if (!user) {
          router.replace('/login');
        }
      } catch {
        if (!user) router.replace('/login');
      } finally {
        if (initial) setIsVerifying(false);
      }
    };

    // Initial verify (blocks render if no user yet)
    verifySession(!user);

    // Silent refresh every 30 seconds so approval flips propagate without
    // requiring the user to log out and back in.
    const interval = setInterval(() => verifySession(false), 30_000);

    // Also refresh on window focus (user comes back from another tab)
    const onFocus = () => verifySession(false);
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [_hasHydrated, router, setUser, user]);

  // Company onboarding gate — ID / boss role must finish the company
  // account (name + UEN + address + ACRA + UEN doc) before touching the
  // rest of the dashboard. Employees inherit an already-approved company
  // so they skip this. Everyone can still reach /settings + /onboarding.
  useEffect(() => {
    if (!user) return;
    if (!isAdminRole(user.partner_role)) return;
    if (user.company_status === 'approved') return;
    if (pathname && isCompanyGateExempt(pathname)) return;
    router.replace('/dashboard/onboarding/company');
  }, [user, pathname, router]);

  // Phase 4 RBAC — employees hitting an admin-only page (analytics,
  // pending payments, team management) get bounced to /dashboard.
  // Sidebar already hides these links; this catches direct URL entry.
  //
  // Fires the redirect. The synchronous render-body block further down
  // is what actually prevents the page's own useEffects (Supabase
  // queries) from running in the meantime.
  useEffect(() => {
    if (!user || !pathname) return;
    if (effectiveRole(user) === 'admin') return;
    if (canAccess(user, pathname)) return;
    router.replace('/dashboard');
  }, [user, pathname, router]);

  // Synchronous render-time gate. Without this, the admin-only page's
  // own useEffects (e.g. analytics query on mount, revenue aggregation)
  // fire BEFORE the redirect above resolves — data leaks briefly and
  // could be captured by a race. Blocking the render entirely means
  // children never mount for the unauthorized user.
  const blockedByRbac =
    !!user && !!pathname && effectiveRole(user) !== 'admin' && !canAccess(user, pathname);

  // Show spinner while Zustand is rehydrating from localStorage or verifying session
  if (!_hasHydrated || isVerifying || (!user && _hasHydrated)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  // Same spinner shown while the RBAC redirect is in-flight. Prevents
  // the admin-only page from mounting and firing revenue queries.
  if (blockedByRbac) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return <>{children}</>;
}
