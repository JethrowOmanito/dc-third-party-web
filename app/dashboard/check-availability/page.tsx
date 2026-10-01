'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  format,
  addDays,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  addMonths,
  differenceInCalendarMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2, CalendarDays, Clock, MessageCircle, X } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type Slot = {
  start: string;
  end: string;
  label: string;
  fee: number;
  available: boolean;
  // Server flags added for the 2 h same-day lead-time gate. Lets the UI
  // distinguish 'Full' (capacity exhausted) from 'Too soon' (within the
  // 2 h window on today) instead of lumping both as "Full".
  tooSoon?: boolean;
  full?: boolean;
};

type ApiResponse = {
  slots: Slot[];
  unconfigured?: boolean;
  error?: string;
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toDateStr(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export default function CheckAvailabilityPage() {
  const [date, setDate] = useState<Date>(() => startOfDay(new Date()));
  const [monthOffset, setMonthOffset] = useState(0);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [unconfigured, setUnconfigured] = useState(false);
  const [error, setError] = useState('');
  const [showSheet, setShowSheet] = useState(false);

  const today = useMemo(() => startOfDay(new Date()), []);
  const maxDate = useMemo(() => addDays(today, 90), [today]);
  const maxMonthOffset = useMemo(() => differenceInCalendarMonths(maxDate, today), [maxDate, today]);
  const monthStart = useMemo(() => startOfMonth(addMonths(today, monthOffset)), [today, monthOffset]);
  const gridDays = useMemo(() => {
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [monthStart]);

  useEffect(() => {
    if (showSheet) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [showSheet]);

  const fetchSlots = useCallback(async (d: Date, signal: AbortSignal) => {
    setLoading(true);
    setError('');
    setUnconfigured(false);
    try {
      const res = await fetch(`/api/availability?date=${toDateStr(d)}`, { signal });
      const json: ApiResponse = await res.json();
      if (!res.ok) { setError(json.error ?? 'Failed to load.'); setSlots([]); return; }
      if (json.unconfigured) { setUnconfigured(true); setSlots([]); return; }
      setSlots(json.slots ?? []);
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      setError('Network error. Please try again.');
      setSlots([]);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchSlots(date, controller.signal);
    return () => controller.abort();
  }, [date, fetchSlots]);

  const availableCount = slots.filter(s => s.available).length;

  const handleDateSelect = (day: Date, openSheet: boolean) => {
    if (day < today || day > maxDate) return;
    setDate(startOfDay(day));
    if (openSheet) setShowSheet(true);
  };

  return (
    // Natural height — the calendar sizes to its 6-row content and the
    // slot panel grows with its list. Previous h-[calc(100vh-6rem)]
    // forced the grid to stretch vertically which blew the date-row
    // gaps out to hundreds of pixels on desktop.
    // Edge-to-edge white surface, mirroring the booking-wizard fix.
    // The outer DashboardLayout wraps <main> in p-4/p-6 which previously
    // leaked slate-50 gutters on both sides. -m cancels all four so the
    // calendar + slot cards fill the viewport width. No max-w cap: on
    // ultra-wide screens the 2-col grid naturally caps the slot panel
    // at 460px and the calendar flexes.
    //
    // The DashboardLayout TopBar already renders a "Check Availability"
    // title + subtitle from its route-title map. We no longer repeat it
    // here (previous code had 2 extra copies, 3 total on-screen).
    <div className="min-h-screen bg-white -m-4 sm:-m-6 pb-16">
      <div className="px-4 sm:px-6 lg:px-10 xl:px-14 pt-5">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)] gap-5 items-start">
        {/* Calendar card — matches design mock: header strip with
            calendar icon badge, month nav as circular arrow buttons,
            square outlined date cells, legend row at the bottom. */}
        <div className="rounded-3xl bg-white ring-1 ring-slate-100 shadow-sm p-5 lg:p-6">
          {/* Month nav — circular buttons flanking the month label.
              No duplicate "Check Availability" header here; the TopBar
              already carries the page title. */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => setMonthOffset(o => Math.max(0, o - 1))}
              disabled={monthOffset === 0}
              aria-label="Previous month"
              className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <div className="text-lg font-extrabold text-slate-900">
              {format(monthStart, 'MMMM yyyy')}
            </div>
            <button
              type="button"
              onClick={() => setMonthOffset(o => Math.min(maxMonthOffset, o + 1))}
              disabled={monthOffset === maxMonthOffset}
              aria-label="Next month"
              className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center"
            >
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>

          {/* Day-of-week labels */}
          <div className="grid grid-cols-7 gap-1.5 mb-2">
            {DAY_LABELS.map(d => (
              <div key={d} className="flex items-center justify-center py-1">
                <span className={cn(
                  'text-[10px] font-bold uppercase tracking-widest',
                  d === 'Sun' ? 'text-red-500' : 'text-slate-400',
                )}>
                  {d}
                </span>
              </div>
            ))}
          </div>

          {/* Date grid — square outlined cells per the mock. Empty cells
              in the leading/trailing week rows still render with the
              light border so the grid reads as a cohesive block. */}
          <div className="grid grid-cols-7 gap-1.5">
            {gridDays.map((day, idx) => {
              const inMonth = day.getMonth() === monthStart.getMonth();
              const disabled = day < today || day > maxDate;
              const isSelected = isSameDay(day, date);
              const isToday = isSameDay(day, today);
              const isSun = day.getDay() === 0;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => !disabled && inMonth && handleDateSelect(day, true)}
                  disabled={disabled || !inMonth}
                  className={cn(
                    'relative aspect-square rounded-2xl border transition-all flex flex-col items-center justify-center text-base font-bold',
                    !inMonth && 'border-slate-100 bg-transparent cursor-default',
                    inMonth && isSelected && 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-400/30',
                    inMonth && !isSelected && disabled && 'border-slate-100 text-slate-300 cursor-not-allowed',
                    inMonth && !isSelected && !disabled && isSun && 'border-slate-100 text-red-500 hover:bg-red-50 active:scale-[0.97]',
                    inMonth && !isSelected && !disabled && !isSun && 'border-slate-100 text-slate-800 hover:bg-slate-50 hover:border-slate-200 active:scale-[0.97]',
                  )}
                >
                  {inMonth ? day.getDate() : ''}
                  {inMonth && isToday && !disabled && (
                    <div className={cn(
                      'absolute bottom-1.5 w-1.5 h-1.5 rounded-full',
                      isSelected ? 'bg-white' : 'bg-emerald-500',
                    )} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend row — matches the slot panel's legend so partners
              see the same key next to the date they pick. */}
          <div className="mt-5 px-4 py-3 rounded-2xl bg-slate-50/70 flex flex-wrap gap-x-5 gap-y-2 items-center">
            <div className="inline-flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold text-slate-600">Available</span>
            </div>
            <div className="inline-flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-400" />
              <span className="text-xs font-semibold text-slate-600">Full</span>
            </div>
            <div className="inline-flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
              <span className="text-xs font-semibold text-slate-600">Too soon (≥ 2 h lead)</span>
            </div>
          </div>
        </div>

        {/* Slots panel — matches the design mock: light-blue calendar
            icon badge in the header, inline legend pills, slot cards
            with coloured clock badges + chevron. */}
        <div className="hidden lg:flex flex-col rounded-3xl bg-white ring-1 ring-slate-100 shadow-sm max-h-[calc(100vh-10rem)] p-5">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100 flex-shrink-0">
            <div className="w-11 h-11 rounded-xl bg-sky-100 flex items-center justify-center text-sky-600 flex-shrink-0">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                {format(date, 'EEEE, MMM d')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-tight">
                {loading ? 'Loading slots…' : unconfigured ? 'Not yet configured' : `${availableCount} slot${availableCount !== 1 ? 's' : ''} available`}
              </p>
            </div>
          </div>
          <div className="pt-4 overflow-y-auto flex-1">
            <SlotList loading={loading} slots={slots} error={error} unconfigured={unconfigured} />
          </div>
        </div>
      </div>
      </div>

      {/* Mobile bottom sheet — sits ABOVE the mobile bottom nav + iOS
          safe area. Previously max-h-[85vh] + fixed-inset-0-items-end
          put the sheet underneath the bottom nav + the Clara FAB, which
          clipped the last slot ("Evening Arrival" invisible). Now the
          sheet reserves 6rem at the bottom for the nav + FAB and the
          scrollable area carries its own safe-area padding. */}
      {showSheet && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSheet(false)} />
          <div
            className="relative bg-white w-full rounded-t-3xl flex flex-col shadow-2xl"
            style={{
              maxHeight: 'calc(100vh - 6rem - env(safe-area-inset-bottom, 0px))',
              marginBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
            }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {format(date, 'EEEE, MMM d')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {loading ? 'Loading slots…' : unconfigured ? 'Not yet configured' : `${availableCount} slot${availableCount !== 1 ? 's' : ''} available`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSheet(false)}
                className="p-2 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}>
              <SlotList loading={loading} slots={slots} error={error} unconfigured={unconfigured} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SlotList({
  loading,
  slots,
  error,
  unconfigured,
}: {
  loading: boolean;
  slots: Slot[];
  error: string;
  unconfigured: boolean;
}) {
  if (loading) {
    return (
      <div className="py-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="py-6 text-center text-xs text-red-600">
        {error}
      </div>
    );
  }
  if (unconfigured) {
    return (
      <div className="py-8 text-center">
        <CalendarDays className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-xs text-slate-500">This date isn&apos;t configured yet.</p>
      </div>
    );
  }
  if (slots.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-slate-500">
        No slots for this date.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Legend — pill style matching the mock. Each state gets its own
          soft-tinted pill so it reads at a glance. */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-semibold text-emerald-700">Available</span>
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-100">
          <span className="w-2 h-2 rounded-full bg-orange-400" />
          <span className="text-xs font-semibold text-orange-700">Full</span>
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200">
          <span className="w-2 h-2 rounded-full bg-slate-400" />
          <span className="text-xs font-semibold text-slate-600">Too soon (≥ 2 h lead)</span>
        </span>
      </div>

      {slots.map((s, i) => {
        const state: 'available' | 'full' | 'too_soon' =
          s.tooSoon ? 'too_soon' : s.full ? 'full' : s.available ? 'available' : 'full';
        const isClickable = state === 'available';
        const content = (
          <>
            {/* Clock badge — colour reflects state */}
            <div
              className={cn(
                'w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0',
                state === 'available' && 'bg-emerald-100 text-emerald-600',
                state === 'full'      && 'bg-orange-100 text-orange-500',
                state === 'too_soon'  && 'bg-slate-200 text-slate-400',
              )}
            >
              <Clock className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-slate-900 leading-tight">{s.label}</p>
              <p className="inline-flex items-center gap-1.5 text-xs text-slate-500 mt-1 leading-snug">
                <Clock className="w-3 h-3 text-slate-400" />
                {s.start} — {s.end}
                {s.fee > 0 && <span className="text-orange-600 font-bold ml-1">+S${s.fee}</span>}
              </p>
              {state === 'too_soon' && (
                <p className="text-xs text-slate-500 font-semibold mt-1.5 leading-snug">
                  Too soon — needs ≥ 2 h lead time. Pick a later slot or tomorrow.
                </p>
              )}
              {state === 'full' && (
                <p className="text-xs text-orange-700 font-semibold mt-1.5 leading-snug">
                  Fully booked — try another slot or waitlist via admin.
                </p>
              )}
            </div>
            {/* Right-side action: chip or button + chevron */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {state === 'available' ? (
                <span className="text-xs font-black text-white bg-emerald-600 group-hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition">
                  Book
                </span>
              ) : state === 'full' ? (
                <span className="text-xs font-bold text-orange-700 bg-orange-100 px-3 py-1.5 rounded-lg">
                  Full
                </span>
              ) : (
                <span className="text-xs font-bold text-slate-500 bg-slate-200 px-3 py-1.5 rounded-lg">
                  Too soon
                </span>
              )}
              <ChevronRight className={cn(
                'w-4 h-4',
                state === 'available' ? 'text-emerald-500' : 'text-slate-300',
              )} />
            </div>
          </>
        );
        const className = cn(
          'group flex items-center gap-3 p-4 rounded-2xl border transition',
          state === 'available' && 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-300',
          state === 'full'      && 'border-orange-100 bg-orange-50/50',
          state === 'too_soon'  && 'border-slate-200 bg-slate-50',
          !isClickable && 'cursor-default',
        );
        return isClickable ? (
          <Link key={i} href="/dashboard/booking/new" className={className}>
            {content}
          </Link>
        ) : (
          <div key={i} className={className}>
            {content}
          </div>
        );
      })}

      {/* WhatsApp admin CTA — matches the mock: solid green circle with
          WhatsApp-style icon, outlined 'Chat' pill on the right. */}
      <a
        href="https://wa.me/6588656751?text=Hi%20Doctor%20Clean%2C%20I%27d%20like%20to%20check%20availability%20or%20book%20outside%20the%20listed%20slots."
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-3 p-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-300 transition"
      >
        <div className="w-11 h-11 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
          <MessageCircle className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-slate-900 leading-tight">Chat admin via WhatsApp</p>
          <p className="text-xs text-slate-500 mt-1 leading-snug">
            All slots full or need a custom window? We&apos;ll sort it on WA.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-black text-emerald-700 bg-white px-3 py-1.5 rounded-lg border border-emerald-300 group-hover:bg-emerald-100 transition">
            Chat
          </span>
          <ChevronRight className="w-4 h-4 text-emerald-500" />
        </div>
      </a>
    </div>
  );
}
