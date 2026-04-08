'use client';
import { Badge } from '@/components/ui/badge';
import { getServiceColor, getServiceDisplayName } from '@/lib/utils';
import type { Job } from '@/types';
import { Calendar, ChevronRight, Clock, MapPin } from 'lucide-react';
import Link from 'next/link';

const LIFECYCLE_LABELS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'outline' }> = {
  not_ready:  { label: 'Pending',    variant: 'warning' },
  in_transit: { label: 'In Transit', variant: 'default' },
  started:    { label: 'Started',    variant: 'success' },
  completed:  { label: 'Completed',  variant: 'outline' },
  cancelled:  { label: 'Cancelled',  variant: 'destructive' },
};

export function JobCard({ job }: { job: Job }) {
  const status = LIFECYCLE_LABELS[job.lifecycle_state || 'not_ready'] || LIFECYCLE_LABELS.not_ready;
  const serviceColor = getServiceColor(job.Service_Type);
  const serviceDisplay = getServiceDisplayName(job.Service_Type);

  return (
    <Link href={`/dashboard/jobs/${job.id}`} className="block">
      <div className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md active:scale-[0.99] transition-all">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {/* Service color bar */}
            <div className="w-1 h-full min-h-[60px] rounded-full flex-shrink-0" style={{ backgroundColor: serviceColor }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900 text-sm truncate">{job.Title}</span>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <p className="text-xs text-emerald-600 font-medium mt-0.5">{serviceDisplay}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Calendar className="w-3 h-3" />
                  {job.Start_Date}
                </span>
                {job.Start_Time_Display && (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    {job.Start_Time_Display}
                    {job.End_Time_Display && ` – ${job.End_Time_Display}`}
                  </span>
                )}
              </div>
              {job.Title && (
                <span className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{job.Title}</span>
                </span>
              )}
              {job.company_reference && (
                <span className="text-xs text-gray-400 mt-1 block">Ref: {job.company_reference}</span>
              )}
              {(job.commission_percentage || job.rebate_amount) && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {job.commission_percentage && job.commission_percentage > 0 && (
                    <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                      Commission: {job.commission_percentage}%
                    </span>
                  )}
                  {job.rebate_amount && job.rebate_amount > 0 && (
                    <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                      Rebate: ${job.rebate_amount}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
        </div>
      </div>
    </Link>
  );
}
