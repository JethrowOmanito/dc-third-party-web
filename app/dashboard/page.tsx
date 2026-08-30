'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  Gift,
  LineChart,
  Loader2,
  Percent,
  Star,
  TrendingUp,
  Trophy,
  Wallet,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getGreeting, getServiceDisplayName, cn } from '@/lib/utils';

interface Stats {
  todayCount: number;
  incomingCount: number;
  totalCount: number;
  totalCommission: number;
  totalRebate: number;
}

interface UpcomingJob {
  id: string;
  Start_Date: string;
  Start_Time: string | null;
  Start_Time_Display: string | null;
  End_Time_Display: string | null;
  Service_Type: string | null;
  service_subtype: string | null;
  Name: string | null;
  Title: string | null;
  status: string | null;
  Assign_Cleaner: unknown;
}

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<Stats>({
    todayCount: 0,
    incomingCount: 0,
    totalCount: 0,
    totalCommission: 0,
    totalRebate: 0,
  });
  const [upcoming, setUpcoming] = useState<UpcomingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const [benefitsOpen, setBenefitsOpen] = useState(false);
  const supabase = getSupabaseClient();

  // Only depend on the fields we actually query with, so the /api/auth/me
  // poll every 30s doesn't retrigger loadData (it returns a new user object
  // reference every time, which was causing the flash on nav-back).
  const filterId = user?.company_id ?? user?.id ?? null;

  const loadData = useCallback(async () => {
    if (!user) return;
    // Show the full-page spinner only on the very first load. Subsequent
    // navigations back to the dashboard keep the existing content visible
    // and refresh silently.
    if (!firstLoadDone) setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      const companyFilter = user.company_id
        ? { column: 'partner_company_id' as const, value: user.company_id }
        : { column: 'owned_by_third_party' as const, value: user.id };

      const [allResult, upcomingResult] = await Promise.all([
        supabase
          .from('events')
          .select('id, Start_Date, commission_percentage, rebate_amount')
          .eq(companyFilter.column, companyFilter.value),
        supabase
          .from('events')
          .select('id, Start_Date, Start_Time, Start_Time_Display, End_Time_Display, Service_Type, service_subtype, Name, Title, status, Assign_Cleaner')
          .eq(companyFilter.column, companyFilter.value)
          .gte('Start_Date', today)
          .order('Start_Date', { ascending: true })
          .order('Start_Time', { ascending: true })
          .limit(3),
      ]);

      const jobs = allResult.data || [];
      const todayCount = jobs.filter((j) => j.Start_Date?.startsWith(today)).length;
      const incomingCount = jobs.filter((j) => j.Start_Date && j.Start_Date > today).length;
      const totalCommission = jobs.reduce((s, j) => s + (j.commission_percentage || 0), 0);
      const totalRebate = jobs.reduce((s, j) => s + (j.rebate_amount || 0), 0);

      setStats({ todayCount, incomingCount, totalCount: jobs.length, totalCommission, totalRebate });
      setUpcoming((upcomingResult.data as UpcomingJob[]) || []);
    } finally {
      setLoading(false);
      setFirstLoadDone(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterId]);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel('dashboard-events')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'events' }, loadData)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // UNIVERSAL HANDSHAKE: Account-wide recovery for post-payment redirect
  useEffect(() => {
    if (!user?.id) return;

    const scout = async () => {
      try {
        // userId is derived server-side from the JWT — no need to pass it,
        // and passing it would be ignored anyway.
        const res = await fetch(`/api/bookings/recent-success`);
        const data = await res.json();

        if (data.booking) {
          const { id, Ref_ID, stripe_payment_intent_id } = data.booking;

          try {
            const seenStr = localStorage.getItem('seen_success_bookings') || '[]';
            const seen = JSON.parse(seenStr);
            if (seen.includes(id)) return;
          } catch (e) {
            console.error('Error parsing seen bookings', e);
          }

          localStorage.removeItem('last_pushed_booking');
          localStorage.removeItem('last_pushed_ref');

          const intentParam = stripe_payment_intent_id
            ? `&payment_intent=${stripe_payment_intent_id}`
            : '';
          router.replace(
            `/dashboard/booking/success?id=${id}&ref=${Ref_ID}${intentParam}&redirect_status=succeeded`
          );
        }
      } catch (err) {
        console.error('[UniversalHandshake] Scout failed:', err);
      }
    };

    scout();
    const interval = setInterval(scout, 5000);
    return () => clearInterval(interval);
  }, [user, router]);

  const greeting = getGreeting();

  if (loading && !firstLoadDone) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <div className="relative">
          <div className="absolute inset-0 bg-emerald-500 rounded-full blur-xl opacity-20 scale-150 animate-pulse" />
          <Loader2 className="w-10 h-10 animate-spin text-emerald-600 relative" />
        </div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">
          Syncing Dashboard...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      <ApprovalBanner status={user?.approval_status} />
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-700 text-white shadow-xl shadow-emerald-900/20">
        {/* Decorative dots */}
        <svg
          className="absolute top-5 left-5 opacity-40"
          width="80"
          height="40"
          viewBox="0 0 80 40"
          aria-hidden="true"
        >
          {Array.from({ length: 4 }).map((_, row) =>
            Array.from({ length: 8 }).map((__, col) => (
              <circle
                key={`${row}-${col}`}
                cx={col * 10 + 4}
                cy={row * 10 + 4}
                r={1.4}
                fill="#a7f3d0"
              />
            ))
          )}
        </svg>

        {/* Wave curves right side */}
        <svg
          className="absolute top-0 right-0 h-full w-2/3 opacity-90 pointer-events-none"
          viewBox="0 0 800 400"
          preserveAspectRatio="xMaxYMid slice"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="wave1" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="wave2" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <path
            d="M 350,-50 C 250,150 550,250 400,450 L 900,450 L 900,-50 Z"
            fill="url(#wave1)"
          />
          <path
            d="M 500,-50 C 400,180 700,300 600,450 L 900,450 L 900,-50 Z"
            fill="url(#wave2)"
          />
          <path
            d="M 650,-50 C 550,220 850,350 780,450 L 900,450 L 900,-50 Z"
            fill="#ffffff"
            opacity="0.95"
          />
        </svg>

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 p-8 lg:p-10">
          <div className="max-w-xl">
            <span className="inline-block px-3 py-1 rounded-full bg-white/10 backdrop-blur text-[10px] font-bold tracking-[0.15em] uppercase ring-1 ring-white/20">
              Partner Portal V2.0
            </span>
            <p className="mt-4 text-sm text-emerald-100/80 font-medium">{greeting},</p>
            <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight mt-1">
              {user?.company_name || user?.username}
            </h1>
            <p className="mt-3 text-sm lg:text-base text-emerald-50/80 leading-relaxed">
              Manage your jobs, track performance
              <br className="hidden sm:block" />
              and grow your business with Doctor Clean.
            </p>
          </div>

          <div className="relative z-10 shrink-0 w-40 lg:w-56 h-24 lg:h-32 flex items-center justify-center bg-white/95 rounded-2xl p-3">
            <img
              src="https://agyzvknaqnamaoczxgsb.supabase.co/storage/v1/object/public/doctor-clean-files/uploads/doctor_clean_logo.542c4621e2b4379e4d95.png"
              alt="Doctor Clean"
              className="max-w-full max-h-full object-contain"
            />
          </div>
        </div>
      </section>

      {/* ============ TOP STAT CARDS ============ */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
        <StatCard
          icon={Wallet}
          iconBg="bg-emerald-100"
          iconColor="text-emerald-600"
          label="Total Commission"
          value={`$ ${stats.totalCommission.toFixed(2)}`}
          hint="Month to date"
          delta="0% vs last month"
          deltaTone="positive"
          trailingIcon={<TrendingUp className="w-4 h-4 text-emerald-500/60" />}
        />
        <StatCard
          icon={Gift}
          iconBg="bg-violet-100"
          iconColor="text-violet-600"
          label="Total Rebate"
          value={`$ ${stats.totalRebate.toFixed(2)}`}
          hint="Month to date"
          delta="0% vs last month"
          deltaTone="positive"
        />
        <div className="rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm p-6 flex flex-col justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center text-sky-600 shrink-0">
              <Trophy className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                Partner Tier
              </p>
              <p className="text-xl font-bold text-sky-600 mt-1">Standard Partner</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBenefitsOpen(true)}
            className="mt-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 self-start"
          >
            View benefits <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>

      {benefitsOpen && (
        <BenefitsModal
          user={user}
          onClose={() => setBenefitsOpen(false)}
        />
      )}

      {/* ============ TWO COLUMN: Overview / Performance | Upcoming Jobs ============ */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* LEFT column */}
        <div className="space-y-4 lg:space-y-6">
          {/* Overview card */}
          <div className="rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-bold text-slate-900">Overview</h2>
              <PeriodPill label="This Month" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <OverviewStat
                icon={CalendarDays}
                iconBg="bg-emerald-100"
                iconColor="text-emerald-600"
                label="Today's Jobs"
                value={stats.todayCount}
                sub={`${stats.todayCount} Active`}
                dotColor="bg-emerald-500"
              />
              <OverviewStat
                icon={Clock}
                iconBg="bg-amber-100"
                iconColor="text-amber-600"
                label="Incoming"
                value={stats.incomingCount}
                sub={`${stats.incomingCount} Queued`}
                dotColor="bg-amber-500"
              />
              <OverviewStat
                icon={Briefcase}
                iconBg="bg-sky-100"
                iconColor="text-sky-600"
                label="Total Jobs"
                value={stats.totalCount}
                sub="Lifetime"
                dotColor="bg-sky-500"
              />
            </div>
          </div>

          {/* Performance card */}
          <div className="rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-bold text-slate-900">Performance</h2>
              <PeriodPill label="This Month" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <PerformanceStat
                icon={LineChart}
                label="Completion Rate"
                value="0%"
                deltaLabel="vs last month"
                delta="0%"
              />
              <PerformanceStat
                icon={Star}
                label="Customer Rating"
                value="0.0"
                deltaLabel="vs last month"
                delta="0.0"
              />
            </div>
          </div>
        </div>

        {/* RIGHT column: Upcoming Jobs */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900">Upcoming Jobs</h2>
            <Link
              href="/dashboard/jobs/today"
              className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              View all
            </Link>
          </div>

          <div className="flex-1 divide-y divide-slate-100">
            {upcoming.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-14 h-14 mx-auto rounded-full bg-slate-50 flex items-center justify-center mb-3">
                  <CalendarDays className="w-6 h-6 text-slate-300" />
                </div>
                <p className="text-sm text-slate-500 font-medium">No upcoming jobs</p>
                <p className="text-xs text-slate-400 mt-1">
                  New bookings will appear here.
                </p>
              </div>
            ) : (
              upcoming.map((job) => (
                <UpcomingJobRow key={job.id} job={job} />
              ))
            )}
          </div>

          <Link
            href="/dashboard/jobs/today"
            className="mt-4 inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 font-semibold self-start"
          >
            View all jobs <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function BenefitsModal({
  user,
  onClose,
}: {
  user: ReturnType<typeof useAuthStore.getState>['user'];
  onClose: () => void;
}) {
  const discountType = user?.company_discount_type ?? null;
  const discountValue = Number(user?.company_discount_value ?? 0);
  const hasDiscount = discountType && discountValue > 0;
  const discountLabel = hasDiscount
    ? (discountType === 'percent' ? `${discountValue}% OFF` : `S$${discountValue.toFixed(2)} OFF`)
    : null;
  const terms = user?.company_payment_terms ?? 'upfront';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Your Partner Benefits</p>
            <p className="text-base font-bold text-slate-900 truncate">{user?.company_name ?? 'Partner'}</p>
          </div>
        </div>

        <div className="space-y-3">
          {/* Discount */}
          <div className={cn(
            'rounded-xl p-4 border',
            hasDiscount ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
          )}>
            <div className="flex items-start gap-3">
              <div className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                hasDiscount ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'
              )}>
                <Percent className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Discount</p>
                {hasDiscount ? (
                  <>
                    <p className="text-2xl font-black text-emerald-700 mt-0.5">{discountLabel}</p>
                    <p className="text-xs text-emerald-800/80 mt-1 leading-relaxed">
                      Applied automatically to every booking made under {user?.company_name ?? 'your company'}.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-base font-bold text-slate-500 mt-0.5">No discount set</p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Contact admin if a partner discount should be applied to your bookings.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Payment terms */}
          <div className={cn(
            'rounded-xl p-4 border',
            terms === 'upfront' ? 'bg-sky-50 border-sky-100' : 'bg-amber-50 border-amber-100'
          )}>
            <div className="flex items-start gap-3">
              <div className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                terms === 'upfront' ? 'bg-sky-100 text-sky-600' : 'bg-amber-100 text-amber-600'
              )}>
                <CreditCard className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Payment Terms</p>
                <p className={cn(
                  'text-base font-bold mt-0.5',
                  terms === 'upfront' ? 'text-sky-800' : 'text-amber-800'
                )}>
                  {terms === 'upfront' ? 'Upfront (Stripe)' : 'End of Month (invoiced)'}
                </p>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {terms === 'upfront'
                    ? 'You pay at booking time via Stripe. Booking is confirmed after successful payment.'
                    : 'Bookings are confirmed immediately. We invoice at month-end for all jobs.'}
                </p>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 text-center pt-1">
            Benefits are set by Doctor Clean admin and may change. Contact us on WhatsApp with any questions.
          </p>
        </div>
      </div>
    </div>
  );
}

