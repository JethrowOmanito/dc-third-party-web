'use client';
import type { GuestSession, User } from '@/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  user: User | null;
  guestSession: GuestSession | null;
  _hasHydrated: boolean;
  setUser: (user: User | null) => void;
  setGuestSession: (session: GuestSession | null) => void;
  logout: () => void;
  setHasHydrated: (v: boolean) => void;
  refresh: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      guestSession: null,
      _hasHydrated: false,
      setUser: (user) => set({ user, guestSession: null }),
      setGuestSession: (guestSession) => set({ guestSession, user: null }),
      logout: () => set({ user: null, guestSession: null }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
      // Force a fresh /api/auth/me pull. Used by onboarding after doc
      // upload flips company_status → 'approved' so the gate lets the
      // user through immediately (instead of waiting for the 30s poll).
      refresh: async () => {
        try {
          const res = await fetch('/api/auth/me', { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            set({ user: data.user });
          }
        } catch { /* silent — poll will catch up */ }
      },
    }),
    {
      // v4: added company_status + partner_tier + widened partner_role.
      // Bumping the key forces a fresh /api/auth/me pull so legacy
      // sessions can't skip the new onboarding gate with stale data.
      // v3: added partner_role. v2: added approval_status/company_id.
      name: 'dc-partner-auth-v4',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
