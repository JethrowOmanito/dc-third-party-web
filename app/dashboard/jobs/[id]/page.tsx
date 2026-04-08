'use client';

import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/authStore';
import {
    ArrowLeft,
    Banknote,
    CalendarDays,
    Camera,
    Car,
    Check,
    CheckCircle2,
    ChevronRight,
    Clock,
    HardHat,
    Home,
    HourglassIcon,
    Layers,
    Loader2,
    MapPin,
    MessageSquare,
    Paintbrush,
    ShieldCheck,
    Sparkles,
    StickyNote,
    Tag,
    Truck,
    Users,
    Wallet,
    Wind,
    X,
} from 'lucide-react';
import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────
type ProgressStep = 'not_ready' | 'in_transit' | 'started' | 'completed';
type PhotoTab = 'before' | 'after' | 'documents';

// ── Constants ─────────────────────────────────────────────────────────────
const PROGRESS_STEPS = [
  { key: 'not_ready' as const, label: 'Pending' },
  { key: 'in_transit' as const, label: 'In Transit' },
  { key: 'started' as const, label: 'Started' },
  { key: 'completed' as const, label: 'Completed' },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AVATAR_COLORS = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981'];

// Cycling colour palette for add-on icons so each looks distinct
const ADDON_COLORS = [
  { bg: '#FEF3C7', color: '#D97706' },
  { bg: '#EDE9FE', color: '#7C3AED' },
  { bg: '#DCFCE7', color: '#16A34A' },
  { bg: '#FEE2E2', color: '#DC2626' },
  { bg: '#DBEAFE', color: '#2563EB' },
  { bg: '#FDF4FF', color: '#A21CAF' },
  { bg: '#FFF7ED', color: '#EA580C' },
  { bg: '#F0FDF4', color: '#15803D' },
];

// ── Helpers ───────────────────────────────────────────────────────────────
function localDateStr(d: Date) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function getServiceDisplayName(serviceType: string | null): string {
  if (!serviceType) return 'Cleaning Service';
  const key = serviceType.toLowerCase().trim();
  const map: Record<string, string> = {
    aircon: 'Aircon Servicing',
    carpet: 'Carpet Cleaning',
    deep: 'Deep Cleaning',
    'end of tenancy': 'End of Tenancy',
    float: 'Float Cleaning',
    general: 'General Cleaning',
    housekeeping: 'Housekeeping',
    mattress: 'Mattress Cleaning',
    move: 'Move In/Out Cleaning',
    office: 'Office Cleaning',
    'part time': 'Part Time Helper',
    'post renovation': 'Post Renovation Cleaning',
    sofa: 'Sofa Cleaning',
    spring: 'Spring Cleaning',
    upholstery: 'Upholstery Cleaning',
    window: 'Window Cleaning',
  };
  for (const [k, v] of Object.entries(map)) {
    if (key.includes(k)) return v;
  }
  return serviceType;
}

function getDuration(startTime?: string, endTime?: string, serviceType?: string): string {
  if (!startTime || !endTime) return '';
  if (serviceType?.toLowerCase().includes('float')) return 'Up to 5 hrs';
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  const hrs = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hrs > 0 && mins > 0) return `${hrs} hr${hrs > 1 ? 's' : ''} ${mins} min${mins > 1 ? 's' : ''}`;
  if (hrs > 0) return `${hrs} hr${hrs > 1 ? 's' : ''}`;
  return `${mins} min${mins > 1 ? 's' : ''}`;
}

function getDateLabel(job: any): string {
  if (!job) return '';
  const todayStr = localDateStr(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = localDateStr(tomorrow);
  const timeRange =
    job.Start_Time_Display && job.End_Time_Display
      ? `${job.Start_Time_Display} - ${job.End_Time_Display}`
      : '';
  const prefix =
    job.Start_Date === todayStr
      ? 'Today'
      : job.Start_Date === tomorrowStr
      ? 'Tomorrow'
      : new Date(job.Start_Date + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        });
  return timeRange ? `${prefix}, ${timeRange}` : prefix;
}