function ApprovalBanner({ status }: { status?: 'pending' | 'approved' | 'rejected' }) {
  if (!status || status === 'approved') return null;
  if (status === 'pending') {
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">Your account is pending approval</p>
          <p className="text-xs text-amber-800/80 mt-0.5 leading-relaxed">
            You can browse your dashboard, but booking is disabled until an admin approves your application.
            We&apos;ll notify you via WhatsApp as soon as it&apos;s reviewed.
          </p>
        </div>
        <CheckCircle2 className="w-5 h-5 text-amber-300 shrink-0 mt-2" />
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-red-50 border border-red-200 p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-red-900">Your account was not approved</p>
        <p className="text-xs text-red-800/80 mt-0.5 leading-relaxed">
          Please contact admin on WhatsApp if you believe this is a mistake.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  hint,
  delta,
  deltaTone,
  trailingIcon,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  hint: string;
  delta: string;
  deltaTone: 'positive' | 'neutral';
  trailingIcon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm p-6">
      <div className="flex items-start gap-4">
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center shrink-0', iconBg, iconColor)}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{value}</span>
            {trailingIcon}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-slate-500">{hint}</span>
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold',
            deltaTone === 'positive'
              ? 'bg-emerald-50 text-emerald-600'
              : 'bg-slate-50 text-slate-500'
          )}
        >
          <TrendingUp className="w-3 h-3" /> {delta}
        </span>
      </div>
    </div>
  );
}

