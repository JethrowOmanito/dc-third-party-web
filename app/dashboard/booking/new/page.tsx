'use client';
import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import {
  format,
  startOfDay,
  addDays,
  startOfMonth,
  startOfWeek,
  isSameDay,
  isBefore,
  differenceInCalendarMonths,
  addMonths,
} from 'date-fns';
import { useRouter } from 'next/navigation';
import {
  ChevronRight, ChevronLeft, ChevronDown, CheckCircle2,
  Loader2, Clock, Send, Sparkles, X, Plus, Minus,
  Home, Sofa, Wind, Layers, Building2, ShieldCheck,
  MapPin, Calendar as CalendarIcon, Info, Waves, MessageCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import Script from 'next/script';
import CheckoutForm from '@/components/booking/CheckoutForm';
import RealtimeSummary from '@/components/booking/RealtimeSummary';
import JobChatContent from '@/components/booking/JobChatContent';
import { cn, convertTo24Hour, isServiceablePostal } from '@/lib/utils';
import { bookingContactSchema } from '@/lib/validations/booking.schema';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { useBookingStore } from '@/store/bookingStore';
import type { ServiceKey, PricingRow, AddonRow, BookingSlot, HousekeepingPricingRow, PromoCode, AdditionalService } from '@/types';

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : Promise.reject(new Error('Stripe key missing'));

// ─── Constants ───────────────────────────────────────────────────────────────

const SERVICES = [
  { key: 'deep_cleaning'       as ServiceKey, label: 'Deep Cleaning',        icon: Sparkles,    sub: 'Post-Renovation' },
  { key: 'housekeeping'        as ServiceKey, label: 'Housekeeping',          icon: Home,        sub: 'Regular Home Cleaning' },
  { key: 'office'              as ServiceKey, label: 'Office Cleaning',       icon: Building2,   sub: 'Corporate · Office · Retail' },
  { key: 'upholstery'          as ServiceKey, label: 'Upholstery',            icon: Sofa,        sub: 'Sofa · Mattress · Carpet' },
  { key: 'curtain'             as ServiceKey, label: 'Curtain Cleaning',      icon: Wind,        sub: 'Steam · Dry cleaning' },
  { key: 'scrubbing_machine'   as ServiceKey, label: 'Scrubbing Machine',     icon: Waves,       sub: 'Industrial Floor Polish' },
  { key: 'coating'             as ServiceKey, label: 'Floor Coating',         icon: Layers,      sub: 'Protective Floor Coating' },
  { key: 'formaldehyde_removal' as ServiceKey, label: 'Formaldehyde Removal', icon: ShieldCheck, sub: 'Full Unit Air Treatment' },
];

const SERVICE_DB_MAP: Record<string, string> = {
  'Deep Cleaning': 'Float',
  'Housekeeping': 'Housekeeping',
  'Office Cleaning': 'Housekeeping',
  'Upholstery': 'Upholstery',
  'Curtain Cleaning': 'Curtain',
  'Scrubbing Machine': 'Scrubbing',
  'Floor Coating': 'Scrubbing',
  'Formaldehyde Removal': 'Float',
  'Disinfection': 'Float',
  'Window Cleaning': 'Float',
  'Blinds Cleaning': 'Float',
};

const SERVICE_META: Record<string, { iconBg: string; iconText: string; description: string }> = {
  deep_cleaning:        { iconBg: 'bg-emerald-50', iconText: 'text-emerald-600', description: 'Thorough cleaning for your entire space, top to bottom.' },
  housekeeping:         { iconBg: 'bg-sky-50',     iconText: 'text-sky-600',     description: 'Regular maintenance cleaning to keep your space fresh.' },
  office:               { iconBg: 'bg-violet-50',  iconText: 'text-violet-600',  description: 'Professional cleaning for offices and commercial spaces.' },
  upholstery:           { iconBg: 'bg-amber-50',   iconText: 'text-amber-600',   description: 'Specialized cleaning for sofas, mattresses and carpets.' },
  curtain:              { iconBg: 'bg-emerald-50', iconText: 'text-emerald-600', description: 'Steam or dry cleaning for curtains and drapes.' },
  scrubbing_machine:    { iconBg: 'bg-sky-50',     iconText: 'text-sky-600',     description: 'Deep floor scrubbing and polishing for all floor types.' },
  coating:              { iconBg: 'bg-slate-50',   iconText: 'text-slate-600',   description: 'Protective coating for wood, tile, and stone floors.' },
  formaldehyde_removal: { iconBg: 'bg-cyan-50',    iconText: 'text-cyan-600',    description: 'Full-unit indoor air treatment for a healthier space.' },
  disinfection:         { iconBg: 'bg-teal-50',    iconText: 'text-teal-600',    description: 'Sanitisation and disinfection to keep germs at bay.' },
  window_cleaning:      { iconBg: 'bg-blue-50',    iconText: 'text-blue-600',    description: 'Interior and exterior window cleaning for homes and offices.' },
  blinds:               { iconBg: 'bg-indigo-50',  iconText: 'text-indigo-600',  description: 'Per-piece cleaning for roller, venetian, roman and other blinds.' },
};

const SUPER_STEPS = [
  { key: 1, label: 'Choose Service' },
  { key: 2, label: 'Job Details' },
  { key: 3, label: 'Schedule' },
  { key: 4, label: 'Review & Confirm' },
  { key: 5, label: 'Payment' },
] as const;

function getSuperStep(step: string): number {
  switch (step) {
    case 'service':
      return 1;
    case 'type_selection':
    case 'hk_postal':
    case 'duration':
    case 'subtype':
    case 'property':
    case 'size':
    case 'addons':
      return 2;
    case 'datetime':
      return 3;
    case 'contact':
    case 'terms':
      return 4;
    case 'confirm':
    case 'chat':
      return 5;
    default:
      return 1;
  }
}

const SLOTS: BookingSlot[] = [
  { label: '9:00–9:30 AM Arrival',         start: '9:00 AM',  end: '9:30 AM',  additionalFee: 0 },
  { label: '2:00–4:00 PM Arrival',         start: '2:00 PM',  end: '4:00 PM',  additionalFee: 0 },
  { label: '6:00–8:00 PM Arrival (+S$50)', start: '6:00 PM',  end: '8:00 PM',  additionalFee: 50 },
];

function parseSqftMax(unitLabel: string): number | null {
  const below = unitLabel.match(/below\s+(\d+)\s*sqft/i);
  if (below) return parseInt(below[1]);
  const range = unitLabel.match(/(\d+)\s*sqft\s*[-–]\s*(\d+)\s*sqft/i);
  if (range) return parseInt(range[2]);
  return null;
}

const ADDON_CATEGORY_NAMES: Record<string, string> = {
  scrubbing:            'Scrubbing',
  formaldehyde_removal: 'Formaldehyde Removal',
  disinfection:         'Disinfectant Misting',
  jet_wash:             'Jet Wash',
};

const SPRING_HIP_BANDS: Record<string, string[]> = {
  spring: ['100 - 1520 sqft', '1521 - 1800 sqft', '1801 - 2400 sqft', '2401 - 2800 sqft', '2801 - 3399 sqft'],
  hip:    ['100 - 1520 sqft', '1521 - 1700 sqft'],
};

const FALLBACK_SUBTYPES: Partial<Record<ServiceKey, { key: string; label: string }[]>> = {
  deep_cleaning: [
    { key: 'post_reno', label: 'Post-Renovation Cleaning' },
  ],
  office: [
    { key: 'general_office',    label: 'General Office Cleaning' },
    { key: 'deep_office',       label: 'Deep Office Cleaning' },
    { key: 'post_reno_office',  label: 'Post-Reno Office' },
  ],
};

type Step =
  | 'service' | 'type_selection' | 'hk_postal' | 'duration'
  | 'subtype' | 'property' | 'size' | 'datetime' | 'addons'
  | 'contact' | 'terms' | 'confirm' | 'chat';

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BookingNewPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const supabase = getSupabaseClient();
  const isSubmitting = useRef(false);
  const bookingStore = useBookingStore();

  // Approval gate — pending or rejected users can browse the dashboard but
  // must be blocked from starting a booking.
  useEffect(() => {
    if (user && user.approval_status && user.approval_status !== 'approved') {
      router.replace('/dashboard');
    }
  }, [user, router]);
  if (user && user.approval_status && user.approval_status !== 'approved') {
    return (
      <div className="max-w-md mx-auto mt-16 p-6 bg-amber-50 border border-amber-200 rounded-2xl text-center">
        <p className="text-sm font-semibold text-amber-900">Your account is pending approval.</p>
        <p className="text-xs text-amber-800 mt-2">
          You&apos;ll be able to book once an admin reviews your application. Redirecting to your dashboard…
        </p>
      </div>
    );
  }

  // Payment-terms gate — admin (Zoe) must set upfront vs end_of_month
  // before the company can book, otherwise the server would reject at
  // /api/bookings/submit.
  if (user && (user as any).company_payment_terms !== 'upfront' && (user as any).company_payment_terms !== 'end_of_month') {
    return (
      <div className="max-w-md mx-auto mt-16 p-6 bg-amber-50 border border-amber-200 rounded-2xl text-center">
        <p className="text-sm font-semibold text-amber-900">Bookings are almost ready.</p>
        <p className="text-xs text-amber-800 mt-2">
          Your account is approved, but your company&apos;s payment terms haven&apos;t
          been set yet. Please contact <span className="font-semibold">Zoe</span> to
          enable bookings.
        </p>
      </div>
    );
  }

  // ── Step state ──
  const [step, setStep]           = useState<Step>('service');
  const [service, setService]     = useState<ServiceKey | null>(null);
  const [bookingMode, setBookingMode] = useState<'general' | 'deep' | null>(null);

  // ── Date / slot ──
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [slot, setSlot]                 = useState<BookingSlot | null>(null);
  const [availability, setAvailability] = useState<Record<string, { available: boolean; reason?: string }>>({});
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [monthOffset, setMonthOffset]   = useState(0);
  const [showSlotPicker, setShowSlotPicker] = useState(false);
  const [showMobileSummary, setShowMobileSummary] = useState(false);

  // ── Pricing modifiers (mirror booking-web) ──
  const [springHipSqftBand, setSpringHipSqftBand]           = useState<string | null>(null);
  const [tenancyMoveType, setTenancyMoveType]               = useState<'move_in' | 'move_out' | null>(null);
  const [bundleUpholsteryPieces, setBundleUpholsteryPieces] = useState<0 | 2 | 3>(0);
  const [bundleCurtainSteam, setBundleCurtainSteam]         = useState(false);
  const [highCeilingAddon, setHighCeilingAddon]             = useState<'4_5m' | null>(null);
  const [upholsteryAddonCurtainSteam, setUpholsteryAddonCurtainSteam] = useState(false);
  const [upholsteryAddonDisinfect, setUpholsteryAddonDisinfect]       = useState(false);
  const [upholsteryLShape, setUpholsteryLShape]             = useState(false);
  const [scrubMachineType, setScrubMachineType]             = useState<'KM1' | 'LC1' | null>(null);
  const [showHighCeiling, setShowHighCeiling]               = useState(false);

  // ── Service details ──
  const [subtype, setSubtype]                           = useState('');
  const [selectedSubcategoryKey, setSelectedSubcategoryKey] = useState('');
  const [propertyType, setPropertyType]                 = useState<'hdb' | 'condo' | 'landed' | 'commercial' | null>(null);
  const [selectedPricing, setSelectedPricing]           = useState<PricingRow | null>(null);
  const [selectedHKPricing, setSelectedHKPricing]       = useState<HousekeepingPricingRow | null>(null);
  const [selectedAddons, setSelectedAddons]             = useState<Record<number, AddonRow>>({});
  const [selectedAddonServices, setSelectedAddonServices] = useState<Record<number, PricingRow>>({});
  const [selectedAdditionalServices, setSelectedAdditionalServices] = useState<Set<number>>(new Set());
  // Blinds: per-piece quantity per row id
  const [blindsQuantities, setBlindsQuantities] = useState<Record<number, number>>({});
  const [pricingRows, setPricingRows]                   = useState<PricingRow[]>([]);
  const [addonRows, setAddonRows]                       = useState<AddonRow[]>([]);
  const [addonServiceRows, setAddonServiceRows]         = useState<PricingRow[]>([]);
  const [additionalServiceRows, setAdditionalServiceRows] = useState<AdditionalService[]>([]);
  const [hkPricingRows, setHkPricingRows]               = useState<HousekeepingPricingRow[]>([]);
  const [calendarId, setCalendarId]                     = useState<string | null>(null);
  const [loadingPricing, setLoadingPricing]             = useState(false);
  const [expandedAddonGroup, setExpandedAddonGroup]     = useState<string | null>(null);

  // ── Contact / address ──
  const [name, setName]               = useState('');
  const [phone, setPhone]             = useState('');
  const [email, setEmail]             = useState('');
  const [postalCode, setPostalCode]   = useState('');
  const [fetchedAddress, setFetchedAddress] = useState('');
  const [unitNumber, setUnitNumber]   = useState('');
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [postalStatus, setPostalStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [notes, setNotes]             = useState('');
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});

  // ── Terms / promo ──
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [appliedPromo, setAppliedPromo]   = useState<PromoCode | null>(null);
  const [finalPrice, setFinalPrice]       = useState(0);

  // ── Payment / chat ──
  const [clientSecret, setClientSecret]         = useState<string | null>(null);
  const [currentBookingId, setCurrentBookingId] = useState<string | null>(null);
  const [currentRefId, setCurrentRefId]         = useState<string | null>(null);
  const [loadingPayment, setLoadingPayment]     = useState(false);
  const [isChatInquiry, setIsChatInquiry]       = useState(false);
  const [submitting, setSubmitting]             = useState(false);

  // ─── Derived ─────────────────────────────────────────────────────────────

  const serviceLabel = useMemo(() => SERVICES.find(s => s.key === service)?.label || '', [service]);
  const serviceDbName = useMemo(() => SERVICE_DB_MAP[serviceLabel] || 'Float', [serviceLabel]);

  // Partner pricing: prefer partner_price. Skip promo_price entirely (NO FURTHER REBATE for partners).
  const effectivePrice = (row: PricingRow | null) =>
    row ? (row.partner_price ?? row.price ?? 0) : 0;

  const basePrice = useMemo(() =>
    selectedHKPricing ? selectedHKPricing.price : effectivePrice(selectedPricing),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [selectedHKPricing, selectedPricing]);

  // Curtain steam bundle price — Spring/HIP use their own subcategory rows, Move-Out uses steam_bundle_moveout.
  const curtainSteamUnitPrice = useMemo(() => {
    const isSpring = selectedSubcategoryKey === 'spring';
    const isHip    = selectedSubcategoryKey === 'hip';
    if (isSpring || isHip) {
      const subcat = isSpring ? 'spring_bundle' : 'hip_bundle';
      const row = pricingRows.find(r => r.category === 'curtain' && r.subcategory === subcat && r.unit_label === springHipSqftBand);
      return row ? effectivePrice(row) : 98;
    }
    const selectedSqftMax = parseSqftMax(selectedPricing?.unit_label ?? '');
    const isMoveOut = selectedSubcategoryKey === 'tenancy' && tenancyMoveType === 'move_out';
    const steamBundleSubcat = isMoveOut ? 'steam_bundle_moveout' : 'steam_bundle';
    const rows = pricingRows.filter(r => r.category === 'curtain' && r.subcategory === steamBundleSubcat);
    const match = rows.find(r => {
      const rowSqftMax = parseSqftMax(r.unit_label || '');
      return rowSqftMax !== null && selectedSqftMax !== null && rowSqftMax >= selectedSqftMax;
    }) ?? rows[rows.length - 1];
    return match ? effectivePrice(match) : 98;
  }, [selectedSubcategoryKey, springHipSqftBand, pricingRows, selectedPricing, tenancyMoveType]);

  const bundleCurtainSteamPrice = bundleCurtainSteam ? curtainSteamUnitPrice : 0;

  // Upholstery add-on rows
  const upholsteryAddonCurtainSteamRow = useMemo(() =>
    pricingRows.find(r => r.category === 'upholstery_addon' && r.subcategory === 'curtain_steam'),
  [pricingRows]);
  const upholsteryAddonDisinfectRow = useMemo(() =>
    pricingRows.find(r => r.category === 'upholstery_addon' && r.subcategory === 'disinfect'),
  [pricingRows]);
  const UPHOLSTERY_ADDON_CURTAIN_STEAM_PRICE = upholsteryAddonCurtainSteamRow ? effectivePrice(upholsteryAddonCurtainSteamRow) : 98;
  const UPHOLSTERY_ADDON_DISINFECT_PRICE     = upholsteryAddonDisinfectRow ? effectivePrice(upholsteryAddonDisinfectRow) : 88;

  // Upholstery L-Shape add-on
  const upholsteryLShapeRow = useMemo(() =>
    pricingRows.find(r => r.category === 'upholstery' && r.subcategory === 'sofa' && (r.unit_label || '').toLowerCase().includes('l-shape')),
  [pricingRows]);
  const UPHOLSTERY_LSHAPE_PRICE = upholsteryLShapeRow ? effectivePrice(upholsteryLShapeRow) : 30;

  // Upholstery bundle rows
  const upholsteryBundle2Row = useMemo(() =>
    pricingRows.find(r => r.category === 'upholstery' && r.subcategory === 'bundle' && r.unit_label === 'Any 2 Pieces'),
  [pricingRows]);
  const upholsteryBundle3Row = useMemo(() =>
    pricingRows.find(r => r.category === 'upholstery' && r.subcategory === 'bundle' && r.unit_label === 'Any 3 Pieces'),
  [pricingRows]);

  const bundleUpholsteryPrice = bundleUpholsteryPieces === 2
    ? (upholsteryBundle2Row ? effectivePrice(upholsteryBundle2Row) : 158)
    : bundleUpholsteryPieces === 3
    ? (upholsteryBundle3Row ? effectivePrice(upholsteryBundle3Row) : 188)
    : 0;

  const upholsteryAddonTotal = service === 'upholstery'
    ? (upholsteryAddonCurtainSteam ? UPHOLSTERY_ADDON_CURTAIN_STEAM_PRICE : 0)
      + (upholsteryAddonDisinfect ? UPHOLSTERY_ADDON_DISINFECT_PRICE : 0)
    : 0;

  // Coating: mandatory scrubbing add-on row (matched by selected size)
  const coatingScrubbingRow = useMemo(() => {
    if (service !== 'coating') return null;
    const standalone = pricingRows.filter(r => r.category === 'scrubbing' && r.subcategory === 'standalone' && !r.is_site_visit);
    if (selectedPricing) {
      const matched = standalone.filter(r => r.unit_label === selectedPricing.unit_label);
      if (matched.length > 0) return matched[0];
    }
    return standalone[0] ?? null;
  }, [service, pricingRows, selectedPricing]);

  // Additional services — hide cleaning-type names that aren't true add-ons (they're subtypes).
  const HIDDEN_ADDITIONAL_KEYWORDS = ['tenancy', 'renovation', 'spring', 'hip'];
  const displayAdditionalServices = useMemo(() =>
    additionalServiceRows.filter((svc) =>
      !HIDDEN_ADDITIONAL_KEYWORDS.some((kw) => svc.name.toLowerCase().includes(kw))
    ),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [additionalServiceRows]);

  // Sum priced additional services (previously missing — every add-on was $0 in the quote).
  const additionalServicesTotal = useMemo(() => {
    let s = 0;
    for (const id of selectedAdditionalServices) {
      const row = additionalServiceRows.find((r) => r.id === id);
      if (row?.price) s += Number(row.price) || 0;
    }
    return s;
  }, [selectedAdditionalServices, additionalServiceRows]);

  // Blinds: per-piece total = sum(qty × price)
  const blindsTotal = useMemo(() => {
    if (service !== 'blinds') return 0;
    return pricingRows.reduce((s, r) => {
      if (r.category !== 'blinds') return s;
      const qty = blindsQuantities[r.id] ?? 0;
      return s + qty * (r.partner_price ?? r.price ?? 0);
    }, 0);
  }, [service, pricingRows, blindsQuantities]);
  const blindsCount = useMemo(() =>
    Object.values(blindsQuantities).reduce((s, q) => s + (q || 0), 0),
  [blindsQuantities]);

  const totalPrice = useMemo(() =>
    basePrice +
    Object.values(selectedAddons).reduce((s, a) => s + (a.price ?? 0), 0) +
    Object.values(selectedAddonServices).reduce((s, r) => s + effectivePrice(r), 0) +
    additionalServicesTotal +
    bundleUpholsteryPrice +
    bundleCurtainSteamPrice +
    upholsteryAddonTotal +
    (upholsteryLShape ? UPHOLSTERY_LSHAPE_PRICE : 0) +
    (coatingScrubbingRow ? effectivePrice(coatingScrubbingRow) : 0) +
    blindsTotal +
    (slot?.additionalFee ?? 0) +
    (highCeilingAddon === '4_5m' ? 100 : 0),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [basePrice, selectedAddons, selectedAddonServices, additionalServicesTotal, bundleUpholsteryPrice, bundleCurtainSteamPrice, upholsteryAddonTotal, upholsteryLShape, UPHOLSTERY_LSHAPE_PRICE, coatingScrubbingRow, blindsTotal, slot, highCeilingAddon]);

  // Company (partner) discount — applied automatically for approved partners.
  // Order: company discount first, then promo code on the discounted amount.
  const companyDiscountAmount = useMemo(() => {
    if (user?.approval_status !== 'approved') return 0;
    const type = user.company_discount_type;
    const value = Number(user.company_discount_value ?? 0);
    if (!type || value <= 0) return 0;
    if (type === 'percent') return (totalPrice * value) / 100;
    return Math.min(value, totalPrice);
  }, [user, totalPrice]);

  // Recompute finalPrice whenever totalPrice or discounts change.
  useEffect(() => {
    const afterCompanyDiscount = Math.max(0, totalPrice - companyDiscountAmount);
    if (!appliedPromo) {
      setFinalPrice(afterCompanyDiscount);
      return;
    }
    const promoDiscount =
      (appliedPromo as any).discount_type === 'percentage'
        ? (afterCompanyDiscount * ((appliedPromo as any).discount_value ?? 0)) / 100
        : ((appliedPromo as any).discount_value ?? 0);
    setFinalPrice(Math.max(0, afterCompanyDiscount - promoDiscount));
  }, [totalPrice, companyDiscountAmount, appliedPromo]);

  const slotAvail = useMemo(() => slot ? availability[slot.start] : null, [slot, availability]);
  const isOverbook = useMemo(() => Boolean(slotAvail && !slotAvail.available), [slotAvail]);

  // ─── Store hydration (runs once after mount so sessionStorage is available) ──

  useEffect(() => {
    const s = bookingStore;
    // Prefer values previously entered in this wizard session; fall back to
    // the logged-in partner's profile so the contact step is prefilled by
    // default (partner is booking on behalf of themselves in most cases).
    if (s.contactName)      setName(s.contactName);
    else if (user?.name)    setName(user.name);
    if (s.contactPhone)     setPhone(s.contactPhone);
    else if (user?.whatsapp_phone) setPhone(user.whatsapp_phone);
    if (s.contactEmail)     setEmail(s.contactEmail);
    else if (user?.email)   setEmail(user.email);
    if (s.contactNotes) setNotes(s.contactNotes);
    if (s.postalCode) {
      setPostalCode(s.postalCode);
      if (s.fetchedAddress) { setFetchedAddress(s.fetchedAddress); setPostalStatus('valid'); }
    }
    if (s.unitNumber) setUnitNumber(s.unitNumber);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Sync contact + address back to store whenever they change
  useEffect(() => {
    bookingStore.setContact({ contactName: name, contactPhone: phone, contactEmail: email, contactNotes: notes });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, phone, email, notes]);

  useEffect(() => {
    if (postalCode && fetchedAddress) bookingStore.setPostal(postalCode, fetchedAddress, unitNumber);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postalCode, fetchedAddress, unitNumber]);

  const isStandaloneService = service !== null &&
    ['scrubbing_machine', 'formaldehyde_removal', 'coating', 'disinfection'].includes(service);
  const isPerPieceService = service === 'blinds';

  const cheapestHKHours = useMemo(() => {
    const oneX = hkPricingRows.filter(r => !r.label.toLowerCase().includes('4x'));
    if (oneX.length === 0) return null;
    return oneX.reduce((min, r) => r.price < min.price ? r : min).hours;
  }, [hkPricingRows]);

  // ─── Subcategory options (DB-driven, fallback to hardcoded) ──────────────

  const ALA_CARTE_KEYWORDS = ['ala carte', 'a la carte', 'ala-carte'];

  const subcategoryOptions = useMemo(() => {
    const seen = new Set<string>();
    const result: { key: string; label: string }[] = [];
    // Deep-cleaning subcategory visibility depends on partner_role:
    //   interior_designer  → renovation only (their business is post-reno)
    //   agent / other      → all subcategories (renovation, tenancy, spring, hip)
    //   null (legacy)      → falls through to all; the migration backfilled
    //                        interior_design-company users to interior_designer
    //                        so the current restricted view is preserved.
    const partnerRole = (user as { partner_role?: string | null } | null)?.partner_role;
    const deepCleaningAllowlist: Set<string> | null =
      partnerRole === 'interior_designer'
        ? new Set(['renovation', 'post_reno'])
        : null;
    for (const row of pricingRows) {
      if (row.subcategory && !seen.has(row.subcategory)) {
        // Exclude addon/bundle pricing rows from subcategory selection options (mirror booking-web).
        if (row.category === 'upholstery_addon') continue;
        if (row.category === 'curtain' && (
          row.subcategory === 'steam_bundle' ||
          row.subcategory === 'steam_bundle_moveout' ||
          row.subcategory === 'spring_bundle' ||
          row.subcategory === 'hip_bundle'
        )) continue;
        if (row.category === 'upholstery' && row.subcategory === 'bundle') continue;
        // Upholstery: curtain subcategories are grouped under the synthetic "Curtain Steam Cleaning" entry
        if (service === 'upholstery' && row.category === 'curtain') continue;
        // Deep cleaning: curtain rows are loaded for bundle pricing only — exclude from subtype list
        if (service === 'deep_cleaning' && row.category === 'curtain') continue;
        // Role-gated: interior designers see renovation only; agent/other see all.
        if (service === 'deep_cleaning' && deepCleaningAllowlist && !deepCleaningAllowlist.has(row.subcategory)) continue;
        const label = row.subcategory_label || row.subcategory;
        if (ALA_CARTE_KEYWORDS.some(kw => label.toLowerCase().includes(kw))) continue;
        if (service === 'curtain' && label.toLowerCase().includes('steam')) continue;
        seen.add(row.subcategory);
        result.push({ key: row.subcategory, label });
      }
    }
    if (service === 'upholstery') {
      const hasCurtainRows = pricingRows.some(r => r.category === 'curtain');
      const curtainListed = result.some(opt => opt.key === 'curtain_steam' || opt.label.toLowerCase().includes('curtain'));
      if (hasCurtainRows && !curtainListed) result.push({ key: 'curtain_steam', label: 'Curtain Steam Cleaning' });
    }
    if (service === 'curtain') {
      const hasDryRows = pricingRows.some(r => r.category === 'curtain');
      const dryListed = result.some(opt => opt.label.toLowerCase().includes('dry'));
      if (hasDryRows && !dryListed) result.push({ key: 'dry_cleaning', label: 'Dry Cleaning' });
    }
    if (result.length > 0) return result;
    return service ? (FALLBACK_SUBTYPES[service] || []) : [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricingRows, service, user]);

  // ─── Filtered size rows ───────────────────────────────────────────────────

  const filteredSizeRows = useMemo(() => {
    // Direct-pricing services: show only their own rows.
    if (service === 'scrubbing_machine') {
      return pricingRows.filter(r => {
        if (r.category !== 'scrubbing') return false;
        if (r.is_site_visit) return false;
        const label = (r.subcategory_label || r.subcategory || '').toLowerCase();
        return !label.includes('coating');
      });
    }
    if (service === 'coating') {
      return pricingRows.filter(r => {
        // Scrubbing rows fetched alongside are shown in the next step, not here.
        if (r.category !== 'coating') return false;
        if (r.is_site_visit) return false;
        if (r.subcategory === 'spring_addon' || r.subcategory === 'hip_addon') return false;
        return true;
      });
    }
    if (service === 'formaldehyde_removal') {
      return pricingRows.filter(r => r.category === 'formaldehyde_removal' && !r.is_site_visit);
    }
    if (service === 'disinfection') {
      return pricingRows.filter(r => r.category === 'disinfection' && !r.is_site_visit);
    }
    // Synthetic curtain_steam key: curtain rows excluding dry cleaning and bundle rows
    if (selectedSubcategoryKey === 'curtain_steam') {
      return pricingRows.filter(r => {
        if (r.is_site_visit || r.category !== 'curtain') return false;
        if (r.subcategory === 'steam_bundle' || r.subcategory === 'steam_bundle_moveout') return false;
        if (r.subcategory === 'spring_bundle' || r.subcategory === 'hip_bundle') return false;
        const label = (r.subcategory_label || r.subcategory || r.unit_label || '').toLowerCase();
        return !label.includes('dry');
      });
    }
    // Synthetic dry_cleaning key: curtain rows excluding steaming and bundle rows
    if (selectedSubcategoryKey === 'dry_cleaning') {
      return pricingRows.filter(r => {
        if (r.is_site_visit || r.category !== 'curtain') return false;
        if (r.subcategory === 'steam_bundle' || r.subcategory === 'steam_bundle_moveout') return false;
        if (r.subcategory === 'spring_bundle' || r.subcategory === 'hip_bundle') return false;
        const label = (r.subcategory_label || r.subcategory || r.unit_label || '').toLowerCase();
        return !label.includes('steam');
      });
    }
    // Window cleaning: filter by property_type (residential = null, commercial = 'commercial')
    if (service === 'window_cleaning') {
      return pricingRows.filter(r => {
        if (r.is_site_visit) return false;
        if (r.category !== 'window_cleaning') return false;
        if (propertyType === 'commercial') return r.property_type === 'commercial';
        return !r.property_type;
      });
    }
    // Blinds: per-piece service — return all blinds rows (no property/subcategory filter)
    if (service === 'blinds') {
      return pricingRows.filter(r => r.category === 'blinds' && !r.is_site_visit);
    }
    // Landed: only show sqft bands ≥ 1400 (landed properties are 1500sqft+)
    if (propertyType === 'landed') {
      return pricingRows.filter(r => {
        if (r.is_site_visit) return false;
        if (r.subcategory && r.subcategory !== selectedSubcategoryKey) return false;
        if (r.property_type !== null) return false;
        const label = r.unit_label || '';
        if (label.startsWith('below') || label.startsWith('Below')) return false;
        const m = label.match(/^(\d+)/);
        const minSqft = m ? parseInt(m[1]) : 0;
        return minSqft >= 1400;
      });
    }
    // Upholstery sofa: exclude L-Shape row — it's shown as a separate checkbox
    if (service === 'upholstery' && selectedSubcategoryKey === 'sofa') {
      return pricingRows.filter(r =>
        !r.is_site_visit &&
        r.category === 'upholstery' &&
        r.subcategory === 'sofa' &&
        !(r.unit_label || '').toLowerCase().includes('l-shape')
      );
    }
    return pricingRows.filter(r => {
      if (r.is_site_visit) return false;
      // Only rows from the service's main category (ignore cross-category rows fetched for bundle/addon lookups).
      if (service === 'deep_cleaning' && r.category !== 'deep_cleaning') return false;
      if (service === 'upholstery' && r.category !== 'upholstery') return false;
      if (r.subcategory && r.subcategory !== selectedSubcategoryKey) return false;
      if (r.property_type && r.property_type !== propertyType) return false;
      // HDB flats above 2300sqft are extremely rare — cap the size options
      if (propertyType === 'hdb') {
        const sqftMax = parseSqftMax(r.unit_label || '');
        if (sqftMax !== null && sqftMax > 2300) return false;
      }
      return true;
    });
  }, [service, pricingRows, selectedSubcategoryKey, propertyType]);

  const cheapestSizeRowId = useMemo(() => {
    const priced = filteredSizeRows.filter(r => (r.partner_price ?? r.price) !== null);
    if (priced.length === 0) return null;
    return priced.reduce((min, r) =>
      (r.partner_price ?? r.price ?? Infinity) < (min.partner_price ?? min.price ?? Infinity) ? r : min
    ).id;
  }, [filteredSizeRows]);

  // ─── Step order ───────────────────────────────────────────────────────────

  const STEP_ORDER = useMemo<Step[]>(() => {
    const steps: Step[] = ['service'];
    const isHKOrOffice = service === 'housekeeping' || service === 'office';

    if (isHKOrOffice) {
      steps.push('type_selection', 'hk_postal', 'duration', 'datetime', 'contact', 'terms', 'confirm');
      return steps;
    }

    if (service === 'upholstery' || service === 'curtain') {
      steps.push('subtype', 'size', 'datetime');
    } else if (service === 'window_cleaning') {
      steps.push('property', 'size', 'datetime');
    } else if (isPerPieceService) {
      steps.push('size', 'datetime');
    } else if (isStandaloneService) {
      steps.push('size', 'datetime');
    } else {
      steps.push('subtype', 'property', 'size', 'datetime', 'addons');
    }

    steps.push('contact', 'terms', 'confirm');
    return steps;
  }, [service, isStandaloneService, isPerPieceService]);

  const stepIndex = STEP_ORDER.indexOf(step);
  const progress = ((stepIndex + 1) / STEP_ORDER.length) * 100;

  const goBack = () => {
    if (stepIndex > 0) setStep(STEP_ORDER[stepIndex - 1]);
    else router.back();
  };

  const stepTitle = (s: Step): string => ({
    service: 'Choose Your Service',
    type_selection: 'Service Mode',
    hk_postal: 'Service Location',
    duration: 'Select Duration',
    subtype: 'Cleaning Type',
    property: 'Property Info',
    size: 'Units & Pricing',
    datetime: 'Choose Schedule',
    addons: 'Add-on Services',
    contact: 'Contact Details',
    terms: 'Terms & Confirm',
    confirm: 'Review & Pay',
    chat: 'Concierge Chat',
  }[s] || 'Book a Service');

  const stepSubtitle = (s: Step): string => ({
    service: 'Select the type of service you need',
    type_selection: 'Pick a booking mode to continue',
    hk_postal: 'Where is the service being performed?',
    duration: 'How long do you need the cleaner?',
    subtype: 'Choose the sub-category that fits best',
    property: 'Tell us about the property',
    size: 'Pick a unit size to view pricing',
    datetime: 'Pick a date and arrival window',
    addons: 'Optional extras for your booking',
    contact: 'Who should we contact for this job?',
    terms: 'Review and accept our booking terms',
    confirm: 'Complete your payment to confirm',
    chat: 'Talk to our concierge team',
  }[s] || '');

  // ─── Availability ─────────────────────────────────────────────────────────

  const getDisplaySlots = useMemo<BookingSlot[]>(() => {
    if (bookingMode !== 'general') return SLOTS;
    const times = ['9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM'];
    return times.map(t => ({
      label: `${t} Arrival${t === '6:00 PM' ? ' (+S$50)' : ''}`,
      start: t, end: t,
      additionalFee: t === '6:00 PM' ? 50 : 0,
    }));
  }, [bookingMode]);

  useEffect(() => {
    setSlot(null);
    setAvailability({});
    if (!selectedDate || !service) return;

    const check = async () => {
      setLoadingAvail(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const slots = getDisplaySlots;
      const results: Record<string, { available: boolean; reason?: string }> = {};

      await Promise.all(slots.map(async (s) => {
        try {
          const durationMins = selectedHKPricing ? selectedHKPricing.hours * 60 : undefined;
          const url = `/api/bookings/check?service=${service}&date=${dateStr}&start=${encodeURIComponent(s.start)}&end=${encodeURIComponent(s.end)}${durationMins ? `&duration=${durationMins}` : ''}${postalCode ? `&postal=${postalCode}` : ''}${propertyType ? `&property=${propertyType}` : ''}`;
          const res = await fetch(url);
          const data = await res.json();
          results[s.start] = { available: data.available, reason: data.reason };
        } catch {
          results[s.start] = { available: false, reason: 'Error checking availability' };
        }
      }));

      setAvailability(results);
      setLoadingAvail(false);
    };
    check();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, service, selectedHKPricing]);

  // ─── Pricing fetch ────────────────────────────────────────────────────────

  useEffect(() => {
    if (service) fetchPricing();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, bookingMode]);

  const fetchPricing = async () => {
    if (!service) return;
    setLoadingPricing(true);

    // Fix: disinfection now maps to its own category (was incorrectly 'formaldehyde_removal').
    const categoryMap: Record<ServiceKey, string> = {
      deep_cleaning: 'deep_cleaning', housekeeping: 'housekeeping', office: 'office',
      upholstery: 'upholstery', curtain: 'curtain', scrubbing_machine: 'scrubbing',
      coating: 'coating', formaldehyde_removal: 'formaldehyde_removal', disinfection: 'disinfection',
      window_cleaning: 'window_cleaning', blinds: 'blinds',
    };
    const targetCategory = categoryMap[service];
    // Match booking-web: upholstery pulls curtain + upholstery_addon rows, deep_cleaning pulls curtain (for steam bundle), coating pulls scrubbing (mandatory addon).
    const targetCategories =
      service === 'upholstery' ? ['upholstery', 'curtain', 'upholstery_addon']
      : service === 'deep_cleaning' ? ['deep_cleaning', 'curtain']
      : service === 'coating' ? ['coating', 'scrubbing']
      : [targetCategory];

    const [pricingRes, addonRes, hkRes, calRes, additionalRes] = await Promise.all([
      supabase.from('service_pricing').select('*').in('category', targetCategories).eq('is_active', true).order('sort_order'),
      supabase.from('service_addons').select('*').order('sort_order'),
      supabase.from('housekeeping_pricing').select('*').eq('is_active', true).order('sort_order').order('hours'),
      supabase.from('calendars').select('id').eq('name', serviceDbName).limit(1).maybeSingle(),
      supabase.from('additional_services').select('*').eq('parent_service', serviceDbName).order('id'),
    ]);

    // Post-fetch narrowing for services that share tables (mirror booking-web page.tsx:884-892).
    // Ala-carte services prefer 'standalone' rows; fall back to 'addon' if none.
    // Disinfection only uses 'misting' rows. Coating rows use 'addon' subcategory in DB.
    let rows = (pricingRes.data || []) as PricingRow[];
    if (service === 'disinfection') {
      rows = rows.filter((r) => (r.subcategory || '').toLowerCase() === 'misting');
    } else if (service === 'scrubbing_machine' || service === 'formaldehyde_removal') {
      const standalone = rows.filter((r) => (r.subcategory || '').toLowerCase() === 'standalone');
      rows = standalone.length > 0
        ? standalone
        : rows.filter((r) => (r.subcategory || '').toLowerCase() === 'addon');
    }

    setPricingRows(rows);
    setAddonRows((addonRes.data || []) as AddonRow[]);
    setAdditionalServiceRows((additionalRes.data || []) as AdditionalService[]);
    setHkPricingRows((hkRes.data || []) as HousekeepingPricingRow[]);
    if (calRes.data) setCalendarId(calRes.data.id);
    setLoadingPricing(false);
  };

  // ─── Addon service rows (unit-specific: scrubbing/coating/formaldehyde) ──────

  useEffect(() => {
    setAddonServiceRows([]);
    setSelectedAddonServices({});
    const isSpringHip = selectedSubcategoryKey === 'spring' || selectedSubcategoryKey === 'hip';
    if (isSpringHip) {
      if (!propertyType || !springHipSqftBand) return;
    } else {
      if (!selectedPricing || !propertyType) return;
    }
    const fetchAddonServices = async () => {
      try {
        // Add-on categories differ by deep-cleaning subtype (mirror booking-web page.tsx:924-930)
        const ADDON_CAT_ORDER_MAP: Record<string, string[]> = {
          renovation: ['scrubbing', 'formaldehyde_removal', 'jet_wash'],
          tenancy:    tenancyMoveType === 'move_out' ? ['scrubbing', 'jet_wash'] : ['scrubbing', 'disinfection', 'jet_wash'],
          spring:     ['scrubbing', 'disinfection',         'jet_wash'],
          hip:        ['scrubbing', 'formaldehyde_removal', 'disinfection'],
        };
        const ADDON_CAT_ORDER = ADDON_CAT_ORDER_MAP[selectedSubcategoryKey] ?? ['scrubbing', 'formaldehyde_removal', 'jet_wash'];
        let query = supabase
          .from('service_pricing')
          .select('*')
          .in('category', ADDON_CAT_ORDER)
          .eq('is_active', true)
          .eq('is_site_visit', false)
          .or(`property_type.is.null,property_type.eq.${propertyType}`)
          .order('sort_order');
        if (isSpringHip) {
          const addonSubcat = selectedSubcategoryKey === 'spring' ? 'spring_addon' : 'hip_addon';
          query = query.eq('subcategory', addonSubcat).eq('unit_label', springHipSqftBand!);
        } else {
          query = query.neq('subcategory', 'standalone').eq('unit_label', selectedPricing!.unit_label);
        }
        const { data } = await query;
        setAddonServiceRows(((data || []) as PricingRow[]).sort((a, b) =>
          ADDON_CAT_ORDER.indexOf(a.category) - ADDON_CAT_ORDER.indexOf(b.category)
        ));
      } catch (err) {
        console.error('[fetchAddonServices] Failed to load addon pricing:', err);
      }
    };
    fetchAddonServices();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPricing, propertyType, selectedSubcategoryKey, springHipSqftBand, tenancyMoveType]);

  // ─── Address lookup ───────────────────────────────────────────────────────

  const fetchAddress = async (code: string) => {
    if (code.length !== 6) return;
    setLoadingAddress(true);
    setFetchedAddress('');
    try {
      const res = await fetch(`/api/address/lookup?postal=${code}`);
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};
      if (data.found > 0 && data.results?.[0]?.ADDRESS) {
        setFetchedAddress(data.results[0].ADDRESS);
        setPostalStatus(isServiceablePostal(code) ? 'valid' : 'invalid');
      } else {
        setFetchedAddress('');
        setPostalStatus('invalid');
        setContactErrors(prev => ({ ...prev, postalCode: 'Postal code not found.' }));
      }
    } catch {
      setFetchedAddress('');
      setPostalStatus('invalid');
    } finally {
      setLoadingAddress(false);
    }
  };

  const handlePostalChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    setPostalCode(cleaned);
    setPostalStatus('idle');
    setFetchedAddress('');
    setContactErrors(prev => { const e = { ...prev }; delete e.postalCode; return e; });
    if (cleaned.length === 6) fetchAddress(cleaned);
  };

  // ─── Promo ────────────────────────────────────────────────────────────────

  const handlePromoApply = (promo: PromoCode, discountedTotal: number) => {
    setAppliedPromo(promo);
    setFinalPrice(discountedTotal);
  };

  const handlePromoRemove = () => {
    setAppliedPromo(null);
    setFinalPrice(totalPrice);
  };

  // ─── Validation ───────────────────────────────────────────────────────────

  const validateContact = () => {
    const result = bookingContactSchema.safeParse({ name, phone, email, postalCode, unitNumber, notes });
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach(e => { if (e.path[0]) errs[String(e.path[0])] = e.message; });
      setContactErrors(errs);
      return false;
    }
    if (!fetchedAddress) {
      setContactErrors(prev => ({ ...prev, postalCode: 'Please enter a valid postal code to auto-fill address.' }));
      return false;
    }
    if (!isServiceablePostal(postalCode)) {
      setContactErrors(prev => ({ ...prev, postalCode: 'This postal code is outside our service area.' }));
      return false;
    }
    setContactErrors({});
    return true;
  };

  const isNextDisabled = useMemo(() => {
    if (step === 'service') return !service;
    if (step === 'type_selection') return !bookingMode;
    if (step === 'hk_postal') return postalCode.length < 6 || postalStatus === 'invalid' || !fetchedAddress;
    if (step === 'duration') return !selectedHKPricing;
    if (step === 'subtype') return !selectedSubcategoryKey && !subtype;
    if (step === 'property') return !propertyType;
    if (step === 'size') {
      if (service === 'blinds') return blindsCount === 0;
      return !selectedPricing;
    }
    if (step === 'datetime') return !selectedDate || !slot;
    if (step === 'contact') return !name || !phone || !postalCode || !fetchedAddress;
    if (step === 'terms') return !termsAccepted;
    return false;
  }, [step, service, bookingMode, postalCode, postalStatus, fetchedAddress, selectedHKPricing, selectedSubcategoryKey, subtype, propertyType, selectedPricing, selectedDate, slot, name, phone, termsAccepted]);

  // ─── Submit helpers ───────────────────────────────────────────────────────

  const initPayment = async () => {
    if (isSubmitting.current) return;
    if (!validateContact()) return;
    isSubmitting.current = true;
    setLoadingPayment(true);

    try {
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 30);

      const fullAddress = [fetchedAddress, unitNumber ? `#${unitNumber}` : '', `Singapore ${postalCode}`]
        .filter(Boolean).join(', ');

      // GST math (mirror booking-web page.tsx:230-236). Prices in DB / totalPrice are ex-GST.
      // Stripe MUST be charged the tax-inclusive amount, or the customer under-pays by 9%.
      const effectiveFinal = Number.isFinite(finalPrice) && finalPrice > 0 ? finalPrice : totalPrice;
      const gstRate = 9;
      const gstAmount = Math.round(effectiveFinal * 0.09 * 100) / 100;
      const totalWithGst = effectiveFinal + gstAmount;
      const amountCents = Math.round(totalWithGst * 100);

      const newBooking = {
        Title: fullAddress,
        Name: name,
        Email: email,
        Whatsapp_Number: phone,
        Start_Date: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null,
        End_Date: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null,
        Start_Time: convertTo24Hour(slot?.start),
        End_Time: convertTo24Hour(slot?.end),
        Start_Time_Display: slot?.start,
        End_Time_Display: slot?.end,
        Service_Type: serviceDbName,
        // Pass the chosen subtype (e.g., "Post-Renovation") so downstream
        // WhatsApp templates and dashboard summaries show the specific
        // service instead of the generic Service_Type.
        service_subtype: subtype || null,
        calendar_id: calendarId,
        Unit_type: propertyType === 'hdb' ? 'HDB' : propertyType === 'landed' ? 'Landed' : propertyType === 'commercial' ? 'Commercial' : 'Condo/APT',
        Unit_sub_type: selectedHKPricing ? selectedHKPricing.label : selectedPricing?.unit_label,
        duration: selectedHKPricing
          ? `${selectedHKPricing.hours} hrs`
          : selectedPricing?.duration_hours ? `${selectedPricing.duration_hours} hrs` : null,
        Extra_Service: [
          ...Object.values(selectedAddons).map(a => a.unit_label),
          ...Object.values(selectedAddonServices).map(r => r.subcategory_label || r.unit_label),
          ...Array.from(selectedAdditionalServices)
            .map((id) => additionalServiceRows.find((r) => r.id === id)?.name)
            .filter((n): n is string => typeof n === 'string' && n.length > 0),
          ...(bundleUpholsteryPieces > 0 ? [`Upholstery Bundle (${bundleUpholsteryPieces} pcs) — $${bundleUpholsteryPrice}`] : []),
          ...(bundleCurtainSteam ? [`Curtain Steam Bundle — $${bundleCurtainSteamPrice}`] : []),
          ...(upholsteryLShape ? [`L-Shape Sofa Upcharge — $${UPHOLSTERY_LSHAPE_PRICE}`] : []),
          ...(upholsteryAddonCurtainSteam ? [`Curtain Steam Add-on — $${UPHOLSTERY_ADDON_CURTAIN_STEAM_PRICE}`] : []),
          ...(upholsteryAddonDisinfect ? [`Disinfectant Misting Add-on — $${UPHOLSTERY_ADDON_DISINFECT_PRICE}`] : []),
          ...(highCeilingAddon === '4_5m' ? ['High Ceiling (4-5m) — $100'] : []),
          ...(coatingScrubbingRow ? [`Coating Scrubbing — $${effectivePrice(coatingScrubbingRow)}`] : []),
          ...(springHipSqftBand ? [`Size Band: ${springHipSqftBand}`] : []),
          ...(tenancyMoveType ? [`Move Type: ${tenancyMoveType === 'move_in' ? 'Move-In' : 'Move-Out'}`] : []),
          ...(service === 'blinds' ? pricingRows
            .filter(r => r.category === 'blinds' && (blindsQuantities[r.id] ?? 0) > 0)
            .map(r => `${r.unit_label} × ${blindsQuantities[r.id]} — $${(blindsQuantities[r.id] ?? 0) * (r.partner_price ?? r.price ?? 0)}`)
            : []),
        ],
        Note: [
          notes,
          appliedPromo?.code ? `Promo: ${appliedPromo.code}` : null,
          service === 'blinds' && blindsCount > 0 ? `Blinds: ${blindsCount} piece${blindsCount === 1 ? '' : 's'} — $${blindsTotal}` : null,
        ].filter(Boolean).join(' | ') || null,
        // End-of-month partners get an auto-confirmed, invoice-tagged event
        // and skip the Stripe checkout step entirely.
        status: user?.company_payment_terms === 'end_of_month' ? 'confirmed' : 'pending',
        payment_status: user?.company_payment_terms === 'end_of_month' ? 'invoice' : 'unpaid',
        lifecycle_state: 'active',
        source: user?.company_code || 'AGT',
        owned_by_third_party: user?.id,
        partner_company_id: user?.company_id ?? null,
        Assign_Cleaner: [],
        Price: totalPrice,
        final_price: effectiveFinal,
        tax_treatment: 'exclusive',
        gst_rate: gstRate,
        gst_amount: gstAmount,
        amount_cents: amountCents,
        webhook_processed: false,
        booking_expires_at: expiresAt.toISOString(),
      };

      // Route the insert through the server so partner_company_id,
      // owned_by_third_party, Price, and payment_status can't be tampered
      // via DevTools/client bundle. The server re-derives them from the
      // JWT + partner_user + partner_companies rows.
      //
      // Idempotency key: same UUID for the whole click → the server
      // returns the ORIGINAL booking on retry instead of inserting a
      // duplicate. `isSubmitting.current` prevents in-flight double-click
      // but doesn't protect against network retries / page refresh
      // reloading a cached POST — this does.
      const idempotencyKey =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const submitRes = await fetch('/api/bookings/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(newBooking),
      });
      const submitRaw = await submitRes.text();
      let submitData: any = {};
      try { submitData = submitRaw ? JSON.parse(submitRaw) : {}; }
      catch { throw new Error(`Booking submit failed (${submitRes.status}).`); }
      if (!submitRes.ok || !submitData.booking) {
        throw new Error(submitData.error || `Failed to create booking (status ${submitRes.status}).`);
      }
      const bData = submitData.booking as { id: string; Ref_ID?: string };
      const serverAmountCents: number = submitData.amount_cents ?? amountCents;

      // End-of-month partners: server returns requiresPayment=false and
      // marks the booking confirmed+invoice. Skip Stripe.
      if (submitData.requiresPayment === false) {
        setCurrentBookingId(bData.id);
        setCurrentRefId(bData.Ref_ID ?? null);
        router.replace(
          `/dashboard/booking/success?id=${bData.id}&ref=${bData.Ref_ID ?? ''}&invoice=1`
        );
        return;
      }

      const res = await fetch('/api/checkout/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Charge the tax-inclusive amount — DB prices are ex-GST.
          // Server-side create-intent will still refetch the true amount
          // from the events row, so this value is just a hint.
          amount_cents: serverAmountCents,
          bookingId: bData.id,
          customerEmail: email,
        }),
      });
      // Defensive JSON parsing — endpoint may return empty body on 5xx or auth failure.
      const raw = await res.text();
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; }
      catch { throw new Error(`Payment init failed (${res.status}). Please try again.`); }
      if (!res.ok || !data.client_secret) {
        throw new Error(data.error || `Failed to initialize payment (status ${res.status}).`);
      }

      setClientSecret(data.client_secret);
      setCurrentBookingId(bData.id);
      setCurrentRefId(bData.Ref_ID ?? null);
      setStep('confirm');
    } catch (err: any) {
      alert(err.message || 'Something went wrong. Please try again.');
    } finally {
      isSubmitting.current = false;
      setLoadingPayment(false);
    }
  };

  const handleInquirySubmit = async () => {
    if (!validateContact()) return;
    setSubmitting(true);
    try {
      const fullAddress = [fetchedAddress, unitNumber ? `#${unitNumber}` : '', `Singapore ${postalCode}`]
        .filter(Boolean).join(', ');

      const res = await fetch('/api/bookings/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerInfo: { name, phone, email, address: fullAddress },
          serviceInfo: {
            service, date: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null,
            slot, subtype, propertyType,
            pricing: selectedPricing, addons: selectedAddons, totalPrice,
          },
          inquiryType: isOverbook ? 'OVERBOOK_ATTEMPT' : 'SPECIALIZED_SERVICE',
          notes,
        }),
      });
      if (!res.ok) throw new Error('Failed to send inquiry');
      alert(isOverbook
        ? 'Waitlist request sent! Admin will confirm if a slot opens.'
        : 'Inquiry sent! Our admin will contact you shortly with a quote.');
      router.push('/dashboard');
    } catch {
      alert('Failed to submit inquiry. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChatInquiryInit = async () => {
    if (!validateContact()) return;
    setSubmitting(true);
    try {
      const fullAddress = [fetchedAddress, unitNumber ? `#${unitNumber}` : '', `Singapore ${postalCode}`]
        .filter(Boolean).join(', ');

      // Route through the server so Price/status/source/owned_by_third_party
      // /partner_company_id can't be tampered from the browser bundle.
      const res = await fetch('/api/bookings/inquiry-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Title: `[INQUIRY] ${fullAddress}`,
          Name: name,
          Email: email,
          Whatsapp_Number: phone,
          Start_Date: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null,
          Service_Type: serviceDbName,
          Note: `Inquiry. ${notes}`,
        }),
      });
      const raw = await res.text();
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { /* keep empty */ }
      if (!res.ok || !data.id) {
        throw new Error(data.error || `Failed to initialize chat (status ${res.status}).`);
      }

      setCurrentBookingId(data.id);
      setStep('chat');
    } catch (err: any) {
      alert('Failed to initialize chat: ' + (err?.message ?? 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (step === 'terms') {
      if (isChatInquiry) { handleChatInquiryInit(); return; }
      if (isOverbook) { handleInquirySubmit(); return; }
      initPayment();
      return;
    }
    const next = STEP_ORDER[stepIndex + 1];
    if (next) setStep(next);
  };

  const handleClear = () => {
    setService(null); setBookingMode(null);
    setSelectedDate(undefined); setSlot(null); setAvailability({});
    setSubtype(''); setSelectedSubcategoryKey('');
    setPropertyType(null); setSelectedPricing(null); setSelectedHKPricing(null);
    setSelectedAddons({}); setSelectedAddonServices({}); setSelectedAdditionalServices(new Set());
    setBlindsQuantities({});
    setPricingRows([]); setAddonRows([]); setAddonServiceRows([]); setAdditionalServiceRows([]);
    setPostalCode(''); setFetchedAddress(''); setUnitNumber(''); setPostalStatus('idle');
    setName(''); setPhone(''); setEmail(''); setNotes('');
    setTermsAccepted(false); setAppliedPromo(null); setFinalPrice(0);
    setContactErrors({}); setClientSecret(null); setCurrentBookingId(null);
    isSubmitting.current = false;
    bookingStore.reset();
    setStep('service');
  };

  // ─── Background payment watcher ───────────────────────────────────────────

  useEffect(() => {
    if (step !== 'confirm' || !currentBookingId) return;
    let id: ReturnType<typeof setInterval>;
    const check = async () => {
      try {
        const res = await fetch(`/api/bookings/status?id=${currentBookingId}`);
        const raw = await res.text();
        const data = raw ? JSON.parse(raw) : {};
        if (data.status === 'confirmed') {
          clearInterval(id);
          bookingStore.reset();
          router.push(`/dashboard/booking/success?id=${currentBookingId}&ref=${currentRefId}&redirect_status=succeeded`);
        }
      } catch {}
    };
    id = setInterval(check, 3000);
    return () => clearInterval(id);
  }, [step, currentBookingId, currentRefId, router]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const superStep = getSuperStep(step);

  return (
    <div className="min-h-screen bg-[#f8fafc] -mt-4 sm:-mt-6 pb-32 lg:pb-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 pb-3 space-y-2 lg:space-y-3">

        {/* ── 5-step tracker ── */}
        <nav className="rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm px-3 lg:px-6 py-2 lg:py-2">
          {/* Compact tracker (mobile) — dots + active label */}
          <div className="flex items-center gap-2 lg:hidden">
            {SUPER_STEPS.map((s, idx) => {
              const isDone = s.key < superStep;
              const isActive = s.key === superStep;
              return (
                <Fragment key={s.key}>
                  <div
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors shrink-0',
                      isActive
                        ? 'bg-emerald-600 text-white ring-2 ring-emerald-100'
                        : isDone
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-400'
                    )}
                  >
                    {isDone ? <CheckCircle2 className="w-3 h-3" /> : s.key}
                  </div>
                  {idx < SUPER_STEPS.length - 1 && (
                    <div className={cn('flex-1 h-px min-w-[6px]', s.key < superStep ? 'bg-emerald-500' : 'bg-slate-200')} />
                  )}
                </Fragment>
              );
            })}
            <span className="ml-2 text-xs font-semibold text-slate-900 whitespace-nowrap shrink-0">
              {SUPER_STEPS[superStep - 1]?.label}
            </span>
          </div>

          {/* Full tracker (desktop) */}
          <ol className="hidden lg:flex items-center gap-2 lg:gap-4 min-w-max overflow-x-auto">
            {SUPER_STEPS.map((s, idx) => {
              const isDone = s.key < superStep;
              const isActive = s.key === superStep;
              return (
                <Fragment key={s.key}>
                  <li className="flex items-center gap-2 shrink-0">
                    <div
                      className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                        isActive
                          ? 'bg-emerald-600 text-white ring-4 ring-emerald-100'
                          : isDone
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-400'
                      )}
                    >
                      {isDone ? <CheckCircle2 className="w-4 h-4" /> : s.key}
                    </div>
                    <span
                      className={cn(
                        'text-sm font-semibold whitespace-nowrap',
                        isActive ? 'text-slate-900' : isDone ? 'text-slate-700' : 'text-slate-400'
                      )}
                    >
                      {s.label}
                    </span>
                  </li>
                  {idx < SUPER_STEPS.length - 1 && (
                    <div className={cn('flex-1 min-w-[16px] h-px', s.key < superStep ? 'bg-emerald-500' : 'bg-slate-200')} />
                  )}
                </Fragment>
              );
            })}
          </ol>
        </nav>

        <div className="lg:grid lg:grid-cols-12 lg:gap-8 lg:items-start">

          {/* ── LEFT: Wizard pane ── */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-4">
            <div className="bg-white rounded-3xl ring-1 ring-slate-100 shadow-sm overflow-hidden flex flex-col">

              {/* Content header */}
              <div className="flex items-start justify-between gap-4 px-5 lg:px-6 pt-4 lg:pt-5 pb-3">
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    onClick={goBack}
                    className="w-9 h-9 mt-0.5 rounded-xl bg-white ring-1 ring-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors shrink-0"
                    aria-label="Back"
                  >
                    <ChevronLeft className="w-5 h-5 text-slate-700" />
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-xl lg:text-2xl font-extrabold text-slate-900 tracking-tight">
                      {stepTitle(step)}
                    </h2>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {stepSubtitle(step)}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-[11px] font-bold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-100 px-3 py-1.5 rounded-full uppercase tracking-widest">
                  Step {superStep} of {SUPER_STEPS.length}
                </span>
              </div>

              {/* progress accent */}
              <div className="mx-6 lg:mx-8 h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
              </div>

              {/* Step content */}
              <div className="p-5 lg:p-6 flex-grow flex flex-col space-y-3">

                {/* SERVICE */}
                {step === 'service' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {SERVICES.map((s) => {
                        const Icon = s.icon;
                        const meta = SERVICE_META[s.key] ?? { iconBg: 'bg-slate-50', iconText: 'text-slate-600', description: '' };
                        const isSelected = service === s.key;
                        return (
                          <button
                            key={s.key}
                            onClick={() => {
                              const isHKOrOffice = s.key === 'housekeeping' || s.key === 'office';
                              setService(s.key);
                              setBookingMode(isHKOrOffice ? null : 'deep');
                              setSubtype(''); setSelectedSubcategoryKey('');
                              setPropertyType(null); setSelectedPricing(null);
                              setSelectedHKPricing(null); setSelectedAddons({});
                              if (isHKOrOffice) {
                                setStep('type_selection');
                              } else if (['scrubbing_machine','formaldehyde_removal','coating','disinfection'].includes(s.key)) {
                                setStep('size');
                              } else {
                                setStep('subtype');
                              }
                            }}
                            className={cn(
                              'group relative flex items-start gap-4 p-5 bg-white rounded-2xl ring-1 shadow-sm transition-all text-left hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]',
                              isSelected
                                ? 'ring-2 ring-emerald-500 shadow-lg shadow-emerald-500/10 bg-emerald-50/30'
                                : 'ring-slate-100 hover:ring-emerald-300'
                            )}
                          >
                            <div className={cn('w-12 h-12 flex items-center justify-center rounded-xl shrink-0', meta.iconBg, meta.iconText)}>
                              <Icon className="w-6 h-6" strokeWidth={1.75} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-base font-bold text-slate-900 leading-tight">{s.label}</p>
                              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-1">{s.sub}</p>
                              <p className="text-xs text-slate-500 leading-relaxed mt-2">{meta.description}</p>
                              {isSelected && (
                                <span className="mt-3 inline-flex items-center gap-1 text-emerald-600 text-xs font-bold">
                                  Select Service <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                              )}
                            </div>
                            {isSelected ? (
                              <span className="absolute top-4 right-4 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                                <CheckCircle2 className="w-4 h-4 text-white" />
                              </span>
                            ) : (
                              <ChevronRight className="w-5 h-5 text-slate-300 self-center shrink-0 group-hover:text-emerald-500 transition-colors" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Help card */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-2xl bg-emerald-50/60 ring-1 ring-emerald-100">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-full bg-white ring-1 ring-emerald-100 flex items-center justify-center shrink-0">
                          <Info className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">Not sure which service is right for you?</p>
                          <p className="text-xs text-slate-500 mt-0.5">Contact our team and we&apos;ll help you choose the best option.</p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 shrink-0"
                        onClick={() => window.open('https://wa.me/6588656751', '_blank', 'noopener,noreferrer')}
                      >
                        <Send className="w-4 h-4" />
                        Chat with Us
                      </Button>
                    </div>
                  </div>
                )}

                {/* TYPE SELECTION */}
                {step === 'type_selection' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <button
                      onClick={() => { setBookingMode('general'); setSubtype('General'); setStep('hk_postal'); }}
                      className={cn('group flex flex-col items-start p-6 bg-white rounded-3xl border-2 transition-all hover:shadow-xl active:scale-95 text-left', bookingMode === 'general' ? 'border-emerald-500' : 'border-slate-100')}
                    >
                      <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Clock className="w-6 h-6 text-emerald-600" />
                      </div>
                      <p className="text-base font-black text-slate-900 mb-1">General Cleaning</p>
                      <p className="text-xs text-slate-500 leading-relaxed mb-3">Standard maintenance. Billed per hour. Flexible arrival windows.</p>
                      <span className="text-emerald-600 font-black text-[10px] uppercase tracking-widest flex items-center gap-1">
                        Select hourly <ChevronRight className="w-3 h-3" />
                      </span>
                    </button>
                    <button
                      onClick={() => { setBookingMode('deep'); setSubtype(''); setStep('subtype'); }}
                      className={cn('group flex flex-col items-start p-6 bg-white rounded-3xl border-2 transition-all hover:shadow-xl active:scale-95 text-left', bookingMode === 'deep' ? 'border-orange-500' : 'border-slate-100')}
                    >
                      <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Sparkles className="w-6 h-6 text-orange-600" />
                      </div>
                      <p className="text-base font-black text-slate-900 mb-1">Deep Cleaning</p>
                      <p className="text-xs text-slate-500 leading-relaxed mb-3">Tenancy, reno, or spring clean. Fixed pricing per unit type.</p>
                      <span className="text-orange-600 font-black text-[10px] uppercase tracking-widest flex items-center gap-1">
                        View pricing <ChevronRight className="w-3 h-3" />
                      </span>
                    </button>
                  </div>
                )}

                {/* HK POSTAL */}
                {step === 'hk_postal' && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">
                    <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-black text-emerald-900">Where is the client&apos;s unit?</p>
                        <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">
                          Enter the postal code to check slot availability in the area.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Postal Code *</p>
                      <div className="relative">
                        <MapPin className={cn('absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5',
                          postalStatus === 'valid' ? 'text-emerald-500' : postalStatus === 'invalid' ? 'text-red-400' : 'text-slate-400'
                        )} />
                        {loadingAddress && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-slate-400" />
                        )}
                        <Input
                          placeholder="e.g. 560123"
                          value={postalCode}
                          onChange={e => handlePostalChange(e.target.value)}
                          maxLength={6}
                          className="pl-8"
                        />
                      </div>
                      {postalStatus === 'valid' && (
                        <p className="text-[9px] text-emerald-600 font-bold ml-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> In our service area
                        </p>
                      )}
                      {postalStatus === 'invalid' && (
                        <p className="text-[9px] text-red-500 font-bold ml-1">Outside our service area — please contact admin.</p>
                      )}
                    </div>
                    {fetchedAddress && (
                      <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-1">
                        <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Service Address</p>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-black text-emerald-900">{fetchedAddress}</p>
                            <p className="text-[10px] text-emerald-600 mt-0.5">Singapore {postalCode}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="pt-2">
                      <Button
                        onClick={handleNext}
                        disabled={isNextDisabled}
                        className="w-full h-12 rounded-2xl font-black text-sm bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 transition-all active:scale-95"
                      >
                        <span className="flex items-center gap-2">Continue <ChevronRight className="w-4 h-4" /></span>
                      </Button>
                    </div>
                  </div>
                )}

                {/* DURATION */}
                {step === 'duration' && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-5">
                    {loadingPricing ? (
                      <div className="py-20 flex flex-col items-center opacity-30">
                        <Loader2 className="w-6 h-6 animate-spin text-emerald-500 mb-2" />
                        <p className="text-xs font-bold">Loading rates...</p>
                      </div>
                    ) : (
                      <>
                        {/* 1× Session */}
                        {(() => {
                          const oneX = hkPricingRows.filter(r => !r.label.toLowerCase().includes('4x'));
                          if (oneX.length === 0) return null;
                          return (
                            <div>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">1× Session</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {oneX.map((r) => (
                                  <button
                                    key={r.label}
                                    onClick={() => { setSelectedHKPricing(r); setStep('datetime'); }}
                                    className={cn('relative flex flex-col p-5 bg-white rounded-2xl border-2 transition-all hover:border-emerald-400 hover:shadow-xl active:scale-95 text-left overflow-hidden',
                                      selectedHKPricing?.label === r.label ? 'border-emerald-600 bg-emerald-50' : 'border-slate-100'
                                    )}
                                  >
                                    {r.hours === cheapestHKHours && (
                                      <div className="absolute top-0 left-0">
                                        <div className={cn('text-white text-[8px] font-black px-2 py-0.5 uppercase tracking-wider rounded-br-lg',
                                          selectedHKPricing?.label === r.label ? 'bg-emerald-400' : 'bg-emerald-600'
                                        )}>★ Most Popular</div>
                                      </div>
                                    )}
                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px] font-black mb-2 w-fit mt-3">
                                      <span className="font-black">{r.hours}</span> hrs
                                    </Badge>
                                    <p className="text-sm font-black text-slate-900 mb-1">{r.label}</p>
                                    <p className="text-xl font-black text-emerald-600">S${r.price}</p>
                                    {selectedHKPricing?.label === r.label && (
                                      <div className="absolute top-3 right-3 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                                        <CheckCircle2 className="w-3 h-3 text-white" />
                                      </div>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* 4× Package */}
                        {(() => {
                          const fourX = hkPricingRows.filter(r => r.label.toLowerCase().includes('4x'));
                          return (
                            <div>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">4× Sessions Package</p>
                              {fourX.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {fourX.map((r) => (
                                    <button
                                      key={r.label}
                                      onClick={() => { setSelectedHKPricing(r); setStep('datetime'); }}
                                      className={cn('relative flex flex-col p-5 bg-white rounded-2xl border-2 transition-all hover:border-emerald-400 hover:shadow-xl active:scale-95 text-left overflow-hidden',
                                        selectedHKPricing?.label === r.label ? 'border-emerald-600 bg-emerald-50' : 'border-slate-100'
                                      )}
                                    >
                                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100 text-[10px] font-black mb-2 w-fit">
                                        <span className="font-black">{r.hours}</span> hrs × 4 visits
                                      </Badge>
                                      <p className="text-sm font-black text-slate-900 mb-1">{r.label}</p>
                                      <p className="text-xl font-black text-emerald-600">S${r.price}</p>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-2xl border-2 border-blue-100">
                                  <div>
                                    <p className="text-sm font-black text-slate-900">Package pricing available</p>
                                    <p className="text-xs text-slate-500 mt-0.5">Contact admin for 4-session rates</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                )}

                {/* SUBTYPE */}
                {step === 'subtype' && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {loadingPricing ? (
                      <div className="py-20 flex flex-col items-center opacity-30">
                        <Loader2 className="w-6 h-6 animate-spin text-emerald-500 mb-2" />
                        <p className="text-xs font-bold">Loading options...</p>
                      </div>
                    ) : subcategoryOptions.length === 0 ? (
                      <div className="py-20 text-center opacity-40">
                        <p className="text-sm font-bold text-slate-500">No cleaning types available yet.</p>
                        <p className="text-xs text-slate-400 mt-1">Please contact admin directly.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {subcategoryOptions.map((opt) => {
                            const SUBTYPE_DESC: Record<string, string> = {
                              tenancy:    'For move-in or move-out cleans. Restores the property to a pristine, handover-ready condition — kitchens, bathrooms, cabinets, and all fixtures.',
                              renovation: 'Post-renovation deep clean to remove construction dust, paint residue, and debris. Prepares the space for move-in after a renovation or ID fit-out.',
                              spring:     'A comprehensive whole-home refresh — ideal before Chinese New Year, Hari Raya, or any major occasion. Covers fans, grilles, windows, and hard-to-reach areas.',
                              hip:        'Specialised cleaning for HDB units undergoing HIP (Home Improvement Programme) works. Tackles dust, cement residue, and debris left by renovation contractors.',
                            };
                            const desc = SUBTYPE_DESC[opt.key];
                            const isSelected = selectedSubcategoryKey === opt.key;
                            const isHot = (opt.key === 'tenancy' || opt.key === 'renovation') && service === 'deep_cleaning';
                            return (
                              <button
                                key={opt.key}
                                onClick={() => {
                                  setSubtype(opt.label);
                                  setSelectedSubcategoryKey(opt.key);
                                  setSelectedPricing(null);
                                  setStep(STEP_ORDER[STEP_ORDER.indexOf('subtype') + 1]);
                                }}
                                className={cn(
                                  'p-5 rounded-2xl border-2 text-left transition-all active:scale-95 hover:border-emerald-200 hover:shadow-md relative overflow-hidden',
                                  isSelected
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg'
                                    : isHot
                                      ? 'bg-orange-50 border-orange-200 hover:border-orange-300'
                                      : 'bg-white border-slate-100'
                                )}
                              >
                                {isHot && (
                                  <div className="absolute top-0 right-0">
                                    <div className={cn(
                                      'text-white text-[8px] font-black px-2 py-0.5 uppercase tracking-wider rounded-bl-lg',
                                      isSelected ? 'bg-orange-400' : 'bg-orange-500'
                                    )}>
                                      🔥 Hot
                                    </div>
                                  </div>
                                )}
                                <p className={cn('text-sm font-bold', isSelected ? 'text-white' : 'text-slate-900')}>
                                  {opt.label}
                                </p>
                                {desc && (
                                  <p className={cn('text-[11px] mt-1 leading-relaxed', isSelected ? 'text-emerald-100' : 'text-slate-500')}>
                                    {desc}
                                  </p>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <a
                          href={`https://wa.me/6588656751?text=${encodeURIComponent(`Hi Doctor Clean! I'd like to enquire about ${serviceLabel} cleaning that's not listed on the partner portal.`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-4 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50 transition-all"
                        >
                          <div>
                            <p className="text-sm font-bold text-slate-600">Not seeing what you need?</p>
                            <p className="text-xs text-slate-400 mt-0.5">Contact admin for a custom quote</p>
                          </div>
                          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1 flex-shrink-0 ml-3">
                            Contact Admin <ChevronRight className="w-3 h-3" />
                          </span>
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* PROPERTY */}
                {step === 'property' && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-3">
                    {/* Move-In / Move-Out selector — tenancy only (must pick before property type) */}
                    {selectedSubcategoryKey === 'tenancy' && (
                      <div className="space-y-2 mb-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Type of Tenancy Clean</p>
                        <div className="grid grid-cols-2 gap-3">
                          {([
                            { value: 'move_in'  as const, label: 'Move In',  desc: 'Includes disinfectant misting', icon: '🏠' },
                            { value: 'move_out' as const, label: 'Move Out', desc: 'Standard tenancy clean',        icon: '📦' },
                          ] as const).map(({ value, label, desc, icon }) => {
                            const isActive = tenancyMoveType === value;
                            return (
                              <button
                                key={value}
                                onClick={() => setTenancyMoveType(value)}
                                className={cn(
                                  'p-4 flex flex-col items-center gap-1.5 rounded-2xl border-2 transition-all active:scale-95 text-center',
                                  isActive
                                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-xl'
                                    : 'bg-white border-slate-100 hover:border-emerald-200 hover:shadow-md'
                                )}
                              >
                                <span className="text-2xl">{icon}</span>
                                <p className={cn('text-sm font-black', isActive ? 'text-white' : 'text-slate-900')}>{label}</p>
                                <p className={cn('text-[10px]', isActive ? 'text-emerald-100' : 'text-slate-400')}>{desc}</p>
                                {isActive && <CheckCircle2 className="w-4 h-4 text-white" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {(['hdb', 'condo'] as const).map(pt => (
                      <button
                        key={pt}
                        onClick={() => {
                          setPropertyType(pt);
                          setSelectedPricing(null);
                          setStep(STEP_ORDER[STEP_ORDER.indexOf('property') + 1]);
                        }}
                        className={cn(
                          'w-full p-4 flex items-center gap-4 rounded-2xl border-2 transition-all active:scale-95 text-left',
                          propertyType === pt
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xl'
                            : 'bg-white border-slate-100 hover:border-emerald-200 hover:shadow-md'
                        )}
                      >
                        <span className="text-3xl flex-shrink-0">{pt === 'hdb' ? '🏢' : '🏙️'}</span>
                        <div>
                          <p className={cn('text-sm font-black', propertyType === pt ? 'text-white' : 'text-slate-900')}>
                            {pt === 'hdb' ? 'HDB Flat' : 'Condo / Apartment'}
                          </p>
                          <p className={cn('text-[10px] font-medium mt-0.5', propertyType === pt ? 'text-emerald-100' : 'text-slate-400')}>
                            {pt === 'hdb'
                              ? '1-Room · 2-Room · 3-Room · 4-Room · 5-Room · Executive'
                              : 'Studio · 1BR · 2BR · 3BR · 4BR · Penthouse'}
                          </p>
                        </div>
                        {propertyType === pt && <CheckCircle2 className="w-5 h-5 text-white ml-auto flex-shrink-0" />}
                      </button>
                    ))}
                    <button
                      onClick={() => { setPropertyType('landed'); setIsChatInquiry(true); setStep('contact'); }}
                      className="w-full p-4 flex items-center gap-4 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 hover:bg-amber-100 transition-all"
                    >
                      <span className="text-3xl flex-shrink-0">🏡</span>
                      <div>
                        <p className="text-sm font-black text-amber-900">Landed Property</p>
                        <p className="text-[10px] font-medium text-amber-700 mt-0.5">Requires admin quote — proceed to contact</p>
                      </div>
                      <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-1 ml-auto flex-shrink-0">
                        Contact Admin <ChevronRight className="w-3 h-3" />
                      </span>
                    </button>
                    {service === 'window_cleaning' && (
                      <button
                        onClick={() => {
                          setPropertyType('commercial');
                          setSelectedPricing(null);
                          setStep(STEP_ORDER[STEP_ORDER.indexOf('property') + 1]);
                        }}
                        className={cn(
                          'w-full p-4 flex items-center gap-4 rounded-2xl border-2 transition-all active:scale-95 text-left',
                          propertyType === 'commercial'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xl'
                            : 'bg-white border-slate-100 hover:border-emerald-200 hover:shadow-md'
                        )}
                      >
                        <span className="text-3xl flex-shrink-0">🏢</span>
                        <div>
                          <p className={cn('text-sm font-black', propertyType === 'commercial' ? 'text-white' : 'text-slate-900')}>
                            Commercial Property
                          </p>
                          <p className={cn('text-[10px] font-medium mt-0.5', propertyType === 'commercial' ? 'text-emerald-100' : 'text-slate-400')}>
                            Office · Retail · F&B · Warehouse
                          </p>
                        </div>
                        {propertyType === 'commercial' && <CheckCircle2 className="w-5 h-5 text-white ml-auto flex-shrink-0" />}
                      </button>
                    )}
                  </div>
                )}

                {/* SIZE */}
                {step === 'size' && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {loadingPricing ? (
                      <div className="py-20 flex flex-col items-center opacity-30">
                        <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-3" />
                        <p className="text-xs font-bold">Loading rates...</p>
                      </div>
                    ) : service === 'blinds' ? (
                      <div className="space-y-3">
                        <p className="text-[11px] text-slate-500">Enter the quantity for each blind type. Total updates automatically.</p>
                        {filteredSizeRows.map((row) => {
                          const qty = blindsQuantities[row.id] ?? 0;
                          const unitPrice = row.partner_price ?? row.price ?? 0;
                          const lineTotal = qty * unitPrice;
                          return (
                            <div key={row.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border-2 border-slate-100">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-black text-slate-900">{row.unit_label}</p>
                                <p className="text-[11px] text-slate-500 mt-0.5">S${unitPrice} each</p>
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <div className="flex items-center gap-2 bg-slate-50 rounded-full p-1">
                                  <button
                                    type="button"
                                    onClick={() => setBlindsQuantities(prev => ({ ...prev, [row.id]: Math.max(0, (prev[row.id] ?? 0) - 1) }))}
                                    className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 active:scale-95 disabled:opacity-30"
                                    disabled={qty === 0}
                                    aria-label="decrease"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="w-6 text-center text-sm font-black">{qty}</span>
                                  <button
                                    type="button"
                                    onClick={() => setBlindsQuantities(prev => ({ ...prev, [row.id]: (prev[row.id] ?? 0) + 1 }))}
                                    className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 active:scale-95"
                                    aria-label="increase"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="w-16 text-right">
                                  <p className={cn('text-sm font-black', qty > 0 ? 'text-emerald-600' : 'text-slate-300')}>
                                    S${lineTotal}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {blindsCount > 0 && (
                          <div className="mt-4 p-4 bg-emerald-50 rounded-2xl border-2 border-emerald-200 flex items-center justify-between">
                            <div>
                              <p className="text-[11px] font-black text-emerald-700 uppercase tracking-widest">Blinds Subtotal</p>
                              <p className="text-[11px] text-emerald-600 mt-0.5">{blindsCount} piece{blindsCount === 1 ? '' : 's'}</p>
                            </div>
                            <p className="text-2xl font-black text-emerald-700">S${blindsTotal}</p>
                          </div>
                        )}
                        <p className="text-[10px] text-slate-400 pt-2">
                          Note: Roman Blinds need to be steamed — minimum charge of 4 pieces per booking.
                        </p>
                      </div>
                    ) : filteredSizeRows.length === 0 ? (
                      <div className="py-16 text-center space-y-2 opacity-50">
                        <p className="text-sm font-bold text-slate-600">No fixed-price packages for this combination.</p>
                        <p className="text-xs text-slate-400">Admin will provide a custom quote after booking.</p>
                        <Button onClick={() => setStep(STEP_ORDER[STEP_ORDER.indexOf('size') + 1])} className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl">
                          Continue with Custom Quote
                        </Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {filteredSizeRows.map((row, idx) => {
                          const prevRow = filteredSizeRows[idx - 1];
                          const currLabel = row.subcategory_label || row.subcategory;
                          const prevLabel = prevRow ? (prevRow.subcategory_label || prevRow.subcategory) : undefined;
                          const showDivider = isStandaloneService && idx > 0 && currLabel !== prevLabel;
                          return (
                            <Fragment key={row.id}>
                              {showDivider && (
                                <div className="col-span-full flex items-center gap-2 pt-2">
                                  <div className="h-px flex-1 bg-slate-100" />
                                  {currLabel && <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{currLabel}</span>}
                                  <div className="h-px flex-1 bg-slate-100" />
                                </div>
                              )}
                              {(() => {
                                const hasPartnerDiscount = row.partner_price !== null && row.price !== null && row.partner_price < row.price;
                                return (
                              <button
                                onClick={() => { setSelectedPricing(row); setStep(STEP_ORDER[STEP_ORDER.indexOf('size') + 1]); }}
                                className={cn(
                                  'p-4 rounded-xl border-2 text-left transition-all active:scale-[0.98] flex items-start justify-between gap-2 relative overflow-hidden',
                                  selectedPricing?.id === row.id
                                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg'
                                    : hasPartnerDiscount
                                      ? 'bg-orange-50 border-orange-200 hover:border-orange-300'
                                      : 'bg-white border-slate-100 hover:border-emerald-200'
                                )}
                              >
                                {row.id === cheapestSizeRowId && (
                                  <div className="absolute top-0 left-0">
                                    <div className={cn('text-white text-[8px] font-black px-2 py-0.5 uppercase tracking-wider rounded-br-lg',
                                      selectedPricing?.id === row.id ? 'bg-emerald-400' : 'bg-emerald-600'
                                    )}>★ Most Popular</div>
                                  </div>
                                )}
                                {hasPartnerDiscount && selectedPricing?.id !== row.id && (
                                  <div className="absolute top-0 right-0">
                                    <div className="bg-orange-500 text-white text-[8px] font-black px-2 py-0.5 uppercase tracking-wider rounded-bl-lg">ID PRICE</div>
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className={cn('text-[9px] font-black uppercase tracking-widest mb-1 opacity-70', selectedPricing?.id === row.id ? 'text-white' : 'text-slate-400')}>
                                    {subtype}
                                  </p>
                                  <p className={cn('text-xs font-bold leading-snug', selectedPricing?.id === row.id ? 'text-white' : 'text-slate-900')}>
                                    {row.unit_label}
                                  </p>
                                  {row.price_note && (
                                    <p className={cn('text-[9px] mt-1', selectedPricing?.id === row.id ? 'text-emerald-100' : 'text-slate-400')}>
                                      {row.price_note}
                                    </p>
                                  )}
                                </div>
                                <div className="flex-shrink-0 text-right pt-4">
                                  {hasPartnerDiscount ? (
                                    <div className="space-y-0.5">
                                      <p className={cn('text-[10px] line-through', selectedPricing?.id === row.id ? 'text-emerald-200' : 'text-slate-400')}>S${row.price}</p>
                                      <p className={cn('text-lg font-black tracking-tighter', selectedPricing?.id === row.id ? 'text-white' : 'text-orange-600')}>S${row.partner_price}</p>
                                    </div>
                                  ) : (row.partner_price ?? row.price) !== null ? (
                                    <p className="text-lg font-black tracking-tighter">S${row.partner_price ?? row.price}</p>
                                  ) : (
                                    <p className={cn('text-xs font-black', selectedPricing?.id === row.id ? 'text-emerald-100' : 'text-slate-400')}>Site Visit</p>
                                  )}
                                  {row.duration_hours && (
                                    <p className={cn('text-[9px]', selectedPricing?.id === row.id ? 'text-emerald-100' : 'text-slate-400')}>~{row.duration_hours}h</p>
                                  )}
                                </div>
                              </button>
                                );
                              })()}
                            </Fragment>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* DATETIME */}
                {step === 'datetime' && (() => {
                  const today          = startOfDay(new Date());
                  const maxDate        = addDays(today, 90);
                  const maxMonthOffset = differenceInCalendarMonths(maxDate, today);
                  const monthStart     = startOfMonth(addMonths(today, monthOffset));
                  const gridStart      = startOfWeek(monthStart, { weekStartsOn: 1 });
                  const gridDays       = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
                  const DAY_LABELS     = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

                  const parseHour = (start: string) => {
                    const [time, ampm] = start.split(' ');
                    let [h] = time.split(':').map(Number);
                    if (ampm === 'PM' && h !== 12) h += 12;
                    if (ampm === 'AM' && h === 12) h = 0;
                    return h;
                  };
                  const slotGroups = [
                    { label: 'Morning',   icon: '🌅', range: 'Before 12 PM', slots: getDisplaySlots.filter(s => parseHour(s.start) < 12) },
                    { label: 'Afternoon', icon: '☀️', range: '12 PM – 6 PM',  slots: getDisplaySlots.filter(s => { const h = parseHour(s.start); return h >= 12 && h < 18; }) },
                    { label: 'Evening',   icon: '🌙', range: '6 PM onwards',  slots: getDisplaySlots.filter(s => parseHour(s.start) >= 18) },
                  ].filter(g => g.slots.length > 0);

                  return (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
                    {/* Selected date display */}
                    <div className="flex items-center gap-3 px-1">
                      <CalendarIcon className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <p className="text-base font-black text-slate-900">
                        {selectedDate ? format(selectedDate, 'EEEE, d MMMM yyyy') : 'Pick a date below'}
                      </p>
                    </div>

                    {/* Full month calendar */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
                        <p className="text-sm font-black text-slate-800">{format(monthStart, 'MMMM yyyy')}</p>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setMonthOffset(m => m - 1)}
                            disabled={monthOffset === 0}
                            className={cn(
                              'w-8 h-8 rounded-xl flex items-center justify-center transition-all',
                              monthOffset === 0
                                ? 'bg-slate-50 text-slate-200 cursor-not-allowed'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-600 active:scale-95'
                            )}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setMonthOffset(m => m + 1)}
                            disabled={monthOffset >= maxMonthOffset}
                            className={cn(
                              'w-8 h-8 rounded-xl flex items-center justify-center transition-all',
                              monthOffset >= maxMonthOffset
                                ? 'bg-slate-50 text-slate-200 cursor-not-allowed'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-600 active:scale-95'
                            )}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="px-2 py-2 sm:px-4 sm:py-3">
                        <div className="grid grid-cols-7 mb-2">
                          {DAY_LABELS.map((d) => (
                            <div key={d} className="flex items-center justify-center py-1">
                              <span className={cn(
                                'text-[9px] font-black uppercase tracking-widest',
                                d === 'Sun' ? 'text-red-400' : 'text-slate-300'
                              )}>{d}</span>
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-y-1">
                          {gridDays.map((day) => {
                            const isCurrentMonth = day.getMonth() === monthStart.getMonth();
                            const isPast         = isBefore(day, today);
                            const isBeyond90     = isBefore(maxDate, day);
                            const isSelected     = selectedDate ? isSameDay(day, selectedDate) : false;
                            const isToday_       = isSameDay(day, today);
                            const isSun          = day.getDay() === 0;
                            const disabled       = isPast || isBeyond90 || !isCurrentMonth;

                            return (
                              <div key={day.toISOString()} className="flex items-center justify-center py-0.5">
                                <button
                                  disabled={disabled}
                                  onClick={() => {
                                    setSelectedDate(day);
                                    setSlot(null);
                                    if (service !== 'curtain' && service !== 'upholstery') setShowSlotPicker(true);
                                  }}
                                  className={cn(
                                    'relative w-9 h-9 sm:w-11 sm:h-11 rounded-full flex flex-col items-center justify-center transition-all text-sm font-bold leading-none',
                                    isSelected
                                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-400/30'
                                      : disabled
                                      ? 'text-slate-200 cursor-not-allowed'
                                      : isSun
                                      ? 'text-red-400 hover:bg-red-50 active:scale-95'
                                      : 'text-slate-800 hover:bg-emerald-50 hover:text-emerald-600 active:scale-95'
                                  )}
                                >
                                  {format(day, 'd')}
                                  {isToday_ && (
                                    <div className={cn(
                                      'absolute bottom-1 w-1 h-1 rounded-full',
                                      isSelected ? 'bg-white/70' : 'bg-emerald-600'
                                    )} />
                                  )}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Curtain/upholstery: no time slot */}
                    {(service === 'curtain' || service === 'upholstery') && selectedDate && (
                      <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3.5">
                        <span className="text-lg leading-none mt-0.5">💬</span>
                        <div>
                          <p className="text-xs font-black text-emerald-800">Arrival time confirmed via WhatsApp</p>
                          <p className="text-[11px] text-emerald-600 leading-relaxed mt-0.5">
                            Our team will reach out to confirm your preferred arrival window after you send your enquiry.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Selected slot display / prompt */}
                    {(service !== 'curtain' && service !== 'upholstery') && selectedDate && (
                      slot ? (
                        <button
                          onClick={() => setShowSlotPicker(true)}
                          className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border-2 border-emerald-500 bg-emerald-50 transition-all hover:bg-emerald-100 active:scale-[0.98]"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                            <div className="text-left">
                              <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Arrival Window</p>
                              <p className="text-sm font-black text-slate-900">{slot.label.replace(' Arrival', '').replace(/\s*\(.*?\)$/, '')}</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">Change</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => setShowSlotPicker(true)}
                          className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50 transition-all active:scale-[0.98]"
                        >
                          <div className="flex items-center gap-3">
                            <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            <p className="text-sm font-bold text-slate-500">Tap to choose an arrival time</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300" />
                        </button>
                      )
                    )}

                    {/* Arrival window popup */}
                    {showSlotPicker && selectedDate && service !== 'curtain' && service !== 'upholstery' && (
                      <div
                        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
                        style={{ touchAction: 'none' }}
                        onClick={() => setShowSlotPicker(false)}
                      >
                        <div
                          className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85vh] flex flex-col"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
                            <div className="w-10 h-1 rounded-full bg-slate-200" />
                          </div>
                          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
                            <div>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Select Arrival Window</p>
                              <p className="text-sm font-black text-slate-900">{format(selectedDate, 'EEEE, d MMMM yyyy')}</p>
                            </div>
                            <button
                              onClick={() => setShowSlotPicker(false)}
                              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors flex-shrink-0"
                            >
                              <X className="w-4 h-4 text-slate-500" />
                            </button>
                          </div>
                          <div className="overflow-y-auto flex-1 p-4 space-y-4" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 2rem))' }}>
                            {loadingAvail ? (
                              <div className="py-12 flex flex-col items-center gap-2 opacity-40">
                                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Checking availability…</p>
                              </div>
                            ) : slotGroups.length === 0 ? (
                              <div className="py-10 flex flex-col items-center gap-2 text-center">
                                <span className="text-3xl">📅</span>
                                <p className="text-sm font-black text-slate-700">No slots available</p>
                                <p className="text-xs text-slate-400 max-w-[220px]">All arrival windows are fully booked for this date. Please try another day.</p>
                              </div>
                            ) : (
                              slotGroups.map((group) => (
                                <div key={group.label}>
                                  <div className="flex items-center gap-2 mb-2 px-1">
                                    <span className="text-base leading-none">{group.icon}</span>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{group.label}</p>
                                    <span className="text-[9px] text-slate-300">·</span>
                                    <span className="text-[9px] text-slate-400">{group.range}</span>
                                  </div>
                                  <div className="grid gap-2">
                                    {group.slots.map((s) => {
                                      const avail = availability[s.start];
                                      const isFull = avail && !avail.available;
                                      const isSelected = slot?.start === s.start;
                                      return (
                                        <button
                                          key={s.start}
                                          onClick={() => {
                                            setSlot(s);
                                            setShowSlotPicker(false);
                                            setTimeout(() => {
                                              const next = STEP_ORDER[stepIndex + 1];
                                              if (next) setStep(next);
                                            }, 400);
                                          }}
                                          className={cn(
                                            'flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left',
                                            isSelected
                                              ? 'bg-emerald-500 border-emerald-500 text-white shadow-md'
                                              : isFull
                                              ? 'bg-slate-50 border-slate-100 opacity-60'
                                              : 'bg-white border-slate-100 hover:border-emerald-200'
                                          )}
                                        >
                                          <div>
                                            <p className={cn('text-xs font-bold', isSelected ? 'text-white' : 'text-slate-700')}>{s.label}</p>
                                            {isFull && <p className="text-[9px] text-orange-500 font-bold mt-0.5">Fully booked — waitlist available</p>}
                                          </div>
                                          {isSelected
                                            ? <CheckCircle2 className="w-4 h-4 text-white" />
                                            : <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {slot && !loadingAvail && isOverbook && (
                      <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 flex items-start gap-3">
                        <Info className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] text-orange-700 font-medium leading-relaxed">
                          This slot is fully booked. You can still proceed — client will be added to the priority waitlist. Admin confirms within 24h.
                        </p>
                      </div>
                    )}

                    <Button
                      onClick={handleNext}
                      disabled={isNextDisabled || loadingAvail}
                      className={cn(
                        'w-full h-12 rounded-2xl font-black text-sm transition-all active:scale-95',
                        isNextDisabled || loadingAvail
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg'
                      )}
                    >
                      <span className="flex items-center gap-2">Continue <ChevronRight className="w-4 h-4" /></span>
                    </Button>
                  </div>
                  );
                })()}

                {/* ADDONS */}
                {step === 'addons' && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">

                    {/* Size band picker for Spring / HIP (add-on prices vary by sqft range) */}
                    {(selectedSubcategoryKey === 'spring' || selectedSubcategoryKey === 'hip') && (
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Select Property Size</p>
                        <div className="grid grid-cols-2 gap-2">
                          {(SPRING_HIP_BANDS[selectedSubcategoryKey] ?? []).map((band) => {
                            const isActive = springHipSqftBand === band;
                            return (
                              <button
                                key={band}
                                onClick={() => setSpringHipSqftBand(band)}
                                className={cn(
                                  'p-3 rounded-xl border-2 text-left transition-all active:scale-[0.98]',
                                  isActive
                                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-md'
                                    : 'bg-white border-slate-100 hover:border-emerald-200'
                                )}
                              >
                                <p className={cn('text-[11px] font-bold', isActive ? 'text-white' : 'text-slate-800')}>{band}</p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Coating: mandatory scrubbing add-on display */}
                    {service === 'coating' && coatingScrubbingRow && (
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Included Scrubbing (Required)</p>
                        <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border-2 border-emerald-200">
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold text-slate-800">{coatingScrubbingRow.subcategory_label || coatingScrubbingRow.unit_label}</p>
                            <p className="text-[9px] text-emerald-600 font-bold uppercase mt-0.5">Mandatory for coating</p>
                          </div>
                          <p className="text-sm font-black text-emerald-700 flex-shrink-0">+S${effectivePrice(coatingScrubbingRow)}</p>
                        </div>
                      </div>
                    )}

                    {/* Unit-specific add-on services (scrubbing / coating / formaldehyde) */}
                    {addonServiceRows.length > 0 && (() => {
                      const scrubRow     = addonServiceRows.find(r => r.category === 'scrubbing');
                      const nonScrubRows = addonServiceRows.filter(r => r.category !== 'scrubbing');
                      return (
                        <div className="space-y-3">
                          {/* Non-scrubbing add-ons (disinfection, formaldehyde, jet_wash) */}
                          {nonScrubRows.length > 0 && (
                            <div>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Add-on Services</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {nonScrubRows.map((row) => {
                                  const isSelected = Boolean(selectedAddonServices[row.id]);
                                  const price = effectivePrice(row);
                                  return (
                                    <button
                                      key={row.id}
                                      onClick={() => {
                                        setSelectedAddonServices(prev =>
                                          isSelected
                                            ? (({ [row.id]: _, ...rest }) => rest)(prev)
                                            : { ...prev, [row.id]: row }
                                        );
                                      }}
                                      className={cn(
                                        'flex items-center justify-between p-3 rounded-xl border-2 text-left transition-all active:scale-[0.98]',
                                        isSelected ? 'bg-emerald-500 border-emerald-500 text-white shadow-md' : 'bg-white border-slate-100 hover:border-emerald-200'
                                      )}
                                    >
                                      <div className="min-w-0 flex-1">
                                        <p className={cn('text-[11px] font-bold truncate', isSelected ? 'text-white' : 'text-slate-800')}>
                                          {row.subcategory_label || ADDON_CATEGORY_NAMES[row.category] || row.unit_label}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <p className={cn('text-sm font-black', isSelected ? 'text-white' : 'text-emerald-600')}>+S${price}</p>
                                        {isSelected && <CheckCircle2 className="w-4 h-4 text-white flex-shrink-0" />}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Scrubbing Machine Add-on — Karcher / Lentech radio sub-picker */}
                          {scrubRow && (
                            <div>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Scrubbing Machine Add-on</p>
                              <div className="grid grid-cols-1 gap-2">
                                {([
                                  { type: 'KM1' as const, name: 'Scrubbing Machine Karcher', desc: 'Suitable for Tiles and Vinyl flooring' },
                                  { type: 'LC1' as const, name: 'Scrubbing Machine Lentech', desc: 'Suitable for Marble, Parquet, Tiles and Vinyl flooring' },
                                ]).map(({ type, name, desc }) => {
                                  const isActive = scrubMachineType === type;
                                  const price = effectivePrice(scrubRow);
                                  return (
                                    <button
                                      key={type}
                                      onClick={() => {
                                        const wasActive = scrubMachineType === type;
                                        setScrubMachineType(wasActive ? null : type);
                                        setSelectedAddonServices(prev =>
                                          wasActive
                                            ? (({ [scrubRow.id]: _, ...rest }) => rest)(prev)
                                            : { ...prev, [scrubRow.id]: scrubRow }
                                        );
                                      }}
                                      className={cn(
                                        'flex items-start justify-between gap-3 p-3 rounded-xl border-2 text-left transition-all active:scale-[0.98]',
                                        isActive
                                          ? 'bg-emerald-500 border-emerald-500 text-white shadow-md'
                                          : 'bg-white border-slate-100 hover:border-emerald-200'
                                      )}
                                    >
                                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                        <div className={cn(
                                          'mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                                          isActive ? 'border-white bg-white' : 'border-slate-300'
                                        )}>
                                          {isActive && <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />}
                                        </div>
                                        <div className="min-w-0">
                                          <p className={cn('text-[11px] font-black', isActive ? 'text-white' : 'text-slate-800')}>{name}</p>
                                          <p className={cn('text-[10px] mt-0.5', isActive ? 'text-emerald-100' : 'text-slate-500')}>{desc}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                                        <p className={cn('text-sm font-black', isActive ? 'text-white' : 'text-emerald-600')}>+S${price}</p>
                                        {isActive && <CheckCircle2 className="w-4 h-4 text-white flex-shrink-0" />}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Paid add-ons (from service_addons table) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
                      {Object.entries(
                        addonRows.reduce((acc, a) => {
                          const g = a.addon_group_label;
                          if (!acc[g]) acc[g] = [];
                          acc[g].push(a);
                          return acc;
                        }, {} as Record<string, AddonRow[]>)
                      ).map(([groupLabel, rows]) => {
                        const displayRows = rows.filter(r =>
                          !['scrubbing', 'coating', 'formaldehyde'].includes(r.addon_group) ||
                          (r.unit_label || '').trim().toLowerCase() === (selectedPricing?.unit_label || '').trim().toLowerCase()
                        );
                        if (displayRows.length === 0) return null;
                        const isMulti = displayRows.length > 1;
                        const selected = displayRows.find(r => selectedAddons[r.id]);
                        const isExp = expandedAddonGroup === groupLabel;
                        return (
                          <div key={groupLabel}>
                            <button
                              onClick={() => {
                                if (isMulti) {
                                  setExpandedAddonGroup(isExp ? null : groupLabel);
                                } else {
                                  const adding = !selected;
                                  setSelectedAddons(prev =>
                                    selected
                                      ? (({ [selected.id]: _, ...rest }) => rest)(prev)
                                      : { ...prev, [displayRows[0].id]: displayRows[0] }
                                  );
                                  if (adding) {
                                    setTimeout(() => {
                                      const next = STEP_ORDER[stepIndex + 1];
                                      if (next) setStep(next);
                                    }, 700);
                                  }
                                }
                              }}
                              className={cn('w-full p-3 rounded-xl border-2 text-left transition-all',
                                selected ? 'bg-emerald-500 border-emerald-500 text-white shadow-md' : 'bg-white border-slate-100'
                              )}
                            >
                              <div className="flex justify-between items-center">
                                <span className="text-[11px] font-bold truncate pr-2">{groupLabel}</span>
                                {selected ? <CheckCircle2 className="w-3.5 h-3.5 text-white flex-shrink-0" /> : <Layers className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />}
                              </div>
                              {isMulti ? (
                                <div className="flex justify-between items-center mt-1">
                                  <span className="text-[9px] opacity-75 uppercase font-black">{selected ? selected.unit_label : 'Select option'}</span>
                                  <ChevronDown className={cn('w-3 h-3 transition-transform', isExp && 'rotate-180')} />
                                </div>
                              ) : (
                                <p className={cn('text-[9px] mt-1 font-bold', selected ? 'text-white' : 'text-emerald-600')}>
                                  +S${displayRows[0].price}
                                </p>
                              )}
                            </button>
                            {isMulti && isExp && (
                              <div className="mt-1 grid gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                                {displayRows.map(r => (
                                  <button
                                    key={r.id}
                                    onClick={() => {
                                      setSelectedAddons(prev => ({ ...prev, [r.id]: r }));
                                      setExpandedAddonGroup(null);
                                      setTimeout(() => {
                                        const next = STEP_ORDER[stepIndex + 1];
                                        if (next) setStep(next);
                                      }, 700);
                                    }}
                                    className={cn('flex justify-between px-3 py-2 rounded-lg text-[10px] font-black transition-all',
                                      selectedAddons[r.id] ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 hover:bg-emerald-50 hover:text-emerald-600'
                                    )}
                                  >
                                    <span>{r.unit_label}</span><span>+S${r.price}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Optional Add-ons for Deep Cleaning: upholstery bundles + curtain steam */}
                    {service === 'deep_cleaning' &&
                     ((selectedSubcategoryKey === 'spring' || selectedSubcategoryKey === 'hip') ? springHipSqftBand !== null : true) && (
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Optional Add-ons</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {/* Upholstery bundles — only for renovation / tenancy */}
                          {(selectedSubcategoryKey === 'renovation' || selectedSubcategoryKey === 'tenancy') && ([2, 3] as const).map((pieces) => {
                            const upholPrice = pieces === 2
                              ? (upholsteryBundle2Row ? effectivePrice(upholsteryBundle2Row) : 158)
                              : (upholsteryBundle3Row ? effectivePrice(upholsteryBundle3Row) : 188);
                            const isSelected = bundleUpholsteryPieces === pieces;
                            return (
                              <button
                                key={pieces}
                                onClick={() => setBundleUpholsteryPieces(prev => prev === pieces ? 0 : pieces)}
                                className={cn(
                                  'flex items-center justify-between p-3 rounded-xl border-2 text-left transition-all active:scale-[0.98]',
                                  isSelected
                                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-md'
                                    : 'bg-white border-slate-100 hover:border-emerald-200'
                                )}
                              >
                                <p className={cn('text-[11px] font-bold', isSelected ? 'text-white' : 'text-slate-800')}>
                                  Upholstery — {pieces} pcs
                                </p>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <p className={cn('text-sm font-black', isSelected ? 'text-white' : 'text-emerald-600')}>+S${upholPrice}</p>
                                  {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                                </div>
                              </button>
                            );
                          })}
                          {/* Curtain Steam — all deep cleaning subtypes */}
                          <button
                            onClick={() => setBundleCurtainSteam(prev => !prev)}
                            className={cn(
                              'flex items-center justify-between p-3 rounded-xl border-2 text-left transition-all active:scale-[0.98]',
                              bundleCurtainSteam
                                ? 'bg-emerald-500 border-emerald-500 text-white shadow-md'
                                : 'bg-white border-slate-100 hover:border-emerald-200'
                            )}
                          >
                            <p className={cn('text-[11px] font-bold', bundleCurtainSteam ? 'text-white' : 'text-slate-800')}>
                              Curtain Steam Cleaning
                            </p>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <p className={cn('text-sm font-black', bundleCurtainSteam ? 'text-white' : 'text-emerald-600')}>+S${curtainSteamUnitPrice}</p>
                              {bundleCurtainSteam && <CheckCircle2 className="w-4 h-4 text-white" />}
                            </div>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Upholstery-specific add-ons: L-Shape, Curtain Steam, Disinfect */}
                    {service === 'upholstery' && (
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Optional Add-ons</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {selectedSubcategoryKey === 'sofa' && (
                            <button
                              onClick={() => setUpholsteryLShape(prev => !prev)}
                              className={cn(
                                'flex items-center justify-between p-3 rounded-xl border-2 text-left transition-all active:scale-[0.98]',
                                upholsteryLShape
                                  ? 'bg-emerald-500 border-emerald-500 text-white shadow-md'
                                  : 'bg-white border-slate-100 hover:border-emerald-200'
                              )}
                            >
                              <p className={cn('text-[11px] font-bold', upholsteryLShape ? 'text-white' : 'text-slate-800')}>L-Shape Sofa Upcharge</p>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <p className={cn('text-sm font-black', upholsteryLShape ? 'text-white' : 'text-emerald-600')}>+S${UPHOLSTERY_LSHAPE_PRICE}</p>
                                {upholsteryLShape && <CheckCircle2 className="w-4 h-4 text-white" />}
                              </div>
                            </button>
                          )}
                          <button
                            onClick={() => setUpholsteryAddonCurtainSteam(prev => !prev)}
                            className={cn(
                              'flex items-center justify-between p-3 rounded-xl border-2 text-left transition-all active:scale-[0.98]',
                              upholsteryAddonCurtainSteam
                                ? 'bg-emerald-500 border-emerald-500 text-white shadow-md'
                                : 'bg-white border-slate-100 hover:border-emerald-200'
                            )}
                          >
                            <p className={cn('text-[11px] font-bold', upholsteryAddonCurtainSteam ? 'text-white' : 'text-slate-800')}>Curtain Steam Cleaning</p>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <p className={cn('text-sm font-black', upholsteryAddonCurtainSteam ? 'text-white' : 'text-emerald-600')}>+S${UPHOLSTERY_ADDON_CURTAIN_STEAM_PRICE}</p>
                              {upholsteryAddonCurtainSteam && <CheckCircle2 className="w-4 h-4 text-white" />}
                            </div>
                          </button>
                          <button
                            onClick={() => setUpholsteryAddonDisinfect(prev => !prev)}
                            className={cn(
                              'flex items-center justify-between p-3 rounded-xl border-2 text-left transition-all active:scale-[0.98]',
                              upholsteryAddonDisinfect
                                ? 'bg-emerald-500 border-emerald-500 text-white shadow-md'
                                : 'bg-white border-slate-100 hover:border-emerald-200'
                            )}
                          >
                            <p className={cn('text-[11px] font-bold', upholsteryAddonDisinfect ? 'text-white' : 'text-slate-800')}>Disinfectant Misting</p>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <p className={cn('text-sm font-black', upholsteryAddonDisinfect ? 'text-white' : 'text-emerald-600')}>+S${UPHOLSTERY_ADDON_DISINFECT_PRICE}</p>
                              {upholsteryAddonDisinfect && <CheckCircle2 className="w-4 h-4 text-white" />}
                            </div>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Height Add-on — collapsible, deep_cleaning only (mirror booking-web) */}
                    {service === 'deep_cleaning' && (
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Height Add-on</p>
                        <button
                          type="button"
                          onClick={() => setShowHighCeiling(v => !v)}
                          className={cn(
                            'w-full p-3 rounded-xl border-2 text-left transition-all flex items-center justify-between gap-2',
                            showHighCeiling ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 bg-white hover:border-slate-300'
                          )}
                        >
                          <div>
                            <p className="text-[11px] font-black text-slate-900">Cleaning at height above 3 metres</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Scaffolding / extended ladder work required</p>
                          </div>
                          <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform flex-shrink-0', showHighCeiling && 'rotate-180')} />
                        </button>
                        {showHighCeiling && (
                          <div className="mt-2 space-y-2">
                            <button
                              onClick={() => setHighCeilingAddon(prev => prev === '4_5m' ? null : '4_5m')}
                              className={cn(
                                'w-full flex items-center justify-between p-3 rounded-xl border-2 text-left transition-all active:scale-[0.98]',
                                highCeilingAddon === '4_5m'
                                  ? 'bg-emerald-500 border-emerald-500 text-white shadow-md'
                                  : 'bg-white border-slate-100 hover:border-emerald-200'
                              )}
                            >
                              <p className={cn('text-[11px] font-bold', highCeilingAddon === '4_5m' ? 'text-white' : 'text-slate-800')}>4 – 5 metres</p>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <p className={cn('text-sm font-black', highCeilingAddon === '4_5m' ? 'text-white' : 'text-emerald-600')}>+S$100</p>
                                {highCeilingAddon === '4_5m' && <CheckCircle2 className="w-4 h-4 text-white" />}
                              </div>
                            </button>
                            <div className="p-3 rounded-xl border-2 border-amber-200 bg-amber-50 flex items-start gap-3">
                              <span className="text-base flex-shrink-0">📞</span>
                              <div>
                                <p className="text-[11px] font-black text-amber-900">6 metres and above</p>
                                <p className="text-[10px] text-amber-800 mt-0.5 leading-relaxed">Please contact our customer service team for a custom quote.</p>
                                <a href="https://wa.me/6589182880" className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-black text-amber-700 underline">Chat +65 8918 2880 →</a>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-50">
                      <Button
                        onClick={handleNext}
                        className="w-full h-12 rounded-2xl font-black text-sm bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-500 transition-all shadow-none active:scale-95"
                      >
                        <span className="flex items-center gap-2">Skip / Continue <ChevronRight className="w-4 h-4" /></span>
                      </Button>
                    </div>
                  </div>
                )}

                {/* CONTACT */}
                {step === 'contact' && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Full Name *</p>
                          <Input placeholder="John Doe" value={name} onChange={e => setName(e.target.value)} />
                          {contactErrors.name && <p className="text-[9px] text-red-500 font-bold ml-1">{contactErrors.name}</p>}
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Mobile Number *</p>
                          <Input placeholder="+65 9XXX XXXX" value={phone} onChange={e => setPhone(e.target.value)} />
                          {contactErrors.phone && <p className="text-[9px] text-red-500 font-bold ml-1">{contactErrors.phone}</p>}
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Email Address</p>
                          <Input type="email" placeholder="client@email.com" value={email} onChange={e => setEmail(e.target.value)} />
                          {contactErrors.email && <p className="text-[9px] text-red-500 font-bold ml-1">{contactErrors.email}</p>}
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Notes / Access Instructions</p>
                          <Textarea placeholder="Digital lock code, pet info, parking..." value={notes} onChange={e => setNotes(e.target.value)} className="min-h-[60px]" />
                        </div>
                      </div>

                      <div className="space-y-3">
                        {postalStatus === 'valid' && fetchedAddress ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between ml-1">
                              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Service Location</p>
                              <button
                                type="button"
                                onClick={() => { setPostalCode(''); setFetchedAddress(''); setPostalStatus('idle'); }}
                                className="text-[9px] text-emerald-600 font-bold hover:underline"
                              >Change</button>
                            </div>
                            <div className="flex items-start gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs font-black text-emerald-900">Singapore {postalCode}</p>
                                <p className="text-xs text-emerald-700 mt-0.5">{fetchedAddress}</p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Postal Code *</p>
                            <div className="relative">
                              <MapPin className={cn('absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5',
                                postalStatus === 'valid' ? 'text-emerald-500' : postalStatus === 'invalid' ? 'text-red-400' : 'text-slate-400'
                              )} />
                              {loadingAddress && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-slate-400" />}
                              <Input
                                placeholder="e.g. 560123"
                                value={postalCode}
                                onChange={e => handlePostalChange(e.target.value)}
                                maxLength={6}
                                className="pl-8"
                              />
                            </div>
                            {contactErrors.postalCode && <p className="text-[9px] text-red-500 font-bold ml-1">{contactErrors.postalCode}</p>}
                            {fetchedAddress && <p className="text-[9px] text-emerald-600 font-bold ml-1">{fetchedAddress}</p>}
                          </div>
                        )}

                        <div className="space-y-1">
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Unit Number</p>
                          <Input placeholder="#12-34" value={unitNumber} onChange={e => setUnitNumber(e.target.value)} maxLength={20} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TERMS */}
                {step === 'terms' && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">

                    {/* Promo code */}
                    {/* Warning header */}
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                      <p className="text-xs font-black text-amber-700 uppercase tracking-widest">Doctor Clean Pte Ltd</p>
                      <div className="flex items-center justify-center gap-2 mt-1">
                        <span className="text-amber-500 text-base">⚠️</span>
                        <p className="text-sm font-black text-amber-900">IMPORTANT — Please Read Before Proceeding</p>
                        <span className="text-amber-500 text-base">⚠️</span>
                      </div>
                    </div>

                    {/* Terms list */}
                    <div className="bg-white border border-slate-100 rounded-2xl p-4 space-y-2.5 max-h-[280px] overflow-y-auto scrollbar-hide">
                      {[
                        'Ensure all areas are accessible and remove valuables/fragile items.',
                        'Customers must provide water and electricity during cleaning.',
                        'Additional charges may apply for excessive dust, large debris, or special requests.',
                        'We are not responsible for pre-existing damages.',
                        'All housekeeping packages must be used within their validity period.',
                        'Rescheduling within 24 hours notice incurs a $100 transportation and administrative fee.',
                        'Rescheduling within 48 hours notice incurs a $60 transportation and administrative fee.',
                        'Cancellation within 24 hours: 50% of the payment will be deducted as a cancellation fee.',
                        'Cancellation within 48 hours: 30% of the payment will be deducted as a cancellation fee.',
                        'Homeowners should inspect the cleaning upon completion; an $80 fee applies for touch-ups thereafter.',
                      ].map((term, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <span className="text-emerald-500 flex-shrink-0 text-sm mt-0.5">☑</span>
                          <p className="text-[11px] text-slate-700 leading-relaxed">{term}</p>
                        </div>
                      ))}
                    </div>

                    {/* Full T&C + Privacy links — always visible on mobile */}
                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px]">
                      <a
                        href="https://doctorcleanpayment.sg/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-emerald-600 underline underline-offset-2 hover:text-emerald-700"
                      >
                        Read full Terms &amp; Conditions →
                      </a>
                      <span className="text-slate-300">·</span>
                      <a
                        href="https://doctorcleanpayment.sg/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-emerald-600 underline underline-offset-2 hover:text-emerald-700"
                      >
                        Privacy Policy →
                      </a>
                    </div>

                    {/* Agree checkbox */}
                    <label className={cn(
                      'flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all select-none',
                      termsAccepted ? 'bg-emerald-50 border-emerald-400' : 'bg-white border-slate-200 hover:border-emerald-200'
                    )}>
                      <div className={cn(
                        'w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all',
                        termsAccepted ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                      )}>
                        {termsAccepted && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <input type="checkbox" className="sr-only" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} />
                      <p className="text-xs font-bold text-slate-700">
                        I have read and agree to the Terms &amp; Conditions and Privacy Policy.
                      </p>
                    </label>

                    {/* Two-button row */}
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => router.push('/dashboard')}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:border-emerald-300 hover:text-emerald-700 transition-all active:scale-95"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => { if (termsAccepted && !loadingPayment && !submitting) handleNext(); }}
                        disabled={!termsAccepted || loadingPayment || submitting}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm transition-all active:scale-95',
                          termsAccepted && !loadingPayment && !submitting
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-500/20'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        )}
                      >
                        {loadingPayment || submitting
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : isChatInquiry || isOverbook
                            ? <span className="flex items-center gap-2">Send Inquiry <Send className="w-4 h-4" /></span>
                          : <span className="flex items-center gap-2">Proceed to Payment <ChevronRight className="w-4 h-4" /></span>
                        }
                      </button>
                    </div>
                  </div>
                )}

                {/* CONFIRM / PAYMENT */}
                {step === 'confirm' && (
                  <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-xl overflow-hidden relative">
                      <div className="absolute top-0 left-0 w-full h-1.5 bg-emerald-500" />
                      <div className="bg-slate-900 p-6 text-white">
                        <Badge className="bg-emerald-500 text-white border-none font-black text-[9px] px-2 py-0.5 mb-3 uppercase tracking-widest">RESERVATION READY</Badge>
                        <h2 className="text-2xl font-black tracking-tight">{serviceLabel}</h2>
                        {subtype && <p className="text-emerald-400 font-black text-sm mt-1">{subtype}</p>}
                        {selectedPricing?.unit_label && (
                          <p className="text-slate-400 text-xs mt-0.5">{selectedPricing.unit_label}</p>
                        )}
                        {selectedHKPricing && (
                          <p className="text-slate-400 text-xs mt-0.5">{selectedHKPricing.hours}h — {selectedHKPricing.label}</p>
                        )}
                      </div>
                      <div className="p-6 space-y-6 bg-white">
                        <div className="grid grid-cols-2 gap-6 border-b border-slate-50 pb-6">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Service Date</p>
                            <p className="text-sm font-bold text-slate-900">{selectedDate?.toLocaleDateString('en-SG', { dateStyle: 'long' })}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Arrival Window</p>
                            <p className="text-sm font-bold text-slate-900">{slot?.label}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Order Breakdown</p>
                          <div className="space-y-2">
                            <div className="flex justify-between items-start bg-slate-50 p-3 rounded-xl">
                              <div>
                                <p className="text-sm font-black text-slate-800">
                                  {selectedHKPricing ? selectedHKPricing.label : (subtype || serviceLabel)}
                                </p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  {selectedHKPricing
                                    ? `${selectedHKPricing.hours} hour${selectedHKPricing.hours !== 1 ? 's' : ''}`
                                    : service === 'blinds'
                                      ? `${blindsCount} piece${blindsCount === 1 ? '' : 's'}`
                                      : selectedPricing?.unit_label ?? '—'}
                                </p>
                              </div>
                              <span className="text-sm font-black text-slate-900 flex-shrink-0 ml-4">
                                {selectedHKPricing
                                  ? `S$${selectedHKPricing.price}`
                                  : service === 'blinds'
                                    ? `S$${blindsTotal}`
                                    : selectedPricing ? `S$${effectivePrice(selectedPricing)}` : 'TBD'}
                              </span>
                            </div>
                            {service === 'blinds' && pricingRows
                              .filter(r => r.category === 'blinds' && (blindsQuantities[r.id] ?? 0) > 0)
                              .map(r => (
                                <div key={r.id} className="flex justify-between px-3 text-xs text-slate-500">
                                  <span>+ {r.unit_label} × {blindsQuantities[r.id]}</span>
                                  <span className="font-bold text-emerald-600">S${(blindsQuantities[r.id] ?? 0) * (r.partner_price ?? r.price ?? 0)}</span>
                                </div>
                              ))
                            }
                            {Object.values(selectedAddons).map(a => (
                              <div key={a.id} className="flex justify-between px-3 text-xs text-slate-500">
                                <span>+ {a.addon_group_label}</span>
                                <span className="font-bold text-emerald-600">+S${a.price}</span>
                              </div>
                            ))}
                            {Object.values(selectedAddonServices).map(r => (
                              <div key={r.id} className="flex justify-between px-3 text-xs text-slate-500">
                                <span>+ {r.subcategory_label || r.unit_label}</span>
                                <span className="font-bold text-emerald-600">+S${effectivePrice(r)}</span>
                              </div>
                            ))}
                            {(slot?.additionalFee ?? 0) > 0 && (
                              <div className="flex justify-between items-center px-3 py-1">
                                <span className="text-xs text-orange-600 italic">+ Night/Peak Surcharge</span>
                                <span className="text-xs font-bold text-orange-600">+S${slot?.additionalFee}</span>
                              </div>
                            )}
                            {companyDiscountAmount > 0 && (
                              <div className="flex justify-between items-center px-3 py-1">
                                <span className="text-xs text-emerald-600 italic">
                                  − Partner discount{user?.company_name ? ` (${user.company_name})` : ''}
                                </span>
                                <span className="text-xs font-bold text-emerald-600">−S${companyDiscountAmount.toFixed(2)}</span>
                              </div>
                            )}
                            {appliedPromo && (
                              <div className="flex justify-between items-center px-3 py-1">
                                <span className="text-xs text-emerald-600 italic">− Promo ({appliedPromo.code})</span>
                                <span className="text-xs font-bold text-emerald-600">
                                  −S${Math.max(0, (totalPrice - companyDiscountAmount) - finalPrice).toFixed(2)}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between items-center px-3 pt-2 border-t border-slate-100 mt-2">
                              <span className="text-xs text-slate-500">Subtotal (ex-GST)</span>
                              <span className="text-xs font-semibold text-slate-700">S${(finalPrice || totalPrice).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center px-3">
                              <span className="text-xs text-slate-500">GST (9%)</span>
                              <span className="text-xs font-semibold text-slate-700">S${(((finalPrice || totalPrice) * 0.09)).toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="border-t border-slate-100 pt-4">
                          <div className="flex justify-between items-end">
                            <div>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total (incl. GST)</p>
                              <span className="text-4xl font-black text-slate-900 tracking-tighter">S${(((finalPrice || totalPrice) * 1.09)).toFixed(2)}</span>
                            </div>
                            <p className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Secured by Stripe</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {clientSecret && currentBookingId && (
                      <Elements stripe={stripePromise} options={{ clientSecret }}>
                        <CheckoutForm bookingId={currentBookingId} refId={currentRefId || ''} amount={((finalPrice || totalPrice) * 1.09)} />
                      </Elements>
                    )}
                  </div>
                )}

                {/* CHAT */}
                {step === 'chat' && currentBookingId && (
                  <div className="animate-in fade-in zoom-in-95 duration-500 min-h-[500px] flex flex-col">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-xl overflow-hidden flex-grow flex flex-col">
                      <div className="bg-emerald-700 p-4 text-white flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-sm">Concierge Chat</h3>
                          <p className="text-[10px] opacity-80">Connected to Admin</p>
                        </div>
                        <Badge className="bg-white/20 text-white border-white/20 font-black text-[9px]">SGT (UTC+8)</Badge>
                      </div>
                      <div className="h-[420px]">
                        <JobChatContent jobId={currentBookingId} />
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>

          {/* ── RIGHT: Real-time Summary (Desktop) ── */}
          {!['confirm', 'chat'].includes(step) && (
            <div className="hidden lg:block lg:col-span-5 xl:col-span-4">
              <RealtimeSummary
                serviceLabel={serviceLabel}
                subtype={subtype}
                date={selectedDate}
                slot={slot}
                pricing={selectedPricing}
                housekeepingPricing={selectedHKPricing}
                addons={selectedAddons}
                addonServices={Object.values(selectedAddonServices)}
                scrubMachineType={scrubMachineType}
                additionalServices={Array.from(selectedAdditionalServices)
                  .map((id) => {
                    const row = additionalServiceRows.find((r) => r.id === id);
                    if (!row || !row.price || Number(row.price) <= 0) return null;
                    return { id: row.id, name: row.name, price: Number(row.price) };
                  })
                  .filter((x): x is { id: number; name: string; price: number } => x !== null)}
                bundleUpholsteryPieces={bundleUpholsteryPieces}
                bundleUpholsteryPrice={bundleUpholsteryPrice}
                bundleCurtainSteam={bundleCurtainSteam}
                bundleCurtainSteamPrice={bundleCurtainSteamPrice}
                upholsteryLShape={upholsteryLShape}
                upholsteryLShapePrice={UPHOLSTERY_LSHAPE_PRICE}
                upholsteryAddonCurtainSteam={upholsteryAddonCurtainSteam}
                upholsteryAddonCurtainSteamPrice={UPHOLSTERY_ADDON_CURTAIN_STEAM_PRICE}
                upholsteryAddonDisinfect={upholsteryAddonDisinfect}
                upholsteryAddonDisinfectPrice={UPHOLSTERY_ADDON_DISINFECT_PRICE}
                coatingScrubbingLabel={coatingScrubbingRow ? (coatingScrubbingRow.subcategory_label || coatingScrubbingRow.unit_label || 'Scrubbing') : null}
                coatingScrubbingPrice={coatingScrubbingRow ? effectivePrice(coatingScrubbingRow) : 0}
                highCeilingAddon={highCeilingAddon}
                totalPrice={totalPrice}
                finalPrice={finalPrice || totalPrice}
                companyDiscountAmount={companyDiscountAmount}
                companyDiscountLabel={user?.company_name ?? null}
                appliedPromo={appliedPromo}
                isOverbook={isOverbook}
                step={step as any}
                onNext={handleNext}
                onClear={handleClear}
                onApplyPromo={handlePromoApply}
                onRemovePromo={handlePromoRemove}
                isNextDisabled={isNextDisabled}
                loading={loadingPayment || loadingAvail || submitting}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile navigation tray ── */}
      {!['confirm', 'chat'].includes(step) && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 z-50 shadow-2xl pb-safe">
          {/* Compact price summary + inline chat trigger (replaces the
              floating FAB on mobile inside this wizard so it doesn't
              overlap the "View breakdown" tap target). */}
          {(totalPrice > 0 || selectedPricing || selectedHKPricing) && (
            <div className="w-full flex items-stretch border-b border-slate-100">
              <button
                type="button"
                onClick={() => setShowMobileSummary(true)}
                className="flex-1 flex items-center justify-between px-4 py-2 active:bg-slate-50 transition-colors"
              >
                <div className="text-left">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total (incl. GST)</p>
                  <p className="text-base font-extrabold text-slate-900">
                    S${((appliedPromo ? finalPrice : totalPrice) * 1.09).toFixed(2)}
                  </p>
                </div>
                <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                  View breakdown
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('dc-open-chat'))}
                aria-label="Open concierge chat"
                className="flex items-center justify-center px-4 border-l border-slate-100 text-emerald-600 active:bg-emerald-50 transition-colors"
              >
                <MessageCircle className="w-5 h-5" strokeWidth={2.25} />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 px-4 py-3">
            {step !== 'service' && (
              <Button variant="outline" size="icon" className="w-11 h-11 rounded-xl flex-shrink-0" onClick={goBack}>
                <ChevronLeft className="w-5 h-5" strokeWidth={3} />
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={isNextDisabled || loadingPricing || loadingAvail}
              className={cn(
                'flex-1 h-11 rounded-xl text-sm font-bold transition-all active:scale-95',
                isNextDisabled ? 'bg-slate-100 text-slate-500' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-500/20'
              )}
            >
              {step === 'contact'
                ? <span className="flex items-center gap-2">Review & Terms <Sparkles className="w-4 h-4" /></span>
                : <span className="flex items-center gap-2">Continue <ChevronRight className="w-4 h-4" /></span>
              }
            </Button>
          </div>
        </div>
      )}

      {/* ── Mobile Breakdown Sheet ── */}
      {showMobileSummary && (
        <div
          className="lg:hidden fixed inset-0 z-[60] flex items-end bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowMobileSummary(false)}
        >
          <div
            className="w-full bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Booking Breakdown</p>
                <p className="text-base font-extrabold text-slate-900">{serviceLabel || 'New Quote'}</p>
              </div>
              <button
                onClick={() => setShowMobileSummary(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center flex-shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <RealtimeSummary
                serviceLabel={serviceLabel}
                subtype={subtype}
                date={selectedDate}
                slot={slot}
                pricing={selectedPricing}
                housekeepingPricing={selectedHKPricing}
                addons={selectedAddons}
                addonServices={Object.values(selectedAddonServices)}
                scrubMachineType={scrubMachineType}
                additionalServices={Array.from(selectedAdditionalServices)
                  .map((id) => {
                    const row = additionalServiceRows.find((r) => r.id === id);
                    if (!row || !row.price || Number(row.price) <= 0) return null;
                    return { id: row.id, name: row.name, price: Number(row.price) };
                  })
                  .filter((x): x is { id: number; name: string; price: number } => x !== null)}
                bundleUpholsteryPieces={bundleUpholsteryPieces}
                bundleUpholsteryPrice={bundleUpholsteryPrice}
                bundleCurtainSteam={bundleCurtainSteam}
                bundleCurtainSteamPrice={bundleCurtainSteamPrice}
                upholsteryLShape={upholsteryLShape}
                upholsteryLShapePrice={UPHOLSTERY_LSHAPE_PRICE}
                upholsteryAddonCurtainSteam={upholsteryAddonCurtainSteam}
                upholsteryAddonCurtainSteamPrice={UPHOLSTERY_ADDON_CURTAIN_STEAM_PRICE}
                upholsteryAddonDisinfect={upholsteryAddonDisinfect}
                upholsteryAddonDisinfectPrice={UPHOLSTERY_ADDON_DISINFECT_PRICE}
                coatingScrubbingLabel={coatingScrubbingRow ? (coatingScrubbingRow.subcategory_label || coatingScrubbingRow.unit_label || 'Scrubbing') : null}
                coatingScrubbingPrice={coatingScrubbingRow ? effectivePrice(coatingScrubbingRow) : 0}
                highCeilingAddon={highCeilingAddon}
                totalPrice={totalPrice}
                finalPrice={finalPrice || totalPrice}
                companyDiscountAmount={companyDiscountAmount}
                companyDiscountLabel={user?.company_name ?? null}
                appliedPromo={appliedPromo}
                isOverbook={isOverbook}
                step={step as any}
                onNext={() => {
                  setShowMobileSummary(false);
                  handleNext();
                }}
                onApplyPromo={handlePromoApply}
                onRemovePromo={handlePromoRemove}
                isNextDisabled={isNextDisabled}
                loading={loadingPayment || loadingAvail || submitting}
              />
            </div>
          </div>
        </div>
      )}

      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />
    </div>
  );
}
