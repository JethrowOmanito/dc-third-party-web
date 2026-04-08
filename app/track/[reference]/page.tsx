'use client';
import { JobProgressTracker } from '@/components/jobs/JobProgressTracker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupabaseClient } from '@/lib/supabase/client';
import { formatDate, getServiceColor, getServiceDisplayName } from '@/lib/utils';
import type { ProgressStep } from '@/types';
import { ArrowLeft, Building2, Calendar, Clock, Loader2, MapPin, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';

const UUID_RE    = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_RE = /^\d+$/;

interface GuestEvent {
  id: string;
  Title: string;
  Start_Date: string;
  Start_Time_Display?: string;
  End_Time_Display?: string;
  Service_Type: string;
  Name?: string;
  Assign_Cleaner?: string[];
  lifecycle_state?: string;
  Note?: string;
  on_my_way_eta?: string;
  on_my_way_sent_by_name?: string;
}

export default function GuestTrackPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = use(params);
  const router = useRouter();
  const supabase = getSupabaseClient();
  const [event, setEvent] = useState<GuestEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [progressStep, setProgressStep] = useState<ProgressStep>('not_ready');

  useEffect(() => {
    if (!reference) return;
    fetchEvent();

    const channel = supabase
      .channel(`guest-track-${reference}`)
      .on('postgres_changes' as any, { event: 'UPDATE', schema: 'public', table: 'events' }, (payload: any) => {
        if (payload.new.id === event?.id || payload.new.company_reference === reference) {
          setEvent((prev) => prev ? { ...prev, ...payload.new } : null);
          if (payload.new.lifecycle_state) setProgressStep(payload.new.lifecycle_state as ProgressStep);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [reference]);

  const fetchEvent = async () => {
    let data: any = null;
    let error: any = null;

    if (NUMERIC_RE.test(reference)) {
      // Numeric Ref_ID — use RPC which handles integer lookup
      const { data: rpcRows, error: rpcErr } = await supabase
        .rpc('get_event_for_guest', { event_id: reference });
      data  = rpcRows && rpcRows.length > 0 ? rpcRows[0] : null;
      error = rpcErr;
    } else {
      // UUID or company_reference text fallback
      const res = await supabase
        .from('events')
        .select('id, "Ref_ID", Title, Start_Date, Start_Time_Display, End_Time_Display, Service_Type, Name, Assign_Cleaner, lifecycle_state, Note, on_my_way_eta, on_my_way_sent_by_name')
        .or(`company_reference.eq.${reference},id.eq.${UUID_RE.test(reference) ? reference : '00000000-0000-0000-0000-000000000000'}`)
        .maybeSingle();
      data  = res.data;
      error = res.error;
    }

    if (error || !data) {
      setNotFound(true);
    } else {
      // Resolve Assign_Cleaner UUIDs → usernames
      let assignNames: string[] = data.Assign_Cleaner || [];
      if (assignNames.length > 0 && UUID_RE.test(assignNames[0])) {
        const { data: users } = await supabase
          .from('user')
          .select('id, username')
          .in('id', assignNames);
        if (users && users.length > 0) {
          const idToName: Record<string, string> = {};
          users.forEach((u: any) => { idToName[u.id] = u.username; });
          assignNames = assignNames.map((id) => idToName[id] || id);
        }
      }
      setEvent({ ...data, Assign_Cleaner: assignNames } as GuestEvent);
      setProgressStep((data.lifecycle_state || 'not_ready') as ProgressStep);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-slate-100 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
          <Building2 className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-800">Reference Not Found</h1>
        <p className="text-gray-500 text-sm mt-2 text-center max-w-xs">
          We couldn't find a job with reference number "{reference}". Please check the reference and try again.
        </p>
        <Link href="/login">
          <Button className="mt-6">
            <ArrowLeft className="w-4 h-4" /> Back to Login
          </Button>
        </Link>
      </div>
    );
  }

  const serviceColor = getServiceColor(event!.Service_Type);
  const serviceDisplay = getServiceDisplayName(event!.Service_Type);

  const lifecycleStatus = (() => {
    switch (event?.lifecycle_state) {
      case 'cancelled': return { label: 'Cancelled', variant: 'destructive' as const };
      case 'rescheduled': return { label: 'Rescheduled', variant: 'warning' as const };
      case 'completed': return { label: 'Completed', variant: 'success' as const };
      default: return { label: 'Active', variant: 'success' as const };
    }
  })();

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-slate-100 px-4 py-8">
      {/* Brand header */}
      <div className="flex items-center justify-between max-w-lg mx-auto mb-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-gray-900 text-sm">Doctor Clean</span>
        </div>
        <Badge variant={lifecycleStatus.variant}>{lifecycleStatus.label}</Badge>
      </div>

      <div className="max-w-lg mx-auto space-y-4">
        {/* Service banner */}
        <div className="rounded-2xl p-5 text-white shadow" style={{ backgroundColor: serviceColor }}>
          <p className="text-white/80 text-xs uppercase tracking-wide font-medium">{serviceDisplay}</p>
          <h2 className="text-xl font-bold mt-1">{event!.Title}</h2>
          <p className="text-white/70 text-xs mt-1">Ref: {reference}</p>
        </div>

        {/* Progress */}
        <JobProgressTracker
          currentStep={progressStep}
          progressDetail={event?.on_my_way_sent_by_name ? `${event.on_my_way_sent_by_name} is on the way` : undefined}
          progressTime={event?.on_my_way_eta ? `ETA: ${event.on_my_way_eta}` : undefined}
        />

        {/* Job details */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Date</p>
                <p className="text-sm font-medium text-gray-800">{formatDate(event!.Start_Date)}</p>
              </div>
            </div>
            {event?.Start_Time_Display && (
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Time</p>
                  <p className="text-sm font-medium text-gray-800">
                    {event.Start_Time_Display}{event.End_Time_Display && ` – ${event.End_Time_Display}`}
                  </p>
                </div>
              </div>
            )}
            {event?.Title && (
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500">Location</p>
                  <p className="text-sm font-medium text-gray-800">{event.Title}</p>
                </div>
              </div>
            )}
            {event?.Assign_Cleaner && event.Assign_Cleaner.length > 0 && (
              <div className="flex items-start gap-3">
                <Users className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500">Assigned Team</p>
                  <p className="text-sm font-medium text-gray-800">{event.Assign_Cleaner.join(', ')}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {event?.Note && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{event.Note}</p>
            </CardContent>
          </Card>
        )}

        <div className="text-center pt-2">
          <p className="text-xs text-gray-400">
            Doctor Clean Partner Portal · This page auto-updates in real time
          </p>
        </div>
      </div>
    </div>
  );
}
