'use client';
import { JobCard } from '@/components/jobs/JobCard';
import { Input } from '@/components/ui/input';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/authStore';
import type { Job } from '@/types';
import {
  ChevronDown,
  Filter,
  Inbox,
  Loader2,
  Search,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

interface JobsListProps {
  filter?: 'today' | 'incoming' | 'all';
  title?: string;
}

type StatusKey = 'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled';
type SortKey = 'newest' | 'oldest' | 'upcoming';

const STATUS_TABS: { key: StatusKey; label: string }[] = [
  { key: 'all', label: 'All Jobs' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Sort by: Newest' },
  { key: 'oldest', label: 'Sort by: Oldest' },
  { key: 'upcoming', label: 'Sort by: Upcoming' },
];

function statusForJob(job: Job): StatusKey {
  const s = (job.lifecycle_state || '').toLowerCase();
  if (s === 'cancelled') return 'cancelled';
  if (s === 'completed') return 'completed';
  if (s === 'started' || s === 'in_transit') return 'confirmed';
  return 'pending';
}

export function JobsList({ filter = 'all', title }: JobsListProps) {
  const { user } = useAuthStore();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState<StatusKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [sortOpen, setSortOpen] = useState(false);
  const supabase = getSupabaseClient();

  const fetchJobs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Company-wide filter: show every job under this partner's company,
      // not just the ones the current employee booked. Falls back to
      // owned_by_third_party for legacy sessions with no company_id.
      const companyFilter = user.company_id
        ? { column: 'partner_company_id' as const, value: user.company_id }
        : { column: 'owned_by_third_party' as const, value: user.id };

      let query = supabase
        .from('events')
        .select(
          'id, Title, Start_Date, End_Date, Start_Time, End_Time, Start_Time_Display, End_Time_Display, Service_Type, service_subtype, Name, Assign_Cleaner, lifecycle_state, commission_percentage, rebate_amount, company_reference, Extra_Service'
        )
        .eq(companyFilter.column, companyFilter.value)
        .order('Start_Date', { ascending: false });

      const today = new Date().toISOString().split('T')[0];
      if (filter === 'today') {
        query = query.eq('Start_Date', today);
      } else if (filter === 'incoming') {
        query = query.gt('Start_Date', today);
      }

      const { data } = await query.limit(200);
      setJobs((data as Job[]) || []);
    } finally {
      setLoading(false);
    }
  }, [user, filter]);

  useEffect(() => {
    fetchJobs();
    const channel = supabase
      .channel(`jobs-list-${filter}`)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'events' }, fetchJobs)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchJobs]);

  const counts = useMemo(() => {
    const c: Record<StatusKey, number> = {
      all: jobs.length,
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const j of jobs) c[statusForJob(j)]++;
    return c;
  }, [jobs]);

  const filtered = useMemo(() => {
    let list = jobs;
    if (activeStatus !== 'all') list = list.filter((j) => statusForJob(j) === activeStatus);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (j) =>
          j.Title?.toLowerCase().includes(q) ||
          j.Service_Type?.toLowerCase().includes(q) ||
          j.company_reference?.toLowerCase().includes(q)
      );
    }
    list = [...list];
    if (sortKey === 'newest') {
      list.sort((a, b) => (b.Start_Date || '').localeCompare(a.Start_Date || ''));
    } else if (sortKey === 'oldest') {
      list.sort((a, b) => (a.Start_Date || '').localeCompare(b.Start_Date || ''));
    } else {
      const today = new Date().toISOString().split('T')[0];
      list.sort((a, b) => {
        const aFuture = (a.Start_Date || '') >= today;
        const bFuture = (b.Start_Date || '') >= today;
        if (aFuture && !bFuture) return -1;
        if (!aFuture && bFuture) return 1;
        return (a.Start_Date || '').localeCompare(b.Start_Date || '');
      });
    }
    return list;
  }, [jobs, activeStatus, search, sortKey]);

  const pageTitle =
    title || (filter === 'today' ? "Today's Jobs" : filter === 'incoming' ? 'Incoming' : 'All Jobs');
  const pageSubtitle =
    filter === 'today'
      ? "Jobs scheduled for today."
      : filter === 'incoming'
      ? 'Upcoming jobs across your calendar.'
      : 'View and manage all service requests in one place.';

  return (
    <div className="max-w-7xl mx-auto pb-12 animate-in fade-in duration-300">
      {/* Page header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">
            {pageTitle}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{pageSubtitle}</p>
        </div>
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <div className="relative flex-1 lg:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search for jobs, services, or references…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 pl-11 pr-4 bg-white rounded-xl ring-1 ring-slate-200 border-0 shadow-none focus-visible:ring-2 focus-visible:ring-emerald-500 text-sm"
            />
          </div>
          <button
            type="button"
            className="h-11 px-4 inline-flex items-center gap-2 rounded-xl bg-white ring-1 ring-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Filter className="w-4 h-4" />
            Filter
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-2 lg:gap-3 mb-4 overflow-x-auto -mx-1 px-1 pb-1">
        {STATUS_TABS.map((tab) => {
          const isActive = activeStatus === tab.key;
          const count = counts[tab.key];
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveStatus(tab.key)}
              className={cn(
                'shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors',
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded-md text-xs font-bold',
                  isActive
                    ? 'bg-white/20 text-white'
                    : tab.key === 'pending'
                    ? 'bg-amber-100 text-amber-700'
                    : tab.key === 'confirmed'
                    ? 'bg-emerald-100 text-emerald-700'
                    : tab.key === 'completed'
                    ? 'bg-sky-100 text-sky-700'
                    : tab.key === 'cancelled'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-slate-100 text-slate-700'
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-500">
            <span className="font-semibold text-slate-900">{filtered.length}</span>{' '}
            {filtered.length === 1 ? 'job' : 'jobs'} found
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-1.5 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-emerald-600 uppercase tracking-widest">
              Live Sync Active
            </span>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setSortOpen((v) => !v)}
              onBlur={() => setTimeout(() => setSortOpen(false), 150)}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-white ring-1 ring-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {SORT_OPTIONS.find((s) => s.key === sortKey)?.label}
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>
            {sortOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 min-w-[200px] bg-white rounded-xl ring-1 ring-slate-200 shadow-lg py-1">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onMouseDown={() => {
                      setSortKey(opt.key);
                      setSortOpen(false);
                    }}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm hover:bg-slate-50',
                      opt.key === sortKey ? 'text-emerald-600 font-semibold' : 'text-slate-700'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500 rounded-full blur-xl opacity-10 animate-pulse" />
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600 relative" />
          </div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
            Fetching Jobs…
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-24 px-6 text-center rounded-2xl bg-white ring-1 ring-slate-100">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
            <Inbox className="w-7 h-7 text-slate-300" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">
            {search ? 'No matches' : 'No jobs found'}
          </h3>
          <p className="text-sm text-slate-500 max-w-[280px] leading-relaxed">
            {search
              ? `We couldn't find anything matching "${search}".`
              : activeStatus === 'all'
              ? 'Your job list is currently empty.'
              : `No ${activeStatus} jobs at the moment.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
