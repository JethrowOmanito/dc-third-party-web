'use client';

import Image from 'next/image';
import { CheckCircle2, ChevronRight } from 'lucide-react';
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
  logo: string | null;
  accent: {
    ring: string;
    ringActive: string;
    chipText: string;
    ctaText: string;
  };
}[] = [
  {
    key: 'tcc',
    title: 'The Cleaning Crew',
    subtitle: 'powered by Doctor Clean',
    tagline: 'Standard cleaning',
    logo: null,
    accent: {
      ring: 'ring-slate-100',
      ringActive: 'ring-2 ring-emerald-500',
      chipText: 'text-emerald-700',
      ctaText: 'text-emerald-600',
    },
  },
  {
    key: 'doctor_clean_id',
    title: 'Doctor Clean',
    subtitle: 'Interior Designer Pricelist',
    tagline: 'Deep cleaning + renovation, 10% ID rebate',
    logo: '/doctor-clean-logo.png',
    accent: {
      ring: 'ring-slate-100',
      ringActive: 'ring-2 ring-orange-500',
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
          const { accent } = card;
          const isSelected = selected === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => onSelect(card.key)}
              className={cn(
                'group relative flex flex-col items-start gap-3 p-5 bg-white rounded-2xl ring-1 shadow-sm transition-all text-left hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] overflow-hidden',
                isSelected ? accent.ringActive : accent.ring,
                isSelected && 'shadow-lg'
              )}
            >
              {/* Doctor Clean wordmark tucked into the top-right corner —
                  absolute-positioned so it doesn't push the title / subtitle
                  down; text flows normally from the top. TCC has no logo. */}
              {card.logo && (
                <div className="absolute top-0 right-0 w-[120px] h-12 rounded-tr-2xl rounded-bl-2xl overflow-hidden flex items-center justify-end pr-2 pl-1 bg-white pointer-events-none">
                  <Image
                    src={card.logo}
                    alt={card.title}
                    width={120}
                    height={48}
                    className="w-full h-full object-contain object-right"
                    priority
                  />
                </div>
              )}

              <div className={cn('min-w-0 flex-1', card.logo && 'pr-[120px]')}>
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

              {/* Cards with a corner logo skip the check badge — the ring
                  color change already signals selection and the badge would
                  collide with the logo. */}
              {isSelected && !card.logo && (
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
