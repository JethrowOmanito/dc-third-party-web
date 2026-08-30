'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import {
  AlertTriangle, CheckCircle2, Clock, Copy, DollarSign,
  ExternalLink, Loader2, MessageCircle, RefreshCw, Wallet,
} from 'lucide-react';

type AgeBucket = 'all' | '0-24h' | '24-48h' | '>48h';

interface PendingBooking {
  id: string;
  ref_id: number | null;
  title: string | null;
  customer_name: string | null;
  whatsapp: string | null;
  email: string | null;
  service_type: string | null;
  start_date: string | null;
  start_time: string | null;
  final_price: number | null;
  amount_cents: number | null;
  stripe_checkout_url: string | null;
  date_created: string;
  company_reference: string | null;
}

function hoursSince(iso: string): number {
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / (60 * 60 * 1000));
}

function ageLabel(iso: string): string {
  const h = hoursSince(iso);
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function bucketFor(iso: string): AgeBucket {
  const h = hoursSince(iso);
  if (h <= 24) return '0-24h';
  if (h <= 48) return '24-48h';
  return '>48h';
}

function formatSGD(n: number | null | undefined): string {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  return `S$${n.toFixed(2)}`;
}

function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso + 'T00:00:00+08:00').toLocaleDateString('en-SG', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
  } catch {
    return iso;
  }
}

