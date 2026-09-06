'use client';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Settings, LogOut, Menu } from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/jobs/today': "Today's Jobs",
  '/dashboard/check-availability': 'Check Availability',
  '/dashboard/booking/slots': 'Available Slots',
  '/dashboard/booking/new': 'Book a Service',
  '/dashboard/booking/payment': 'Confirm Booking',
  '/dashboard/settings': 'Settings',
};

const SUBTITLES: Record<string, string> = {
  '/dashboard/booking/new': 'Follow the steps to complete your booking.',
  '/dashboard/check-availability': 'Pick a date to see Deep Cleaning slots.',
};

function getTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  if (pathname.includes('/chat')) return 'Job Chat';
  if (pathname.includes('/report')) return 'Service Report';
  if (/\/dashboard\/jobs\/[^/]+$/.test(pathname)) return 'Job Details';
  return 'Doctor Clean';
}

function getSubtitle(pathname: string): string | null {
  return SUBTITLES[pathname] || null;
}

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const title = getTitle(pathname);
  const subtitle = getSubtitle(pathname);

  const handleLogout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    logout();
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith('dc-partner-auth-')) localStorage.removeItem(k);
      }
    } catch {}
    window.location.href = '/login';
  };

  return (
    <header className={`sticky top-0 z-30 bg-white border-b border-gray-200 px-4 flex items-center justify-between gap-2 ${subtitle ? 'py-1.5' : 'h-14'}`}>
      <div className="flex flex-col min-w-0 flex-1">
        <h1 className="font-bold text-slate-900 text-lg lg:text-xl truncate leading-tight">{title}</h1>
        {subtitle && (
          <p className="text-xs lg:text-sm text-slate-500 truncate leading-tight mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Link
          href="/dashboard/settings"
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 lg:hidden"
        >
          <Settings className="w-5 h-5" />
        </Link>
        <button
          onClick={handleLogout}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 lg:hidden"
          title="Log out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
