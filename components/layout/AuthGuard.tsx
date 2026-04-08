'use client';
import { useAuthStore } from '@/store/authStore';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, _hasHydrated } = useAuthStore();

  useEffect(() => {
    if (_hasHydrated && !user) {
      router.replace('/login');
    }
  }, [user, _hasHydrated, router]);

  // Show spinner while Zustand is rehydrating from localStorage
  if (!_hasHydrated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return <>{children}</>;
}