function OverviewStat({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  sub,
  dotColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: number;
  sub: string;
  dotColor: string;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-2">
      <div className={cn('w-12 h-12 rounded-full flex items-center justify-center', iconBg, iconColor)}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
      <p className="text-3xl font-extrabold text-slate-900 leading-none">{value}</p>
      <p className="inline-flex items-center gap-1 text-[11px] text-slate-500">
        <span className={cn('w-1.5 h-1.5 rounded-full', dotColor)} /> {sub}
      </p>
    </div>
  );
}

function PerformanceStat({
  icon: Icon,
  label,
  value,
  deltaLabel,
  delta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  deltaLabel: string;
  delta: string;
}) {
  return (
    <div className="rounded-xl bg-emerald-50/40 ring-1 ring-emerald-50 p-4 flex items-center gap-4">
      <div className="w-11 h-11 rounded-full bg-white ring-1 ring-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {deltaLabel}{' '}
          <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
            <TrendingUp className="w-3 h-3" /> {delta}
          </span>
        </p>
      </div>
    </div>
  );
}

function PeriodPill({ label }: { label: string }) {
  // Static badge — no action attached. Was previously a button-with-chevron
  // that looked like a dropdown but did nothing, so users clicked and got
  // no feedback. Rendered as span so it doesn't invite clicks.
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-50 ring-1 ring-slate-200 rounded-lg">
      {label}
    </span>
  );
}

