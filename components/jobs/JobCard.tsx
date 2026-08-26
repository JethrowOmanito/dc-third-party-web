'use client';
import { getServiceDisplayName } from '@/lib/utils';
import type { Job } from '@/types';
import {
  Calendar,
  ChevronRight,
  Clock,
  Sparkles,
  Home,
  Sofa,
  Wind,
  Building2,
  Layers,
  Waves,
  ShieldCheck,
  Droplets,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type ServiceStyle = { icon: React.ComponentType<{ className?: string }>; bg: string; text: string };

const SERVICE_STYLES: Record<string, ServiceStyle> = {
  deep_cleaning: { icon: Sparkles, bg: 'bg-emerald-50', text: 'text-emerald-600' },
  housekeeping: { icon: Home, bg: 'bg-sky-50', text: 'text-sky-600' },
  office: { icon: Building2, bg: 'bg-violet-50', text: 'text-violet-600' },
  upholstery: { icon: Sofa, bg: 'bg-amber-50', text: 'text-amber-600' },
  curtain: { icon: Wind, bg: 'bg-emerald-50', text: 'text-emerald-600' },
  scrubbing_machine: { icon: Waves, bg: 'bg-sky-50', text: 'text-sky-600' },
  scrubbing: { icon: Waves, bg: 'bg-sky-50', text: 'text-sky-600' },
  coating: { icon: Layers, bg: 'bg-slate-50', text: 'text-slate-600' },
  carpet: { icon: Layers, bg: 'bg-orange-50', text: 'text-orange-600' },
  formaldehyde_removal: { icon: ShieldCheck, bg: 'bg-cyan-50', text: 'text-cyan-600' },
  disinfection: { icon: Droplets, bg: 'bg-teal-50', text: 'text-teal-600' },
  float: { icon: Sparkles, bg: 'bg-emerald-50', text: 'text-emerald-600' },
};

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  not_ready:  { label: 'Pending',    className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100' },
  in_transit: { label: 'In Transit', className: 'bg-sky-50 text-sky-700 ring-1 ring-sky-100' },
  started:    { label: 'Confirmed',  className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' },
  completed:  { label: 'Completed',  className: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200' },
  cancelled:  { label: 'Cancelled',  className: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100' },
};

function serviceKeyFor(service?: string) {
  if (!service) return 'deep_cleaning';
  return service.toLowerCase().replace(/\s+/g, '_');
}

function formatDate(d?: string) {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear();
  const weekday = date.toLocaleString('en-US', { weekday: 'short' });
  return `${day} ${month} ${year} (${weekday})`;
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

export function JobCard({ job }: { job: Job }) {
  const status = STATUS_STYLES[job.lifecycle_state || 'not_ready'] || STATUS_STYLES.not_ready;
  const key = serviceKeyFor(job.Service_Type);
  const style = SERVICE_STYLES[key] || SERVICE_STYLES.deep_cleaning;
  const Icon = style.icon;
  const serviceDisplay = getServiceDisplayName(job.Service_Type, job.service_subtype);
  const cleanerCount = countCleaners(job.Assign_Cleaner);
  const shortId = job.id ? job.id.slice(0, 2).toUpperCase() : '—';

  return (
    <Link
      href={`/dashboard/jobs/${job.id}`}
      className="block group rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm hover:ring-emerald-200 hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-4 p-4 sm:p-5">
        {/* Service icon */}
        <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center shrink-0', style.bg, style.text)}>
          <Icon className="w-6 h-6" />
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-900 text-base tracking-tight truncate">
              {job.Title || job.Name || 'Untitled Job'}
            </span>
            <span
              className={cn(
                'inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest',
                status.className
              )}
            >
              {status.label}
            </span>
          </div>
          <p className={cn('text-[10px] font-bold uppercase tracking-widest mt-1', style.text)}>
            {serviceDisplay}
          </p>

          <div className="flex flex-wrap gap-x-2 gap-y-2 mt-3">
            {job.Start_Date && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 rounded-lg text-xs font-medium text-slate-600">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {formatDate(job.Start_Date)}
              </span>
            )}
            {job.Start_Time_Display && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 rounded-lg text-xs font-medium text-slate-600 whitespace-nowrap">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {job.Start_Time_Display}
                {job.End_Time_Display && ` – ${job.End_Time_Display}`}
              </span>
            )}
            {cleanerCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 rounded-lg text-xs font-medium text-slate-600">
                <User className="w-3.5 h-3.5 text-slate-400" />
                {cleanerCount} {cleanerCount === 1 ? 'Cleaner' : 'Cleaners'}
              </span>
            )}
          </div>
        </div>

        {/* Job ID column */}
        <div className="hidden sm:flex flex-col items-center gap-0 px-4 py-2 rounded-xl bg-emerald-50/50 ring-1 ring-emerald-100">
          <span className="text-lg font-extrabold text-emerald-700 leading-none">{shortId}</span>
          <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest mt-1">
            Job ID
          </span>
        </div>

        {/* Chevron */}
        <div className="w-9 h-9 rounded-xl bg-white ring-1 ring-slate-200 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white group-hover:ring-emerald-600 transition-colors">
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>
    </Link>
  );
}
