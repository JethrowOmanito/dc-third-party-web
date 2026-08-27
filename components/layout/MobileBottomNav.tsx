'use client';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Briefcase, CalendarDays, Clock, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';

interface Tab {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  requiresApproval?: boolean;
}

const tabs: Tab[] = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/dashboard/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/dashboard/jobs/today', label: 'Today', icon: CalendarDays },
  { href: '/dashboard/jobs/incoming', label: 'Incoming', icon: Clock },
  { href: '/dashboard/booking/new', label: 'Book', icon: BookOpen, requiresApproval: true },
];

// Routes where the wizard/flow has its own bottom action tray — hide this nav to avoid stacking.
const HIDE_NAV_ROUTES = ['/dashboard/booking/new', '/dashboard/booking/payment', '/dashboard/booking/success'];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  if (HIDE_NAV_ROUTES.some((r) => pathname.startsWith(r))) return null;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
      <div className="flex items-stretch justify-around h-16">
        {tabs.map(({ href, label, icon: Icon, requiresApproval }) => {
          const isActive = href === '/dashboard' ? pathname === href : pathname.startsWith(href);
          const locked = requiresApproval && user?.approval_status !== 'approved';

          if (locked) {
            return (
              <button
                key={href}
                type="button"
                disabled
                title="Booking is disabled until your account is approved."
                className="flex flex-col items-center justify-center flex-1 gap-0.5 text-xs font-medium text-gray-300 cursor-not-allowed min-w-0"
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center flex-1 gap-0.5 text-xs font-medium transition-colors min-w-0',
                isActive ? 'text-emerald-600' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Icon className={cn('w-5 h-5 flex-shrink-0', isActive && 'text-emerald-600')} />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
