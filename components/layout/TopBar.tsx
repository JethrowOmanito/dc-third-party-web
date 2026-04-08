'use client';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Settings, LogOut, Menu } from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/jobs': 'All Jobs',
  '/dashboard/jobs/today': "Today's Jobs",
  '/dashboard/jobs/incoming': 'Incoming Jobs',
  '/dashboard/booking/slots': 'Available Slots',
  '/dashboard/booking/new': 'Book a Service',
  '/dashboard/booking/payment': 'Confirm Booking',
  '/dashboard/settings': 'Settings',
};

function getTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  if (pathname.includes('/chat')) return 'Job Chat';
  if (pathname.includes('/report')) return 'Service Report';
  if (/\/dashboard\/jobs\/[^/]+$/.test(pathname)) return 'Job Details';
  return 'Doctor Clean';
}

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const title = getTitle(pathname);

  const canGoBack =
    pathname !== '/dashboard' &&
    !TITLES[pathname] === false &&
    (pathname.includes('/jobs/') || pathname.includes('/booking/payment') || pathname.includes('/booking/new'));

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {canGoBack && (
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="font-semibold text-gray-900 text-base truncate">{title}</h1>
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
