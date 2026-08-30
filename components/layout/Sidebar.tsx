'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  CalendarSearch,
  Settings,
  LogOut,
  Building2,
  BookOpen,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  requiresApproval?: boolean;
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/jobs/today', label: "Today's Jobs", icon: CalendarDays },
  { href: '/dashboard/check-availability', label: 'Check Availability', icon: CalendarSearch },
  { href: '/dashboard/booking/new', label: 'Book Service', icon: BookOpen, requiresApproval: true },
  { href: '/dashboard/pending-payments', label: 'Pending Payments', icon: Wallet, requiresApproval: true },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    // Clear the server-side session cookie first, otherwise the login page's
    // auto-redirect check on /api/auth/me will see the still-valid cookie
    // and bounce the user back to /dashboard.
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Network fail — still clear local state and force navigation.
    }
    logout();
    try {
      localStorage.removeItem('dc-partner-auth-v2');
    } catch {}
    // Full navigation instead of client-side push to ensure the new session
    // check runs cleanly on the login page.
    window.location.href = '/login';
  };

  return (
    <aside className="hidden lg:flex flex-col w-64 min-h-screen bg-white border-r border-gray-200 fixed left-0 top-0 bottom-0 z-40">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
        <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-gray-900 text-sm truncate">Doctor Clean</p>
          <p className="text-xs text-gray-500 truncate">Partner Portal</p>
        </div>
      </div>

      {/* User info */}
      {user && (
        <div className="px-4 py-3 mx-3 mt-4 bg-emerald-50 rounded-xl">
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide truncate">
            {user.company_name || user.username}
          </p>
          {user.company_type && (
            <p className="text-xs text-emerald-500 truncate">{user.company_type}</p>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon, requiresApproval }) => {
          const isSpecificView = href.split('/').length > 2 && href !== '/dashboard';
          const isActive = isSpecificView
            ? pathname === href
            : (href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href));

          const locked = requiresApproval && user?.approval_status !== 'approved';

          if (locked) {
            return (
              <button
                key={href}
                type="button"
                disabled
                title="Booking is disabled until your account is approved."
                className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-gray-400 cursor-not-allowed"
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {label}
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">
                  Pending
                </span>
              </button>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          Log Out
        </button>
      </div>
    </aside>
  );
}
