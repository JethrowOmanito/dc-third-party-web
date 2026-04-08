'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CalendarDays, Clock, Briefcase, DollarSign,
  Gift, ArrowRight, Loader2, Building2
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/authStore';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getGreeting, getServiceDisplayName, getServiceColor } from '@/lib/utils';

interface Stats {
  todayCount: number;
  incomingCount: number;
  totalCount: number;
  totalCommission: number;
  totalRebate: number;
}

interface Service { id: number; name: string; }

const SERVICE_ICONS: Record<string, string> = {
  float: '🧹', curtain: '🪟', housekeeping: '🏠', office: '🏢',
  carpet: '🪨', mattress: '🛏️', sofa: '🛋️', upholstery: '🪑',
  aircon: '❄️', disinfection: '🧴', scrubbing: '🔧',
};

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<Stats>({ todayCount: 0, incomingCount: 0, totalCount: 0, totalCommission: 0, totalRebate: 0 });
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabaseClient();

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const [allResult, servicesResult] = await Promise.all([
        supabase
          .from('events')
          .select('id, Start_Date, commission_percentage, rebate_amount')
          .eq('owned_by_third_party', user.id),
        supabase.from('services').select('id, name').order('name'),
      ]);

      const jobs = allResult.data || [];
      const todayCount = jobs.filter((j) => j.Start_Date?.startsWith(today)).length;
      const incomingCount = jobs.filter((j) => j.Start_Date && j.Start_Date > today).length;
      const totalCommission = jobs.reduce((s, j) => s + (j.commission_percentage || 0), 0);
      const totalRebate = jobs.reduce((s, j) => s + (j.rebate_amount || 0), 0);

      setStats({ todayCount, incomingCount, totalCount: jobs.length, totalCommission, totalRebate });
      setServices(servicesResult.data || []);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
    // Real-time subscription
    const channel = supabase
      .channel('dashboard-events')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'events' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  const greeting = getGreeting();

  const statCards = [
    { label: "Today's Jobs", value: stats.todayCount, icon: CalendarDays, color: 'bg-emerald-500', href: '/dashboard/jobs/today' },
    { label: 'Incoming Jobs', value: stats.incomingCount, icon: Clock, color: 'bg-amber-500', href: '/dashboard/jobs/incoming' },
    { label: 'Total Jobs', value: stats.totalCount, icon: Briefcase, color: 'bg-slate-600', href: '/dashboard/jobs' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header greeting */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 rounded-2xl p-5 text-white shadow-md">
        <p className="text-emerald-100 text-sm font-medium">{greeting} 👋</p>
        <h2 className="text-xl font-bold mt-0.5">
          {user?.company_name || user?.username}
        </h2>
        {user?.company_type && (
          <Badge className="mt-2 bg-emerald-500/50 text-white border-0 text-xs">
            {user.company_type}
          </Badge>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {statCards.map(({ label, value, icon: Icon, color, href }) => (
          <Link key={label} href={href}>
            <Card className="hover:shadow-md transition-shadow active:scale-[0.98] cursor-pointer">
              <CardContent className="p-3 sm:p-5">
                <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center mb-3`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Commission & Rebate */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Card className="bg-emerald-50 border-emerald-100">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-medium text-emerald-700">Total Commission</span>
            </div>
            <p className="text-xl font-bold text-emerald-700">${stats.totalCommission.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 border-purple-100">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Gift className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-medium text-purple-700">Total Rebate</span>
            </div>
            <p className="text-xl font-bold text-purple-700">${stats.totalRebate.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Services offered */}
      {services.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Services We Offer</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            {services.map((svc) => {
              const color = getServiceColor(svc.name);
              const emoji = SERVICE_ICONS[svc.name.toLowerCase()] || '✨';
              const display = getServiceDisplayName(svc.name);
              return (
                <Link key={svc.id} href="/dashboard/booking/new">
                  <div className="flex items-center gap-2.5 p-3 bg-white rounded-xl border border-gray-100 hover:shadow-sm active:scale-[0.98] transition-all cursor-pointer">
                    <span className="text-xl flex-shrink-0">{emoji}</span>
                    <span className="text-xs font-medium text-gray-700 leading-tight">{display}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link href="/dashboard/booking/slots" className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 hover:shadow-sm active:scale-[0.98] transition-all">
          <div>
            <p className="font-semibold text-gray-900 text-sm">Book a Service</p>
            <p className="text-xs text-gray-500 mt-0.5">Check slots & create booking</p>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
        </Link>
        <Link href="/dashboard/jobs" className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 hover:shadow-sm active:scale-[0.98] transition-all">
          <div>
            <p className="font-semibold text-gray-900 text-sm">View All Jobs</p>
            <p className="text-xs text-gray-500 mt-0.5">Track job status & details</p>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
        </Link>
      </div>
    </div>
  );
}