function getJobStatus(
  job: any,
  progressStep: ProgressStep
): 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' {
  if (!job) return 'SCHEDULED';
  if (progressStep === 'completed') return 'COMPLETED';
  const today = localDateStr(new Date());
  if (job.Start_Date > today) return 'SCHEDULED';
  if (job.Start_Date < today) return 'COMPLETED';
  if (progressStep === 'started' || progressStep === 'in_transit') return 'ACTIVE';
  return 'ACTIVE';
}

// Returns a distinct Lucide icon component for each add-on service type
function AddonIcon({ svc, className, color }: { svc: string; className?: string; color?: string }) {
  const s = { className, style: color ? { color } : undefined };
  const k = svc.toLowerCase();
  if (k.includes('tenancy') || k.includes('move in') || k.includes('move out')) return <Home {...s} />;
  if (k.includes('renovation') || k.includes('reno')) return <HardHat {...s} />;
  if (k.includes('disinfect')) return <ShieldCheck {...s} />;
  if (k.includes('formaldehyde') || k.includes('aircon')) return <Wind {...s} />;
  if (k.includes('scrubb') || k.includes('machine') || k.includes('layer')) return <Layers {...s} />;
  if (k.includes('coat') || k.includes('polish') || k.includes('paint')) return <Paintbrush {...s} />;
  if (k.includes('collect') || k.includes('delivery') || k.includes('curtain')) return <Truck {...s} />;
  if (k.includes('session') || k.includes('package') || k.includes('hangback')) return <CalendarDays {...s} />;
  if (k.includes('ladder') || k.includes('extra')) return <ChevronRight {...s} />;
  return <Sparkles {...s} />;
}

