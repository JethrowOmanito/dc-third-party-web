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
    }),
    {
      // v3: added partner_role to the User shape. Bumping forces a fresh /api/auth/me
      // so the booking-page subcategory filter has a role to read on returning sessions.
      // v2 history: split partner_user schema; missing approval_status/company_id would
      // have let legacy sessions bypass the booking gate.
      name: 'dc-partner-auth-v3',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
