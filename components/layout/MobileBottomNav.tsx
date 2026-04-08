'use client';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Briefcase, CalendarDays, Clock, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/dashboard/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/dashboard/jobs/today', label: 'Today', icon: CalendarDays },
  { href: '/dashboard/jobs/incoming', label: 'Incoming', icon: Clock },
  { href: '/dashboard/booking/slots', label: 'Book', icon: BookOpen },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
      <div className="flex items-stretch justify-around h-16">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/dashboard' ? pathname === href : pathname.startsWith(href);
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
