'use client';
import { cn } from '@/lib/utils';
import { CheckCircle2, Car, Loader2, HourglassIcon } from 'lucide-react';

const STEPS = [
  { key: 'not_ready',  label: 'Pending',    Icon: HourglassIcon },
  { key: 'in_transit', label: 'In Transit', Icon: Car },
  { key: 'started',    label: 'Started',    Icon: Loader2 },
  { key: 'completed',  label: 'Completed',  Icon: CheckCircle2 },
] as const;

type ProgressStep = 'not_ready' | 'in_transit' | 'started' | 'completed';

export function JobProgressTracker({
  currentStep,
  progressTime,
  progressDetail,
}: {
  currentStep: ProgressStep;
  progressTime?: string | null;
  progressDetail?: string | null;
}) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Job Progress</h3>
      <div className="flex items-start justify-between relative">
        {/* Connector line */}
        <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-200 z-0" />
        <div
          className="absolute top-4 left-0 h-0.5 bg-emerald-500 z-0 transition-all duration-500"
          style={{ width: `${(currentIndex / (STEPS.length - 1)) * 100}%` }}
        />
        {STEPS.map(({ key, label, Icon }, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <div key={key} className="flex flex-col items-center z-10 flex-1">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors',
                  done && 'bg-emerald-600 border-emerald-600',
                  active && 'bg-emerald-600 border-emerald-600 ring-4 ring-emerald-100',
                  !done && !active && 'bg-white border-gray-300'
                )}
              >
                <Icon
                  className={cn(
                    'w-4 h-4',
                    (done || active) ? 'text-white' : 'text-gray-400',
                    active && key === 'started' && 'animate-spin'
                  )}
                />
              </div>
              <span
                className={cn(
                  'text-[10px] sm:text-xs mt-2 text-center font-medium leading-tight',
                  active ? 'text-emerald-600' : done ? 'text-gray-600' : 'text-gray-400'
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
      {(progressTime || progressDetail) && (
        <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500 space-y-0.5">
          {progressDetail && <p>{progressDetail}</p>}
          {progressTime && <p>{progressTime}</p>}
        </div>
      )}
    </div>
  );
}
