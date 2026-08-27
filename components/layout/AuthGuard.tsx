'use client';
import { useAuthStore } from '@/store/authStore';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
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
          setUser(data.user);
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

  // Show spinner while Zustand is rehydrating from localStorage or verifying session
  if (!_hasHydrated || isVerifying || (!user && _hasHydrated)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return <>{children}</>;
}