// ── Main Component ────────────────────────────────────────────────────────
export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = use(params);
  const { user } = useAuthStore();
  const supabase = getSupabaseClient();

  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [progressStep, setProgressStep] = useState<ProgressStep>('not_ready');
  const [progressTime, setProgressTime] = useState<string | null>(null);
  const [progressDetail, setProgressDetail] = useState<string | null>(null);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [serviceNames, setServiceNames] = useState<string[]>([]);
  const [photoTab, setPhotoTab] = useState<PhotoTab>('before');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Keep original UUIDs for progress check (Assign_Cleaner is resolved to usernames for display)
  const originalUUIDsRef = useRef<string[]>([]);
  const jobRef = useRef<any>(null);

  useEffect(() => {
    fetchJob();
    fetchServices();
    fetchChatUnread();
    const channel = supabase
      .channel(`job-chat-badge-${jobId}`)
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'event_chats', filter: `event_id=eq.${jobId}` },
        () => fetchChatUnread()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [jobId]);

  useEffect(() => {
    if (!job) return;
    fetchJobProgress();
    const interval = setInterval(fetchJobProgress, 30_000);
    return () => clearInterval(interval);
  }, [job?.id]);

  const fetchJob = async () => {
    const { data } = await supabase.from('events').select('*').eq('id', jobId).single();
    if (data) {
      const rawUUIDs: string[] = data.Assign_Cleaner || [];
      originalUUIDsRef.current = rawUUIDs;

      let displayNames = [...rawUUIDs];
      if (displayNames.length > 0 && UUID_RE.test(displayNames[0])) {
        const { data: users } = await supabase
          .from('user')
          .select('id, username')
          .in('id', displayNames);
        if (users && users.length > 0) {
          const idToName: Record<string, string> = {};
          users.forEach((u: any) => { idToName[u.id] = u.username; });
          displayNames = displayNames.map((id) => idToName[id] || id);
        }
      }

      const resolved = {
        ...data,
        Assign_Cleaner: displayNames,
        Extra_Service: Array.isArray(data.Extra_Service) ? data.Extra_Service : [],
        upload_before: Array.isArray(data.upload_before) ? data.upload_before : [],
        upload_after: Array.isArray(data.upload_after) ? data.upload_after : [],
        upload_documents: Array.isArray(data.upload_documents) ? data.upload_documents : [],
      };
      setJob(resolved);
      jobRef.current = resolved;
    }
    setLoading(false);
  };

  const fetchServices = async () => {
    const { data } = await supabase.from('services').select('name');
    if (data) setServiceNames(data.map((s: any) => s.name).filter(Boolean));
  };

  const fetchChatUnread = async () => {
    const { count } = await supabase
      .from('event_chats')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', jobId)
      .eq('is_read', false)
      .neq('user_id', user?.id || '');
    setChatUnreadCount(count || 0);
  };

  const fetchJobProgress = async () => {
    const currentJob = jobRef.current;
    if (!currentJob) return;
    const today = localDateStr(new Date());

    if (currentJob.Start_Date !== today) {
      setProgressStep('not_ready');
      setProgressTime(null);
      setProgressDetail(null);
      return;
    }

    try {
      const { data: clockRecords } = await supabase
        .from('clock_records')
        .select('status, clock_in_time, clock_out_time')
        .eq('job_id', currentJob.id)
        .gte('clock_in_time', `${today}T00:00:00`)
        .lte('clock_in_time', `${today}T23:59:59`)
        .order('clock_in_time', { ascending: false })
        .limit(1);

      const record = clockRecords?.[0];

      if (record?.status === 'clocked_out') {
        setProgressStep('completed');
        setProgressTime(
          record.clock_out_time
            ? new Date(record.clock_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : null
        );
        setProgressDetail(null);
        return;
      }

      if (record?.status === 'clocked_in') {
        setProgressStep('started');
        setProgressTime(
          record.clock_in_time
            ? new Date(record.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : null
        );
        setProgressDetail(null);
        return;
      }

      if (currentJob.on_my_way_sent_at) {
        setProgressStep('in_transit');
        setProgressTime(
          new Date(currentJob.on_my_way_sent_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })
        );
        const etaPart = currentJob.on_my_way_eta ? ` • ETA ${currentJob.on_my_way_eta}` : '';
        setProgressDetail(`The Team is on the way${etaPart}`);
        return;
      }

      // Check if assigned cleaners finished a previous job (use original UUIDs for DB overlap query)
      const uuids = originalUUIDsRef.current;
      if (uuids.length > 0) {
        const { data: todaysJobs } = await supabase
          .from('events')
          .select('id, Start_Time, Assign_Cleaner')
          .eq('Start_Date', today)
          .overlaps('Assign_Cleaner', uuids)
          .order('Start_Time', { ascending: true });

        if (todaysJobs && todaysJobs.length > 1) {
          const prevJobs = todaysJobs.filter((j: any) => j.Start_Time < currentJob.Start_Time);
          if (prevJobs.length > 0) {
            const prevJob = prevJobs[prevJobs.length - 1];
            const { data: prevClock } = await supabase
              .from('clock_records')
              .select('status, clock_out_time')
              .eq('job_id', prevJob.id)
              .gte('clock_in_time', `${today}T00:00:00`)
              .lte('clock_in_time', `${today}T23:59:59`)
              .eq('status', 'clocked_out')
              .limit(1);

            if (prevClock && prevClock.length > 0) {
              setProgressStep('in_transit');
              setProgressTime(
                prevClock[0].clock_out_time
                  ? new Date(prevClock[0].clock_out_time).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : null
              );
              setProgressDetail('Team finished the previous job and is likely heading over.');
              return;
            }
          }
        }
      }

      setProgressStep('not_ready');
      setProgressTime(null);
      setProgressDetail(null);
    } catch {
      // silently fail
    }
  };

  // ── Loading / Error ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <p className="text-red-500 font-medium">Job not found</p>
        <Link href="/dashboard/jobs" className="text-sm text-emerald-600 underline">
          Back to Jobs
        </Link>
      </div>
    );
  }

  const jobStatus = getJobStatus(job, progressStep);
  const dateLabel = getDateLabel(job);
  const duration = getDuration(job.Start_Time, job.End_Time, job.Service_Type);
  const serviceDisplay = getServiceDisplayName(job.Service_Type);
  const currentStepIndex = PROGRESS_STEPS.findIndex((s) => s.key === progressStep);

  const beforePhotos: string[] = job.upload_before || [];
  const afterPhotos: string[] = job.upload_after || [];
  const docFiles: string[] = job.upload_documents || [];
  const activePhotos =
    photoTab === 'before' ? beforePhotos : photoTab === 'after' ? afterPhotos : docFiles;

  const PHOTO_TABS = [
    { key: 'before' as const, label: 'Before', count: beforePhotos.length, activeColor: '#D97706', activeBg: '#FEF3C7' },
    { key: 'after' as const, label: 'After', count: afterPhotos.length, activeColor: '#10B981', activeBg: '#D1FAE5' },
    { key: 'documents' as const, label: 'Docs', count: docFiles.length, activeColor: '#6366F1', activeBg: '#EEF2FF' },
  ];

  const statusConfig = {
    COMPLETED: { bg: '#ECFDF5', text: '#059669', label: 'COMPLETED' },
    ACTIVE: { bg: '#FFF7ED', text: '#EA580C', label: 'ACTIVE' },
    SCHEDULED: { bg: '#EEF2FF', text: '#4F46E5', label: 'SCHEDULED' },
  };
  const statusStyle = statusConfig[jobStatus];

  const isDoc = (url: string) => /\.(pdf|doc|docx|xlsx|csv|txt)(\?|$)/i.test(url);
  const fileName = (url: string) => decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'file');

  return (
    <div className="-mx-4 sm:-mx-6 -mt-4 sm:-mt-6">

      {/* ─── Lightbox ─────────────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 w-9 h-9 bg-white/20 rounded-full flex items-center justify-center"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="w-5 h-5 text-white" />
          </button>
          <img
            src={lightboxUrl}
            alt="Photo"
            className="max-w-full max-h-[90vh] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* ─── Slim Dark Header ────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-4 rounded-b-3xl" style={{ backgroundColor: '#064E3B' }}>
        {/* Nav row */}
        <div className="flex items-center gap-2 mb-2.5">
          <Link href="/dashboard/jobs">
            <button
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
            >
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
          </Link>
          <span className="flex-1 text-sm font-semibold text-[#D1FAE5] ml-1 truncate">
            Job Details
          </span>
          <span
            className="flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase"
            style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
          >
            {statusStyle.label}
          </span>
          <Link
            href={`/dashboard/jobs/${jobId}/chat`}
            className="relative ml-1 flex-shrink-0"
            onClick={() => setChatUnreadCount(0)}
          >
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
            >
              <MessageSquare className="w-4 h-4 text-[#D1FAE5]" />
            </div>
            {chatUnreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5">
                {chatUnreadCount > 9 ? '9+' : chatUnreadCount}
              </span>
            )}
          </Link>
        </div>

        {/* Date + client inline */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white leading-snug truncate">{dateLabel}</p>
            {job.Name && (
              <p className="text-xs text-[#A7F3D0] font-medium mt-0.5 truncate">{job.Name}</p>
            )}
          </div>
        </div>

        {/* Address — single compact row */}
        {job.Title && (
          <div className="flex items-center gap-2" style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '8px 10px' }}>
            <MapPin className="w-3 h-3 text-[#6EE7B7] flex-shrink-0" />
            <span className="text-[11px] text-white leading-snug line-clamp-1">{job.Title}</span>
          </div>
        )}
      </div>

      {/* ─── Content Cards ────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-4 space-y-3 max-w-2xl mx-auto pb-28">

        {/* Live Progress */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-gray-700">Live Progress</span>
            {progressTime && (
              <span className="text-xs text-gray-400">Updated {progressTime}</span>
            )}
          </div>
          {progressDetail && (
            <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mt-1 mb-2">
              {progressDetail}
            </p>
          )}
          <div className="flex items-start justify-between relative mt-4">
            <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-200 z-0" />
            <div
              className="absolute top-4 left-0 h-0.5 bg-emerald-500 z-0 transition-all duration-500"
              style={{ width: `${(currentStepIndex / (PROGRESS_STEPS.length - 1)) * 100}%` }}
            />
            {PROGRESS_STEPS.map(({ key, label }, i) => {
              const done = i < currentStepIndex;
              const active = i === currentStepIndex;
              const dotCls = [
                'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all',
                done ? 'bg-emerald-600 border-emerald-600' : '',
                active ? 'bg-emerald-600 border-emerald-600 ring-4 ring-emerald-100' : '',
                !done && !active ? 'bg-white border-gray-300' : '',
              ].join(' ');
              const icoCls = `w-4 h-4 ${done || active ? 'text-white' : 'text-gray-300'}`;
              return (
                <div key={key} className="flex flex-col items-center z-10 flex-1">
                  <div className={dotCls}>
                    {key === 'not_ready' && <HourglassIcon className={icoCls} />}
                    {key === 'in_transit' && <Car className={icoCls} />}
                    {key === 'started' && <Loader2 className={`${icoCls} ${active ? 'animate-spin' : ''}`} />}
                    {key === 'completed' && <CheckCircle2 className={icoCls} />}
                  </div>
                  <span
                    className={`text-[10px] sm:text-xs mt-2 text-center font-medium leading-tight ${
                      active ? 'text-emerald-600' : done ? 'text-gray-600' : 'text-gray-400'
                    }`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Stats Row: Service / Duration / Price */}
        <div className="bg-white rounded-2xl shadow-sm flex items-stretch overflow-hidden">
          <div className="flex-1 p-3 flex flex-col items-center gap-1 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-indigo-500" />
            </div>
            <span className="text-[10px] text-gray-400 font-medium">Service</span>
            <span className="text-[11px] text-gray-800 font-semibold text-center leading-tight line-clamp-2">
              {serviceDisplay}
            </span>
          </div>
          <div className="w-px bg-gray-100 my-3" />
          <div className="flex-1 p-3 flex flex-col items-center gap-1 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Clock className="w-4 h-4 text-emerald-500" />
            </div>
            <span className="text-[10px] text-gray-400 font-medium">Duration</span>
            <span className="text-[11px] text-gray-800 font-semibold text-center leading-tight">
              {duration || '--'}
            </span>
          </div>
          <div className="w-px bg-gray-100 my-3" />
          <div className="flex-1 p-3 flex flex-col items-center gap-1 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
              <Banknote className="w-4 h-4 text-amber-500" />
            </div>
            <span className="text-[10px] text-gray-400 font-medium">Price</span>
            <span className="text-[11px] font-semibold text-center leading-tight text-indigo-600">
              {job.Price != null ? `$${Number(job.Price).toFixed(2)}` : '$--.--'}
            </span>
          </div>
        </div>

        {/* Add-On Services – each with its own distinct icon & colour */}
        {job.Extra_Service.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-indigo-500" />
              </div>
              <span className="font-semibold text-gray-700 text-sm">Add-On Services</span>
              <span className="ml-auto bg-gray-100 text-gray-600 text-[11px] font-bold px-2 py-0.5 rounded-full">
                {job.Extra_Service.length}
              </span>
            </div>
            <div className="space-y-2.5">
              {job.Extra_Service.map((svc: string, i: number) => {
                const c = ADDON_COLORS[i % ADDON_COLORS.length];
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: c.bg }}
                    >
                      <AddonIcon svc={svc} className="w-4 h-4" color={c.color} />
                    </div>
                    <span className="text-sm text-gray-700">{svc}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Unit Type — below Add-On Services */}
        {(job.Unit_type || job.Unit_sub_type) && (
          <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <Home className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 font-medium">Unit Type</p>
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {[job.Unit_type, job.Unit_sub_type].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-xl bg-yellow-50 flex items-center justify-center">
              <StickyNote className="w-4 h-4 text-yellow-600" />
            </div>
            <span className="font-semibold text-gray-700 text-sm">Notes</span>
          </div>
          {job.Note ? (
            <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-xl p-3 leading-relaxed">
              {job.Note}
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic">No notes provided</p>
          )}
        </div>

        {/* ─── Before / After / Documents Photos ─────────────────── */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center">
              <Camera className="w-4 h-4 text-rose-500" />
            </div>
            <span className="font-semibold text-gray-700 text-sm">Photos &amp; Files</span>
            {(beforePhotos.length + afterPhotos.length + docFiles.length) > 0 && (
              <span className="ml-auto bg-gray-100 text-gray-600 text-[11px] font-bold px-2 py-0.5 rounded-full">
                {beforePhotos.length + afterPhotos.length + docFiles.length}
              </span>
            )}
          </div>

          {/* Tab bar */}
          <div className="flex gap-1.5 mb-3 bg-gray-50 rounded-xl p-1">
            {PHOTO_TABS.map((tab) => {
              const active = photoTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setPhotoTab(tab.key)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all"
                  style={active ? { backgroundColor: tab.activeBg, color: tab.activeColor } : { color: '#9CA3AF' }}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span
                      className="text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5"
                      style={
                        active
                          ? { backgroundColor: tab.activeColor, color: '#FFF' }
                          : { backgroundColor: '#D1D5DB', color: '#6B7280' }
                      }
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Content */}
          {activePhotos.length > 0 ? (
            photoTab === 'documents' ? (
              <div className="space-y-2">
                {activePhotos.map((url: string, idx: number) => (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <Tag className="w-4 h-4 text-indigo-500" />
                    </div>
                    <span className="text-xs text-indigo-700 font-medium truncate">{fileName(url)}</span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {activePhotos.map((url: string, idx: number) => (
                  isDoc(url) ? (
                    <a
                      key={idx}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aspect-square rounded-xl bg-gray-100 flex flex-col items-center justify-center gap-1 p-2"
                    >
                      <Tag className="w-6 h-6 text-gray-400" />
                      <span className="text-[9px] text-gray-500 text-center truncate w-full">{fileName(url)}</span>
                    </a>
                  ) : (
                    <button
                      key={idx}
                      className="aspect-square rounded-xl overflow-hidden bg-gray-100 group"
                      onClick={() => setLightboxUrl(url)}
                    >
                      <img
                        src={url}
                        alt={`${photoTab} ${idx + 1}`}
                        className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                      />
                    </button>
                  )
                ))}
              </div>
            )
          ) : (
            <div className="flex flex-col items-center py-6 gap-2 text-gray-300">
              <Camera className="w-8 h-8" />
              <p className="text-xs text-gray-400">
                No {photoTab === 'documents' ? 'documents' : `${photoTab} photos`} uploaded yet
              </p>
            </div>
          )}
        </div>

        {/* Assigned Team */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center">
              <Users className="w-4 h-4 text-purple-600" />
            </div>
            <span className="font-semibold text-gray-700 text-sm">Assigned Team</span>
            {job.Assign_Cleaner.length > 0 && (
              <span className="ml-auto bg-purple-50 text-purple-600 text-[11px] font-bold px-2 py-0.5 rounded-full">
                {job.Assign_Cleaner.length}
              </span>
            )}
          </div>
          {job.Assign_Cleaner.length > 0 ? (
            <div className="space-y-3">
              {job.Assign_Cleaner.map((name: string, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={{ backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
                  >
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{name}</p>
                    <p className="text-xs text-gray-400">Team Member</p>
                  </div>
                  <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-4 gap-1">
              <Users className="w-7 h-7 text-gray-300" />
              <p className="text-sm text-gray-400">Unassigned</p>
            </div>
          )}
        </div>

        {/* Financial Details */}
        {(job.commission_percentage != null || job.rebate_amount != null || job.company_reference) && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-emerald-600" />
              </div>
              <span className="font-semibold text-gray-700 text-sm">Financial Details</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {job.commission_percentage != null && (
                <div className="border-l-4 border-emerald-400 pl-3 py-1">
                  <p className="text-xs text-gray-400 font-medium">Commission</p>
                  <p className="text-lg font-bold text-emerald-600">{job.commission_percentage}%</p>
                </div>
              )}
              {job.rebate_amount != null && (
                <div className="border-l-4 border-amber-400 pl-3 py-1">
                  <p className="text-xs text-gray-400 font-medium">Rebate</p>
                  <p className="text-lg font-bold text-amber-600">
                    ${Number(job.rebate_amount).toFixed(2)}
                  </p>
                </div>
              )}
            </div>
            {job.company_reference && (
              <div className="mt-3 flex items-center gap-2 text-gray-500">
                <Tag className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-xs font-medium">Reference</span>
                <span className="text-xs text-gray-700 font-semibold ml-auto">
                  {job.company_reference}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="h-4" />
      </div>

      {/* ─── Chat FAB ─────────────────────────────────────────────── */}
      <Link
        href={`/dashboard/jobs/${jobId}/chat`}
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40"
        onClick={() => setChatUnreadCount(0)}
      >
        <div
          className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-transform active:scale-95 hover:scale-105"
          style={{ backgroundColor: '#059669' }}
        >
          <MessageSquare className="w-6 h-6 text-white" />
        </div>
        {chatUnreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1">
            {chatUnreadCount > 9 ? '9+' : chatUnreadCount}
          </span>
        )}
      </Link>
    </div>
  );
}