function whatsappLink(b: PendingBooking): string {
  if (!b.whatsapp) return '#';
  const digits = b.whatsapp.replace(/\D/g, '');
  const firstName = (b.customer_name || 'there').split(/\s+/)[0];
  const date = b.start_date ? ` on ${formatShortDate(b.start_date)}` : '';
  const time = b.start_time ? ` at ${b.start_time}` : '';
  const price = b.final_price ? ` (S$${b.final_price.toFixed(2)})` : '';
  const link = b.stripe_checkout_url ? `\n\nComplete payment here: ${b.stripe_checkout_url}` : '';
  const message =
    `Hi ${firstName}, this is Doctor Clean. Just following up on your booking${date}${time}${price}. Payment is still pending — please complete it to lock in your slot.${link}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export default function PendingPaymentsPage() {
  const { user } = useAuthStore();
  const [bookings, setBookings] = useState<PendingBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [ageFilter, setAgeFilter] = useState<AgeBucket>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const supabase = getSupabaseClient();

  const fetchBookings = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const companyFilter = user.company_id
        ? { column: 'partner_company_id' as const, value: user.company_id }
        : { column: 'owned_by_third_party' as const, value: user.id };

      const { data } = await supabase
        .from('events')
        .select(
          'id, "Ref_ID", "Title", "Name", "Whatsapp_Number", "Email", "Service_Type", "Start_Date", "Start_Time_Display", final_price, amount_cents, stripe_checkout_url, "date_Created", company_reference'
        )
        .eq(companyFilter.column, companyFilter.value)
        .eq('payment_status', 'unpaid')
        .eq('status', 'pending')
        .eq('lifecycle_state', 'active')
        .order('date_Created', { ascending: false })
        .limit(200);

      const rows: PendingBooking[] = ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        ref_id: r.Ref_ID,
        title: r.Title,
        customer_name: r.Name,
        whatsapp: r.Whatsapp_Number,
        email: r.Email,
        service_type: r.Service_Type,
        start_date: r.Start_Date,
        start_time: r.Start_Time_Display,
        final_price: r.final_price != null ? Number(r.final_price) : null,
        amount_cents: r.amount_cents,
        stripe_checkout_url: r.stripe_checkout_url,
        date_created: r.date_Created,
        company_reference: r.company_reference,
      }));
      setBookings(rows);
    } finally {
      setLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    fetchBookings();
    if (!user) return;
    const channel = supabase
      .channel('pending-payments-list')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'events' }, fetchBookings)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchBookings, supabase, user]);

  const filtered = useMemo(() => {
    if (ageFilter === 'all') return bookings;
    return bookings.filter((b) => bucketFor(b.date_created) === ageFilter);
  }, [bookings, ageFilter]);

  const metrics = useMemo(() => {
    const revenueAtRisk = filtered.reduce((sum, b) => sum + (b.final_price ?? 0), 0);
    const oldest = filtered.reduce<PendingBooking | null>((oldest, b) => {
      if (!oldest) return b;
      return new Date(b.date_created) < new Date(oldest.date_created) ? b : oldest;
    }, null);
    const oldestHours = oldest ? hoursSince(oldest.date_created) : 0;
    return { revenueAtRisk, count: filtered.length, oldestHours };
  }, [filtered]);

  const copyLink = useCallback(async (b: PendingBooking) => {
    if (!b.stripe_checkout_url) return;
    try {
      await navigator.clipboard.writeText(b.stripe_checkout_url);
      setCopiedId(b.id);
      setTimeout(() => setCopiedId((prev) => (prev === b.id ? null : prev)), 2000);
    } catch {
      // Silent — clipboard blocked
    }
  }, []);

  return (
    <div className="max-w-7xl mx-auto pb-12 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Wallet className="w-7 h-7 text-emerald-600" />
            Pending Payments
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Bookings that need customer payment to be confirmed. Nudge them to lock in the slot.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchBookings}
          disabled={loading}
          className="h-11 px-4 inline-flex items-center gap-2 rounded-xl bg-white ring-1 ring-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <MetricCard
          icon={<DollarSign className="w-5 h-5" />}
          label="Revenue at risk"
          value={formatSGD(metrics.revenueAtRisk)}
          accent="bg-emerald-50 text-emerald-700"
        />
        <MetricCard
          icon={<Wallet className="w-5 h-5" />}
          label="Pending bookings"
          value={String(metrics.count)}
          accent="bg-sky-50 text-sky-700"
        />
        <MetricCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label="Oldest waiting"
          value={metrics.oldestHours < 1 ? '<1h' : `${Math.round(metrics.oldestHours)}h`}
          accent={metrics.oldestHours > 24 ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}
        />
      </div>

      {/* Age filter */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto -mx-1 px-1 pb-1">
        {(['all', '0-24h', '24-48h', '>48h'] as AgeBucket[]).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setAgeFilter(b)}
            className={cn(
              'shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors',
              ageFilter === b
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
            )}
          >
            {b === 'all' ? 'All ages' : b}
          </button>
        ))}
        <div className="ml-auto hidden sm:flex items-center gap-1.5 text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-emerald-600 uppercase tracking-widest">
            Live Sync Active
          </span>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
            Fetching pending payments…
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-24 px-6 text-center rounded-2xl bg-white ring-1 ring-slate-100">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">Nothing pending — great job!</h3>
          <p className="text-sm text-slate-500 max-w-[320px] leading-relaxed">
            All your bookings are paid up. New unpaid bookings will show up here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => (
            <BookingRow
              key={b.id}
              booking={b}
              onCopy={() => copyLink(b)}
              copied={copiedId === b.id}
            />
          ))}
        </div>
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

function BookingRow({
  booking, onCopy, copied,
}: { booking: PendingBooking; onCopy: () => void; copied: boolean }) {
  const waLink = whatsappLink(booking);
  const hours = hoursSince(booking.date_created);
  const isOld = hours > 24;

  return (
    <div className="bg-white rounded-2xl ring-1 ring-slate-100 p-4 hover:ring-emerald-200 transition-shadow shadow-sm">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-slate-900 truncate">
              {booking.customer_name || 'Unnamed customer'}
            </p>
            {booking.ref_id && (
              <span className="text-xs font-mono text-slate-400">#{booking.ref_id}</span>
            )}
            {booking.company_reference && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                {booking.company_reference}
              </span>
            )}
            <span
              className={cn(
                'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ml-auto md:ml-0',
                isOld ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
              )}
            >
              {ageLabel(booking.date_created)}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            {booking.service_type}
            {booking.start_date && ` · ${formatShortDate(booking.start_date)}`}
            {booking.start_time && ` · ${booking.start_time}`}
          </p>
          {booking.title && (
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-2xl">{booking.title}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500">
            {booking.whatsapp && <span>📱 {booking.whatsapp}</span>}
            {booking.email && <span>✉ {booking.email}</span>}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> Booked {ageLabel(booking.date_created)}
            </span>
          </div>
        </div>

        <div className="flex items-center md:items-end gap-2 md:flex-col">
          <div className="md:text-right">
            <p className="text-lg font-extrabold text-slate-900 tracking-tight">
              {formatSGD(booking.final_price)}
            </p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              Unpaid
            </p>
          </div>
          <div className="flex gap-1.5 flex-wrap md:justify-end">
            {booking.whatsapp && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition"
              >
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </a>
            )}
            {booking.stripe_checkout_url && (
              <>
                <button
                  type="button"
                  onClick={onCopy}
                  className={cn(
                    'inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg transition',
                    copied
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  )}
                >
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <a
                  href={booking.stripe_checkout_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg bg-white ring-1 ring-slate-200 hover:bg-slate-50 text-slate-700 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
