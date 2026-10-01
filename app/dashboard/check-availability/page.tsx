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
import { ChevronLeft, ChevronRight, Loader2, CalendarDays, Clock, X } from 'lucide-react';
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
    // Lock the page to viewport height so nothing scrolls the layout itself.
    // Calendar cells auto-size to fill available space via CSS grid + minmax.
    <div className="max-w-6xl mx-auto flex flex-col h-[calc(100vh-6rem)] min-h-[520px]">
      {/* Inline header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
          <CalendarDays className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 leading-tight">Check Availability</h1>
          <p className="text-xs text-slate-500 leading-tight">Deep Cleaning — tap a date to see slots</p>
        </div>
      </div>

      {/* 2-column grid that fills remaining vertical space */}
      <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] gap-4">
        {/* Calendar — auto-fills its column */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <button
              type="button"
              onClick={() => setMonthOffset(o => Math.max(0, o - 1))}
              disabled={monthOffset === 0}
              className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <div className="text-base font-bold text-slate-800">
              {format(monthStart, 'MMMM yyyy')}
            </div>
            <button
              type="button"
              onClick={() => setMonthOffset(o => Math.min(maxMonthOffset, o + 1))}
              disabled={monthOffset === maxMonthOffset}
              className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex-shrink-0">
            {DAY_LABELS.map(d => <div key={d}>{d}</div>)}
          </div>

          <div className="grid grid-cols-7 grid-rows-6 gap-1 flex-1 min-h-0">
            {gridDays.map((day, idx) => {
              const inMonth = day.getMonth() === monthStart.getMonth();
              const disabled = day < today || day > maxDate;
              const isSelected = isSameDay(day, date);
              const isToday = isSameDay(day, today);

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => !disabled && inMonth && handleDateSelect(day, true)}
                  disabled={disabled || !inMonth}
                  className={cn(
                    'rounded-lg text-sm font-semibold transition-all flex items-center justify-center min-h-0',
                    !inMonth && 'opacity-0 pointer-events-none',
                    isSelected && 'bg-emerald-600 text-white shadow shadow-emerald-500/30',
                    !isSelected && isToday && 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
                    !isSelected && !isToday && !disabled && inMonth && 'text-slate-700 hover:bg-slate-100',
                    disabled && inMonth && 'text-slate-300 cursor-not-allowed'
                  )}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Slots panel — inline on desktop, sheet on mobile */}
        <div className="hidden lg:flex flex-col rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm min-h-0">
          <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
            <h2 className="text-sm font-bold text-slate-900 leading-tight">
              {format(date, 'EEEE, MMM d')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 leading-tight">
              {loading ? 'Loading slots…' : unconfigured ? 'Not yet configured' : `${availableCount} slot${availableCount !== 1 ? 's' : ''} available`}
            </p>
          </div>
          <div className="p-3 flex-1 overflow-y-auto min-h-0">
            <SlotList loading={loading} slots={slots} error={error} unconfigured={unconfigured} />
          </div>
        </div>
      </div>

      {/* Mobile bottom sheet */}
      {showSheet && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSheet(false)} />
          <div className="relative bg-white w-full max-h-[85vh] rounded-t-3xl p-5 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
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
            <SlotList loading={loading} slots={slots} error={error} unconfigured={unconfigured} />
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
    <div className="space-y-2.5">
      {/* Legend — explains the three slot states so partners don't have to
          guess what "greyed out" means. */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 items-center px-2 py-2 rounded-lg bg-slate-50 border border-slate-100">
        <div className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-[11px] font-semibold text-slate-600">Available</span>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orange-400" />
          <span className="text-[11px] font-semibold text-slate-600">Full</span>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-300" />
          <span className="text-[11px] font-semibold text-slate-600">Too soon (≥ 2 h lead)</span>
        </div>
      </div>

      {slots.map((s, i) => {
        // Three-state styling. Server now flags tooSoon separately from
        // full so we can show distinct copy/colour instead of lumping
        // both under one grey "Full" chip.
        const state: 'available' | 'full' | 'too_soon' =
          s.tooSoon ? 'too_soon' : s.full ? 'full' : s.available ? 'available' : 'full';
        return (
          <div
            key={i}
            className={cn(
              'flex items-center justify-between p-3 rounded-lg border transition',
              state === 'available' && 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50',
              state === 'full'      && 'border-orange-100 bg-orange-50/40',
              state === 'too_soon'  && 'border-slate-200 bg-slate-50 opacity-70',
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
                  state === 'available' && 'bg-emerald-100 text-emerald-600',
                  state === 'full'      && 'bg-orange-100 text-orange-600',
                  state === 'too_soon'  && 'bg-slate-200 text-slate-400',
                )}
              >
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate leading-tight">{s.label}</p>
                <p className="text-xs text-slate-500 mt-1 leading-snug">
                  {s.start} — {s.end}
                  {s.fee > 0 && <span className="text-orange-600 font-semibold"> · +S${s.fee}</span>}
                </p>
                {state === 'too_soon' && (
                  <p className="text-[11px] text-slate-500 font-semibold mt-1 leading-snug">
                    Too soon — needs ≥ 2 h lead time. Pick a later slot or tomorrow.
                  </p>
                )}
                {state === 'full' && (
                  <p className="text-[11px] text-orange-700 font-semibold mt-1 leading-snug">
                    Fully booked — try another slot or waitlist via admin.
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {state === 'available' ? (
                <Link
                  href="/dashboard/booking/new"
                  className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md transition"
                >
                  Book
                </Link>
              ) : state === 'full' ? (
                <span className="text-[11px] font-bold text-orange-700 bg-orange-100 px-2.5 py-1 rounded-md">
                  Full
                </span>
              ) : (
                <span className="text-[11px] font-bold text-slate-500 bg-slate-200 px-2.5 py-1 rounded-md">
                  Too soon
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
