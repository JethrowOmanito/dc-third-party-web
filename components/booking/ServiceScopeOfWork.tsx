'use client';
import { useState } from 'react';
import { ChevronDown, Check, X, AlertTriangle, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TOOLS_AND_CHEMICALS, type ScopeOfWork } from '@/lib/scope-of-work';

// Generic scope-of-work card for non-ID Deep Cleaning subtypes
// (post-reno, spring, HIP, tenancy move-in/out). Shape mirrors
// PartnerScopeOfWork so the branded ID cards and the generic ones
// feel consistent side-by-side.

interface Props {
  data: ScopeOfWork;
}

const WA_URL =
  'https://wa.me/6589182880?text=' +
  encodeURIComponent(
    "Hi Doctor Clean! I need help with a service item that's outside the standard scope for my booking.",
  );

export default function ServiceScopeOfWork({ data }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-white rounded-2xl ring-1 ring-emerald-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <div>
          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-0.5">
            {data.serviceTitle} · What&apos;s Included
          </p>
          <h3 className="text-sm font-bold text-slate-900">Scope of Work</h3>
        </div>
        <ChevronDown
          className={cn('w-5 h-5 text-slate-400 transition-transform flex-shrink-0', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-slate-100 pt-4">
          <section>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Tools / Chemicals
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TOOLS_AND_CHEMICALS.map((t) => (
                <span
                  key={t}
                  className="text-[11px] font-semibold text-slate-700 bg-slate-50 ring-1 ring-slate-200 rounded-full px-2.5 py-1"
                >
                  {t}
                </span>
              ))}
            </div>
          </section>

          <section>
            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-2">
              Scope (Surface Cleaning)
            </p>
            <ul className="space-y-1.5">
              {data.scope.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-slate-700 leading-snug">
                  <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" strokeWidth={2.5} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {data.heightNote && (
              <div className="mt-3 flex items-start gap-2 bg-amber-50 ring-1 ring-amber-100 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" strokeWidth={2} />
                <p className="text-[11px] text-amber-900 leading-snug">{data.heightNote}</p>
              </div>
            )}
          </section>

          <section>
            <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest mb-2">
              Excluded Scope
            </p>
            <ul className="space-y-1.5">
              {data.excluded.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-slate-600 leading-snug">
                  <X className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" strokeWidth={2.5} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <a
            href={WA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 ring-1 ring-slate-200 hover:bg-slate-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-4 h-4 text-emerald-600" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 leading-snug">Chat with an agent</p>
              <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                If you require any item under Excluded Scope or anything needing special attention
                / deep cleaning — additional charges apply.
              </p>
            </div>
          </a>
        </div>
      )}
    </div>
  );
}
