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
      // v2: bumped after the partner_user schema split. Old sessions had a User shape
      // missing approval_status/company_id — treating them as valid would let legacy
      // sessions bypass the booking gate. Bumping the persist name forces a fresh
      // /api/auth/me → fresh JWT with the new shape.
      name: 'dc-partner-auth-v2',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
