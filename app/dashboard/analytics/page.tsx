'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import {
  BarChart3, Calendar, DollarSign, Loader2, RefreshCw, TrendingDown, TrendingUp, Wallet,
} from 'lucide-react';

type Range = '3m' | '6m' | '12m';

interface MonthBucket {
  month: string;
  label: string;
  revenue: number;
  jobs: number;
  paid: number;
  unpaid: number;
}

interface ServiceStat {
  service: string;
  jobs: number;
  revenue: number;
}

function formatSGD(n: number | null | undefined): string {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  return `S$${n.toLocaleString('en-SG', { maximumFractionDigits: 0 })}`;
}

function formatSGDShort(n: number): string {
  if (n >= 10000) return `S$${(n / 1000).toFixed(1)}k`;
  return `S$${Math.round(n)}`;
}

export default function AnalyticsPage() {
  const { user } = useAuthStore();
  const [months, setMonths] = useState<MonthBucket[]>([]);
  const [services, setServices] = useState<ServiceStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>('6m');
  const supabase = getSupabaseClient();

  const monthsBack = range === '3m' ? 3 : range === '6m' ? 6 : 12;

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const companyFilter = user.company_id
        ? { column: 'partner_company_id' as const, value: user.company_id }
        : { column: 'owned_by_third_party' as const, value: user.id };

      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);
      const startIso = start.toISOString().slice(0, 10);

      const { data } = await supabase
        .from('events_revenue')
        .select('*, Service_Type, revenue_per_session, payment_status, Start_Date')
        .eq(companyFilter.column, companyFilter.value)
        .gte('Start_Date', startIso)
        .order('Start_Date', { ascending: true })
        .limit(2000);

      const rows: any[] = (data ?? []) as any[];

      // Aggregate by month
      const bucketMap = new Map<string, MonthBucket>();
      for (let i = 0; i < monthsBack; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - i), 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('en-SG', { month: 'short', year: '2-digit' });
        bucketMap.set(key, { month: key, label, revenue: 0, jobs: 0, paid: 0, unpaid: 0 });
      }

      for (const r of rows) {
        const d = new Date((r.Start_Date || '') + 'T00:00:00+08:00');
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const bucket = bucketMap.get(key);
        if (!bucket) continue;
        bucket.jobs++;
        bucket.revenue += Number(r.revenue_per_session ?? 0);
        if (r.payment_status === 'paid') bucket.paid++;
        else bucket.unpaid++;
      }
      setMonths(Array.from(bucketMap.values()));

      // Service breakdown
      const svcMap = new Map<string, ServiceStat>();
      for (const r of rows) {
        const svc = r.Service_Type ?? 'Unknown';
        const entry = svcMap.get(svc) ?? { service: svc, jobs: 0, revenue: 0 };
        entry.jobs++;
        entry.revenue += Number(r.revenue_per_session ?? 0);
        svcMap.set(svc, entry);
      }
      const svcArr = Array.from(svcMap.values()).sort((a, b) => b.revenue - a.revenue);
      setServices(svcArr);
    } finally {
      setLoading(false);
    }
  }, [user, supabase, monthsBack]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const totalRevenue = months.reduce((s, m) => s + m.revenue, 0);
    const totalJobs = months.reduce((s, m) => s + m.jobs, 0);
    const currentMonth = months[months.length - 1];
    const prevMonth = months[months.length - 2];
    const momChange = prevMonth && prevMonth.revenue > 0
      ? Math.round(((currentMonth?.revenue ?? 0) - prevMonth.revenue) / prevMonth.revenue * 100)
      : null;
    return { totalRevenue, totalJobs, currentMonth, prevMonth, momChange };
  }, [months]);

  const maxRevenue = Math.max(1, ...months.map((m) => m.revenue));

  return (
    <div className="max-w-7xl mx-auto pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-emerald-600" />
            Analytics
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Monthly revenue, job count, and service mix — from your first booking through today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden">
            {(['3m', '6m', '12m'] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  'px-3 py-2 text-xs font-semibold transition',
                  range === r
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-700 hover:bg-slate-50',
                )}
              >
                {r === '3m' ? '3 months' : r === '6m' ? '6 months' : '12 months'}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="h-11 px-4 inline-flex items-center gap-2 rounded-xl bg-white ring-1 ring-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <MetricCard
          icon={<DollarSign className="w-5 h-5" />}
          label={`Revenue (${range})`}
          value={formatSGD(totals.totalRevenue)}
          accent="bg-emerald-50 text-emerald-700"
        />
        <MetricCard
          icon={<Wallet className="w-5 h-5" />}
          label={`Jobs (${range})`}
          value={String(totals.totalJobs)}
          accent="bg-sky-50 text-sky-700"
        />
        <MetricCard
          icon={totals.momChange != null && totals.momChange >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
          label="This month vs last"
          value={totals.momChange == null ? '—' : `${totals.momChange > 0 ? '+' : ''}${totals.momChange}%`}
          accent={
            totals.momChange == null
              ? 'bg-slate-50 text-slate-700'
              : totals.momChange >= 0
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700'
          }
        />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
            Loading analytics…
          </p>
        </div>
      ) : (
        <>
          <section className="bg-white rounded-2xl ring-1 ring-slate-100 p-4 sm:p-6 shadow-sm mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              Monthly revenue
            </h2>
            {months.length === 0 || totals.totalRevenue === 0 ? (
              <EmptyState label="No paid jobs in the selected window." />
            ) : (
              <div className="space-y-2">
                {months.map((m) => {
                  const pct = Math.round((m.revenue / maxRevenue) * 100);
                  return (
                    <div key={m.month} className="flex items-center gap-3">
                      <div className="w-20 shrink-0 text-xs font-semibold text-slate-600">{m.label}</div>
                      <div className="flex-1 bg-slate-100 rounded-lg overflow-hidden h-8 relative">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-lg transition-all"
                          style={{ width: `${pct}%` }}
                        />
                        <div className="absolute inset-0 flex items-center px-3 text-xs font-bold text-white mix-blend-difference">
                          {formatSGDShort(m.revenue)} · {m.jobs} jobs
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="bg-white rounded-2xl ring-1 ring-slate-100 p-4 sm:p-6 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
              Service mix (top services by revenue)
            </h2>
            {services.length === 0 ? (
              <EmptyState label="No jobs in the selected window." />
            ) : (
              <div className="space-y-2">
                {services.slice(0, 8).map((s) => {
                  const maxSvcRevenue = Math.max(1, ...services.map((x) => x.revenue));
                  const pct = Math.round((s.revenue / maxSvcRevenue) * 100);
                  return (
                    <div key={s.service} className="flex items-center gap-3">
                      <div className="w-28 shrink-0 text-xs font-semibold text-slate-600 truncate">
                        {s.service}
                      </div>
                      <div className="flex-1 bg-slate-100 rounded-lg overflow-hidden h-6 relative">
                        <div
                          className="h-full bg-gradient-to-r from-sky-500 to-sky-600 rounded-lg transition-all"
                          style={{ width: `${pct}%` }}
                        />
                        <div className="absolute inset-0 flex items-center px-3 text-xs font-bold text-white mix-blend-difference">
                          {formatSGDShort(s.revenue)} · {s.jobs}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function MetricCard({
  icon, label, value, accent,
}: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-slate-100 p-4 shadow-sm">
      <div className={cn('inline-flex w-10 h-10 rounded-xl items-center justify-center mb-2', accent)}>
        {icon}
      </div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-extrabold text-slate-900 mt-0.5 tracking-tight">{value}</p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center py-12 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
        <BarChart3 className="w-6 h-6 text-slate-300" />
      </div>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}
