'use client';
import {
  Info,
  ChevronRight,
  Loader2,
  Eraser,
  Clock,
  Calendar as CalendarIcon,
  Pencil,
  Lock,
  ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import PromoCodeInput from '@/components/booking/PromoCode';
import type { AddonRow, PricingRow, BookingSlot, PromoCode } from '@/types';

interface AdditionalServiceLineItem {
  id: number;
  name: string;
  price: number;
}

const ADDON_CATEGORY_NAMES: Record<string, string> = {
  scrubbing:            'Scrubbing Machine',
  formaldehyde_removal: 'Formaldehyde Removal',
  disinfection:         'Disinfectant Misting',
  jet_wash:             'Jet Wash',
};

function addonServiceLabel(row: PricingRow, scrubMachineType?: 'KM1' | 'LC1' | null): string {
  if (row.category === 'scrubbing' && scrubMachineType) {
    return scrubMachineType === 'KM1'
      ? 'Scrubbing Machine Karcher'
      : 'Scrubbing Machine Lentech';
  }
  return row.subcategory_label || ADDON_CATEGORY_NAMES[row.category] || row.unit_label || 'Add-on';
}

interface RealtimeSummaryProps {
  serviceLabel: string;
  subtype: string;
  date: Date | undefined;
  slot: BookingSlot | null;
  pricing: PricingRow | null;
  housekeepingPricing?: { hours: number; price: number; label: string } | null;
  addons: Record<number, AddonRow>;
  addonServices?: PricingRow[];
  scrubMachineType?: 'KM1' | 'LC1' | null;
  additionalServices?: AdditionalServiceLineItem[];
  bundleUpholsteryPieces?: 0 | 2 | 3;
  bundleUpholsteryPrice?: number;
  bundleCurtainSteam?: boolean;
  bundleCurtainSteamPrice?: number;
  upholsteryLShape?: boolean;
  upholsteryLShapePrice?: number;
  upholsteryAddonCurtainSteam?: boolean;
  upholsteryAddonCurtainSteamPrice?: number;
  upholsteryAddonDisinfect?: boolean;
  upholsteryAddonDisinfectPrice?: number;
  coatingScrubbingLabel?: string | null;
  coatingScrubbingPrice?: number;
  highCeilingAddon?: '4_5m' | null;
  totalPrice: number;
  finalPrice: number;
  appliedPromo: PromoCode | null;
  isOverbook: boolean;
  step: string;
  onNext: () => void;
  onClear?: () => void;
  onApplyPromo: (promo: PromoCode, discountedTotal: number) => void;
  onRemovePromo: () => void;
  isNextDisabled: boolean;
  loading?: boolean;
}

const PROMO_STEPS = ['size', 'datetime', 'addons', 'contact', 'terms'];

export default function RealtimeSummary({
  serviceLabel,
  subtype,
  date,
  slot,
  pricing,
  housekeepingPricing,
  addons,
  addonServices = [],
  scrubMachineType = null,
  additionalServices = [],
  bundleUpholsteryPieces = 0,
  bundleUpholsteryPrice = 0,
  bundleCurtainSteam = false,
  bundleCurtainSteamPrice = 0,
  upholsteryLShape = false,
  upholsteryLShapePrice = 0,
  upholsteryAddonCurtainSteam = false,
  upholsteryAddonCurtainSteamPrice = 0,
  upholsteryAddonDisinfect = false,
  upholsteryAddonDisinfectPrice = 0,
  coatingScrubbingLabel = null,
  coatingScrubbingPrice = 0,
  highCeilingAddon = null,
  totalPrice,
  finalPrice,
  appliedPromo,
  isOverbook,
  step,
  onNext,
  onClear,
  onApplyPromo,
  onRemovePromo,
  isNextDisabled,
  loading,
}: RealtimeSummaryProps) {
  const isFinalStep = step === 'confirm';
  const hasPricing = !!pricing || !!housekeepingPricing;
  const detailsText = serviceLabel ? subtype || 'Configuring…' : 'Waiting for details';

  return (
    <div className="lg:sticky lg:top-6">
      <div className="bg-white lg:rounded-3xl lg:ring-1 lg:ring-slate-100 lg:shadow-sm overflow-hidden flex flex-col">
        {/* Header */}
        <div className="relative p-6 border-b border-slate-100">
          <div className="absolute top-4 right-4 flex items-center gap-1">
            {onClear && (
              <button
                onClick={onClear}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors group"
                title="Clear Selection"
                aria-label="Clear selection"
              >
                <Eraser className="w-4 h-4 text-slate-400 group-hover:text-red-500 transition-colors" />
              </button>
            )}
            <button
              type="button"
              className="p-1.5 hover:bg-emerald-50 rounded-lg transition-colors"
              title="Edit"
              aria-label="Edit selection"
            >
              <Pencil className="w-4 h-4 text-emerald-600" />
            </button>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Booking Breakdown
          </p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight truncate pr-20 text-slate-900">
            {serviceLabel || 'New Quote'}
          </h2>
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-500">
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                serviceLabel ? 'bg-emerald-500' : 'bg-slate-300'
              )}
            />
            {detailsText}
          </p>
        </div>

        {/* Schedule / Arrival */}
        <div className="grid grid-cols-2 gap-4 px-6 py-4 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">
              Schedule
            </p>
            <div className="flex items-center gap-2 mt-2 text-sm">
              <CalendarIcon
                className={cn('w-4 h-4', date ? 'text-emerald-600' : 'text-slate-300')}
              />
              <span className={cn('font-semibold', date ? 'text-slate-900' : 'text-slate-400')}>
                {date
                  ? date.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
                  : 'Not selected'}
              </span>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">
              Arrival
            </p>
            <div className="flex items-center gap-2 mt-2 text-sm">
              <Clock className={cn('w-4 h-4', slot ? 'text-emerald-600' : 'text-slate-300')} />
              <span
                className={cn('font-semibold truncate', slot ? 'text-slate-900' : 'text-slate-400')}
              >
                {slot?.label || 'Not selected'}
              </span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Pricing block or empty state */}
          {hasPricing ? (
            <div className="space-y-2.5">
              {housekeepingPricing ? (
                <div className="flex justify-between items-center text-sm">
                  <div className="flex flex-col">
                    <span className="text-slate-900 font-semibold">
                      {housekeepingPricing.hours} Hours Session
                    </span>
                    <span className="text-[11px] text-slate-500 italic">
                      {housekeepingPricing.label}
                    </span>
                  </div>
                  <span className="font-bold text-slate-900">S${housekeepingPricing.price}</span>
                </div>
              ) : pricing ? (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600 font-medium">{pricing.unit_label}</span>
                  <span className="font-bold text-slate-900">
                    S${pricing.promo_price ?? pricing.price}
                  </span>
                </div>
              ) : null}

              {Object.values(addons).map((addon) => (
                <div
                  key={addon.id}
                  className="flex justify-between items-center text-xs animate-in slide-in-from-right-1"
                >
                  <span className="text-slate-500 font-medium italic">
                    + {addon.addon_group_label}
                  </span>
                  <span className="font-bold text-emerald-600">+S${addon.price}</span>
                </div>
              ))}

              {/* Coating: mandatory scrubbing add-on */}
              {coatingScrubbingLabel && coatingScrubbingPrice > 0 && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium italic">+ {coatingScrubbingLabel} (required)</span>
                  <span className="font-bold text-emerald-600">+S${coatingScrubbingPrice}</span>
                </div>
              )}

              {/* Add-on services (scrubbing / formaldehyde / disinfection / jet_wash) */}
              {addonServices.map((row) => (
                <div key={`asvc-${row.id}`} className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium italic">
                    + {addonServiceLabel(row, scrubMachineType)}
                  </span>
                  <span className="font-bold text-emerald-600">
                    +S${row.promo_price ?? row.price}
                  </span>
                </div>
              ))}

              {/* Additional services (from additional_services table) */}
              {additionalServices.map((it) => (
                <div key={`add-${it.id}`} className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium italic">+ {it.name}</span>
                  <span className="font-bold text-emerald-600">+S${Number(it.price).toFixed(2)}</span>
                </div>
              ))}

              {/* Upholstery bundle */}
              {bundleUpholsteryPieces > 0 && bundleUpholsteryPrice > 0 && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium italic">+ Upholstery — {bundleUpholsteryPieces} pcs</span>
                  <span className="font-bold text-emerald-600">+S${bundleUpholsteryPrice}</span>
                </div>
              )}

              {/* Curtain steam bundle */}
              {bundleCurtainSteam && bundleCurtainSteamPrice > 0 && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium italic">+ Curtain Steam Cleaning</span>
                  <span className="font-bold text-emerald-600">+S${bundleCurtainSteamPrice}</span>
                </div>
              )}

              {/* Upholstery add-ons */}
              {upholsteryAddonCurtainSteam && upholsteryAddonCurtainSteamPrice > 0 && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium italic">+ Curtain Steam (Upholstery)</span>
                  <span className="font-bold text-emerald-600">+S${upholsteryAddonCurtainSteamPrice}</span>
                </div>
              )}
              {upholsteryAddonDisinfect && upholsteryAddonDisinfectPrice > 0 && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium italic">+ Disinfectant Misting</span>
                  <span className="font-bold text-emerald-600">+S${upholsteryAddonDisinfectPrice}</span>
                </div>
              )}
              {upholsteryLShape && upholsteryLShapePrice > 0 && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium italic">+ L-Shape Sofa Upcharge</span>
                  <span className="font-bold text-emerald-600">+S${upholsteryLShapePrice}</span>
                </div>
              )}

              {/* High ceiling */}
              {highCeilingAddon === '4_5m' && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium italic">+ High Ceiling (4–5m)</span>
                  <span className="font-bold text-emerald-600">+S$100</span>
                </div>
              )}

              {(slot?.additionalFee ?? 0) > 0 && (
                <div className="flex justify-between items-center text-xs text-orange-600">
                  <span className="font-medium italic">+ Night/Peak Surcharge</span>
                  <span className="font-bold">+S${slot?.additionalFee}</span>
                </div>
              )}

              {appliedPromo && (
                <div className="flex justify-between items-center text-xs text-emerald-600 font-bold">
                  <span>− Promo: {appliedPromo.code}</span>
                  <span>−S${(totalPrice - finalPrice).toFixed(2)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 ring-1 ring-slate-100">
              <div className="w-9 h-9 rounded-lg bg-white ring-1 ring-slate-200 flex items-center justify-center shrink-0">
                <ClipboardList className="w-4 h-4 text-slate-400" />
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Select a service and size to view pricing details.
              </p>
            </div>
          )}

          {/* Promo code input */}
          {PROMO_STEPS.includes(step) && (
            <div className="pt-2 border-t border-slate-100">
              <PromoCodeInput
                totalPrice={totalPrice}
                onApply={onApplyPromo}
                onRemove={onRemovePromo}
                appliedPromo={appliedPromo}
              />
            </div>
          )}

          {isOverbook && (
            <div className="bg-orange-50 p-3 rounded-xl ring-1 ring-orange-100 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
              <p className="text-xs text-orange-800 font-semibold leading-tight">
                Waitlist request triggered — slot is full.
              </p>
            </div>
          )}

          {/* Hold notice */}
          <div className="bg-emerald-50/70 p-3.5 rounded-xl ring-1 ring-emerald-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white ring-1 ring-emerald-100 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-xs text-emerald-900 leading-snug">
              Slot will be held for{' '}
              <span className="font-bold text-emerald-700 underline decoration-2 underline-offset-2">
                30 minutes
              </span>{' '}
              after payment starts.
            </p>
          </div>
        </div>

        {/* Total + CTA */}
        <div className="px-6 pb-6 pt-2 border-t border-slate-100 mt-auto">
          {Number.isFinite(finalPrice) && finalPrice > 0 && (
            <div className="space-y-1 mb-2 pt-3">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Subtotal (ex-GST)</span>
                <span>S${finalPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>GST (9%)</span>
                <span>S${(finalPrice * 0.09).toFixed(2)}</span>
              </div>
            </div>
          )}
          <div className="flex justify-between items-end mb-4 pt-3">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Total (incl. GST)
              </p>
              <p className="text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
                S${Number.isFinite(finalPrice) ? (finalPrice * 1.09).toFixed(2) : '0.00'}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
              <Lock className="w-3 h-3" /> SSL Secured
            </span>
          </div>

          {!isFinalStep && (
            <Button
              onClick={onNext}
              disabled={isNextDisabled || loading}
              className={cn(
                'w-full h-12 rounded-xl text-sm font-bold transition-all active:scale-[0.98] group',
                isNextDisabled
                  ? 'bg-slate-100 text-slate-400 hover:bg-slate-100'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-500/20'
              )}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span className="flex items-center gap-1.5">
                  {step === 'contact' ? 'Ready to Book' : 'Next Step'}
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </span>
              )}
            </Button>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-400 font-medium text-center mt-3">
        Prices include GST • Singapore Time Support
      </p>
    </div>
  );
}
