'use client';
import { JobCard } from '@/components/jobs/JobCard';
import { Input } from '@/components/ui/input';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/authStore';
import type { Job } from '@/types';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Inbox,
  List as ListIcon,
  Loader2,
  Search,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

type ViewMode = 'list' | 'calendar';
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
  // Calendar-view state — anchor month for the grid + optional selected
  // day filter. Selecting a day in calendar view scopes the list under
  // the grid to just that date so ops can drill in without leaving the
  // page. Clearing (clicking the selected day again) shows the whole
  // month.
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [calendarAnchor, setCalendarAnchor] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
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
    if (viewMode === 'calendar' && selectedDate) {
      list = list.filter((j) => j.Start_Date === selectedDate);
    }
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
          {/* List / Calendar toggle — segmented control. Calendar view
              shows a month grid above the results with a job-count dot
              per day; clicking a day filters the list below to that
              date. Clicking the same day again clears the filter. */}
          <div className="h-11 inline-flex items-center rounded-xl bg-white ring-1 ring-slate-200 p-1">
            <button
              type="button"
              onClick={() => { setViewMode('list'); setSelectedDate(null); }}
              className={cn(
                'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium transition-colors',
                viewMode === 'list'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 hover:bg-slate-50',
              )}
              aria-pressed={viewMode === 'list'}
            >
              <ListIcon className="w-4 h-4" />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={cn(
                'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium transition-colors',
                viewMode === 'calendar'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 hover:bg-slate-50',
              )}
              aria-pressed={viewMode === 'calendar'}
            >
              <CalendarDays className="w-4 h-4" />
              <span className="hidden sm:inline">Calendar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Calendar grid — only rendered in calendar view. Sits above the
          status tabs + list so ops sees the whole month at a glance. */}
      {viewMode === 'calendar' && (
        <CalendarGrid
          anchor={calendarAnchor}
          onAnchorChange={setCalendarAnchor}
          jobs={jobs}
          selectedDate={selectedDate}
          onSelectDate={(d) => setSelectedDate((prev) => (prev === d ? null : d))}
        />
      )}

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

// Format a Date as YYYY-MM-DD in LOCAL time (not UTC — .toISOString() shifts
// to UTC and drops us into the previous day for SGT users past 8 AM UTC).
// The jobs table's Start_Date is stored as a plain YYYY-MM-DD string in
// Singapore time so we must match that convention when keying the grid.
function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface CalendarGridProps {
  anchor: Date;
  onAnchorChange: (d: Date) => void;
  jobs: Job[];
  selectedDate: string | null;
  onSelectDate: (d: string) => void;
}

function CalendarGrid({ anchor, onAnchorChange, jobs, selectedDate, onSelectDate }: CalendarGridProps) {
  // Group all fetched jobs by Start_Date → per-day counts + status flavour
  // for the coloured dot rendered inside each cell. Only jobs on the
  // currently-viewed month are surfaced, but the counts across the
  // fetched set are still available if the user changes month.
  const byDate = useMemo(() => {
    const map: Record<string, { total: number; active: number; done: number; cancelled: number }> = {};
    for (const j of jobs) {
      const d = j.Start_Date;
      if (!d) continue;
      const s = (j.lifecycle_state || '').toLowerCase();
      const bucket = map[d] ?? (map[d] = { total: 0, active: 0, done: 0, cancelled: 0 });
      bucket.total++;
      if (s === 'cancelled' || s === 'deleted') bucket.cancelled++;
      else if (s === 'completed') bucket.done++;
      else bucket.active++;
    }
    return map;
  }, [jobs]);

  const monthLabel = `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
  const today = ymdLocal(new Date());

  // Build a 6-row × 7-col grid (42 cells) starting on the Sunday on or
  // before the 1st of the month. Simpler than variable-height grids and
  // matches how most calendar UIs render.
  const cells: { date: Date; iso: string; inMonth: boolean }[] = useMemo(() => {
    const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay()); // roll back to Sunday
    const out: { date: Date; iso: string; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      out.push({
        date: d,
        iso: ymdLocal(d),
        inMonth: d.getMonth() === anchor.getMonth(),
      });
    }
    return out;
  }, [anchor]);

  const stepMonth = (delta: number) => {
    onAnchorChange(new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1));
  };
  const jumpToday = () => {
    const now = new Date();
    onAnchorChange(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm p-4 sm:p-5 mb-4">
      {/* Header — month label + nav */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base sm:text-lg font-bold text-slate-900">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => stepMonth(-1)}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
          <button
            type="button"
            onClick={jumpToday}
            className="h-8 px-3 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => stepMonth(1)}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_HEADERS.map((w) => (
          <div key={w} className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center py-1">
            {w}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map(({ date, iso, inMonth }) => {
          const bucket = byDate[iso];
          const isToday = iso === today;
          const isSelected = selectedDate === iso;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelectDate(iso)}
              disabled={!inMonth && !bucket}
              className={cn(
                'relative min-h-[48px] sm:min-h-[64px] rounded-lg text-left p-1.5 sm:p-2 transition-colors border',
                isSelected
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : isToday
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : inMonth
                  ? 'bg-white border-slate-100 hover:bg-slate-50 text-slate-700'
                  : 'bg-slate-50/40 border-transparent text-slate-300',
                bucket && !isSelected && 'cursor-pointer',
                !bucket && !inMonth && 'cursor-default',
              )}
            >
              <span className={cn('text-xs sm:text-sm font-semibold', isSelected && 'text-white')}>
                {date.getDate()}
              </span>
              {bucket && (
                <div className="mt-1 flex flex-wrap gap-0.5">
                  {bucket.active > 0 && (
                    <span
                      className={cn(
                        'inline-flex items-center justify-center text-[10px] font-bold rounded px-1 min-w-[16px] h-4',
                        isSelected ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700',
                      )}
                      title={`${bucket.active} active`}
                    >
                      {bucket.active}
                    </span>
                  )}
                  {bucket.done > 0 && (
                    <span
                      className={cn(
                        'inline-flex items-center justify-center text-[10px] font-bold rounded px-1 min-w-[16px] h-4',
                        isSelected ? 'bg-white/25 text-white' : 'bg-sky-100 text-sky-700',
                      )}
                      title={`${bucket.done} completed`}
                    >
                      {bucket.done}
                    </span>
                  )}
                  {bucket.cancelled > 0 && (
                    <span
                      className={cn(
                        'inline-flex items-center justify-center text-[10px] font-bold rounded px-1 min-w-[16px] h-4',
                        isSelected ? 'bg-white/25 text-white' : 'bg-rose-100 text-rose-700',
                      )}
                      title={`${bucket.cancelled} cancelled`}
                    >
                      {bucket.cancelled}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend + selected-date summary */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-amber-500" /> Active
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-sky-500" /> Completed
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-rose-500" /> Cancelled
          </span>
        </div>
        {selectedDate && (
          <button
            type="button"
            onClick={() => onSelectDate(selectedDate)}
            className="text-emerald-600 font-semibold hover:text-emerald-700"
          >
            Clear date filter
          </button>
        )}
      </div>
    </div>
  );
}
