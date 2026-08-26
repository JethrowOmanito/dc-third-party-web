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
    const verifySession = async () => {
      if (_hasHydrated && !user) {
        setIsVerifying(true);
        try {
          const res = await fetch('/api/auth/me');
          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
          } else {
            router.replace('/login');
          }
        } catch {
          router.replace('/login');
        } finally {
          setIsVerifying(false);
        }
      }
    };

    verifySession();
  }, [user, _hasHydrated, router, setUser]);

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