function UpcomingJobRow({ job }: { job: UpcomingJob }) {
  const d = new Date(job.Start_Date);
  const month = MONTH_ABBR[d.getMonth()] ?? '';
  const day = String(d.getDate()).padStart(2, '0');

  // Primary label: sub-service type if present, else fall back to Service_Type.
  const rawSub = job.service_subtype || job.Service_Type || 'Cleaning';
  const primary = getServiceDisplayName(String(rawSub).replace(/_/g, ' '));

  // Time window: prefer the human-readable display strings; fall back to
  // the raw Start_Time only if display is missing.
  const timeWindow = job.Start_Time_Display && job.End_Time_Display
    ? `${job.Start_Time_Display} — ${job.End_Time_Display}`
    : job.Start_Time_Display
      ? job.Start_Time_Display
      : job.Start_Time
        ? formatTime(job.Start_Time)
        : '';

  const jobTitle = job.Title || job.Name || '';

  const status = (job.status || 'pending').toLowerCase();
  const isConfirmed = ['confirmed', 'assigned', 'completed', 'in_progress'].includes(status);

  return (
    <Link
      href={`/dashboard/jobs`}
      className="flex items-start gap-4 py-4 hover:bg-slate-50/60 -mx-2 px-2 rounded-lg transition-colors"
    >
      <div className="w-14 shrink-0 text-center pt-0.5">
        <p className="text-[10px] font-bold text-slate-400 tracking-widest">{month}</p>
        <p className="text-lg font-extrabold text-slate-900 leading-none">{day}</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 truncate">{primary}</p>
        {timeWindow && (
          <p className="text-xs text-slate-500 mt-0.5">{timeWindow}</p>
        )}
        {jobTitle && (
          <p className="text-xs text-slate-400 mt-0.5 truncate italic">{jobTitle}</p>
        )}
      </div>
      <span
        className={cn(
          'inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold mt-0.5',
          isConfirmed
            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
            : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
        )}
      >
        {isConfirmed ? 'Confirmed' : 'Pending'}
      </span>
      <ArrowRight className="w-4 h-4 text-slate-300 shrink-0 mt-1.5" />
    </Link>
  );
}

function formatTime(t: string) {
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return t;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function countCleaners(val: unknown): number {
  if (!val) return 0;
  if (Array.isArray(val)) return val.length;
  if (typeof val === 'string') {
    if (!val.trim()) return 0;
    return val.split(',').filter((s) => s.trim().length > 0).length;
  }
  return 0;
}
