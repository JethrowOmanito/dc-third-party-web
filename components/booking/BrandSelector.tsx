'use client';

import { CheckCircle2, ChevronRight, Sparkles, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PartnerBrand } from '@/types';

// Shown as the first wizard step for partners whose company_type is
// 'interior_design'. Selecting a card seeds `partnerBrand` in the booking
// store, which downstream pricing fetches and the size step read to decide
// between:
//   'tcc'             → tcc_pricing            (The Cleaning Crew)
//   'doctor_clean_id' → id_pricing             (Doctor Clean ID — 10% rebate)
//
// property_manager (Agents) users skip this step entirely — see
// `app/dashboard/booking/new/page.tsx`.
interface BrandSelectorProps {
  selected: PartnerBrand | null;
  onSelect: (brand: PartnerBrand) => void;
}

const BRAND_CARDS: {
  key: Exclude<PartnerBrand, 'agents'>;
  title: string;
  subtitle: string;
  tagline: string;
  Icon: typeof Sparkles;
  accent: {
    ring: string;
    ringActive: string;
    iconBg: string;
    iconText: string;
    chipBg: string;
    chipText: string;
    ctaText: string;
  };
}[] = [
  {
    key: 'tcc',
    title: 'The Cleaning Crew',
    subtitle: 'powered by Doctor Clean',
    tagline: 'Standard cleaning',
    Icon: Sparkles,
    accent: {
      ring: 'ring-slate-100',
      ringActive: 'ring-2 ring-emerald-500',
      iconBg: 'bg-emerald-50',
      iconText: 'text-emerald-600',
      chipBg: 'bg-emerald-50',
      chipText: 'text-emerald-700',
      ctaText: 'text-emerald-600',
    },
  },
  {
    key: 'doctor_clean_id',
    title: 'Doctor Clean',
    subtitle: 'Interior Designer Pricelist',
    tagline: 'Deep cleaning + renovation, 10% ID rebate',
    Icon: Palette,
    accent: {
      ring: 'ring-slate-100',
      ringActive: 'ring-2 ring-orange-500',
      iconBg: 'bg-orange-50',
      iconText: 'text-orange-600',
      chipBg: 'bg-orange-50',
      chipText: 'text-orange-700',
      ctaText: 'text-orange-600',
    },
  },
];

export default function BrandSelector({ selected, onSelect }: BrandSelectorProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="text-center px-2">
        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
          Interior Designer Portal
        </p>
        <h2 className="mt-2 text-lg font-extrabold tracking-tight text-slate-900">
          Which price list would you like to use?
        </h2>
        <p className="mt-1 text-xs text-slate-500 leading-relaxed">
          Choose the brand you want this booking billed under. This drives the pricing
          catalog and add-ons shown in the next steps.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {BRAND_CARDS.map((card) => {
          const { Icon, accent } = card;
          const isSelected = selected === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => onSelect(card.key)}
              className={cn(
                'group relative flex flex-col items-start gap-3 p-5 bg-white rounded-2xl ring-1 shadow-sm transition-all text-left hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]',
                isSelected ? accent.ringActive : accent.ring,
                isSelected && 'shadow-lg'
              )}
            >
              <div
                className={cn(
                  'w-12 h-12 flex items-center justify-center rounded-xl shrink-0',
                  accent.iconBg,
                  accent.iconText
                )}
              >
                <Icon className="w-6 h-6" strokeWidth={1.75} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-slate-900 leading-tight">
                  {card.title}
                </p>
                <p
                  className={cn(
                    'mt-0.5 text-[10px] font-semibold uppercase tracking-widest',
                    accent.chipText
                  )}
                >
                  {card.subtitle}
                </p>
                <p className="text-xs text-slate-500 leading-relaxed mt-2">
                  {card.tagline}
                </p>
                <p className="mt-1 text-[10px] italic text-slate-400">
                  Prices subject to 9% GST
                </p>
                {isSelected ? (
                  <span
                    className={cn(
                      'mt-3 inline-flex items-center gap-1 text-xs font-bold',
                      accent.ctaText
                    )}
                  >
                    Continue with {card.title.split(' ')[0]}{' '}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                ) : (
                  <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 group-hover:text-emerald-600 transition-colors">
                    Select this brand <ChevronRight className="w-3 h-3" />
                  </span>
                )}
              </div>

              {isSelected && (
                <span className="absolute top-4 right-4 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-white" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-400 text-center leading-relaxed px-4">
        Not sure which one to pick? Choose{' '}
        <span className="font-semibold text-slate-500">Doctor Clean</span> for interior
        designer projects that qualify for the 10% rebate.
      </p>
    </div>
  );
}
