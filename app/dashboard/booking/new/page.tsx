'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DayPicker } from 'react-day-picker';
import { ChevronRight, ChevronLeft, CheckCircle2, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useBookingStore } from '@/store/bookingStore';
import { useAuthStore } from '@/store/authStore';
import { getSupabaseClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { bookingContactSchema } from '@/lib/validations/booking.schema';
import type { ServiceKey, PricingRow, AddonRow, BookingSlot } from '@/types';

const SERVICES = [
  { key: 'deep_cleaning' as ServiceKey, label: 'Deep Cleaning', emoji: '🧹', sub: 'Tenancy · Renovation · Spring · HIP', color: '#3B82F6' },
  { key: 'housekeeping' as ServiceKey, label: 'Housekeeping', emoji: '🏠', sub: 'Regular home cleaning', color: '#10B981' },
  { key: 'upholstery' as ServiceKey, label: 'Upholstery Cleaning', emoji: '🛋️', sub: 'Sofa · Mattress · Ala-carte', color: '#14B8A6' },
  { key: 'curtain' as ServiceKey, label: 'Curtain Cleaning', emoji: '🪟', sub: 'Steam · Dry cleaning', color: '#8B5CF6' },
];

const SLOTS: BookingSlot[] = [
  { label: '9:00–9:30 AM Arrival', start: '9:00 AM', end: '9:30 AM', additionalFee: 0 },
  { label: '2:00–4:00 PM Arrival', start: '2:00 PM', end: '4:00 PM', additionalFee: 0 },
  { label: '6:00–8:00 PM Arrival (+$50)', start: '6:00 PM', end: '8:00 PM', additionalFee: 50 },
];

const SUBTYPES: Record<ServiceKey, string[]> = {
  deep_cleaning: ['Tenancy (Move-In/Out)', 'Post-Renovation', 'Spring Cleaning', 'HIP Cleaning'],
  housekeeping: ['Regular Session', 'Monthly Package (4x)', 'Monthly Package (8x)'],
  upholstery: ['Sofa Cleaning', 'Mattress Cleaning', 'Ala-Carte Items'],
  curtain: ['Steam Cleaning (On-site)', 'Dry Cleaning (Factory)'],
};

type Step = 'service' | 'datetime' | 'subtype' | 'property' | 'size' | 'addons' | 'contact' | 'confirm';

export default function BookingNewPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const supabase = getSupabaseClient();

  const [step, setStep] = useState<Step>('service');
  const [service, setService] = useState<ServiceKey | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [slot, setSlot] = useState<BookingSlot | null>(null);
  const [subtype, setSubtype] = useState('');
  const [propertyType, setPropertyType] = useState<'hdb' | 'condo' | null>(null);
  const [selectedPricing, setSelectedPricing] = useState<PricingRow | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<Record<string, AddonRow>>({});
  const [pricingRows, setPricingRows] = useState<PricingRow[]>([]);
  const [addonRows, setAddonRows] = useState<AddonRow[]>([]);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill from store (if navigated from slots page)
  const { date: storeDate, slot: storeSlot } = useBookingStore();
  useEffect(() => {
    if (storeDate) setSelectedDate(new Date(storeDate));
    if (storeSlot) setSlot(storeSlot);
  }, []);

  useEffect(() => {
    if (service) fetchPricing();
  }, [service, propertyType]);

  const fetchPricing = async () => {
    if (!service) return;
    setLoadingPricing(true);
    const categoryMap: Record<ServiceKey, string> = {
      deep_cleaning: 'deep_cleaning',
      housekeeping: 'housekeeping',
      upholstery: 'upholstery',
      curtain: 'curtain',
    };
    const [pricingRes, addonRes] = await Promise.all([
      supabase.from('service_pricing').select('*').eq('category', categoryMap[service]).order('sort_order'),
      supabase.from('service_addons').select('*').eq('addon_group', categoryMap[service]).order('sort_order'),
    ]);
    setPricingRows((pricingRes.data || []) as PricingRow[]);
    setAddonRows((addonRes.data || []) as AddonRow[]);
    setLoadingPricing(false);
  };

  const STEP_ORDER: Step[] = ['service', 'datetime', 'subtype', 'property', 'size', 'addons', 'contact', 'confirm'];
  const stepIndex = STEP_ORDER.indexOf(step);
  const progress = ((stepIndex + 1) / STEP_ORDER.length) * 100;

  const goBack = () => {
    if (stepIndex > 0) setStep(STEP_ORDER[stepIndex - 1]);
    else router.back();
  };

  const validateContact = () => {
    const r = bookingContactSchema.safeParse({ name, phone, email, address, notes });
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.issues.forEach((e) => { if (e.path[0]) errs[String(e.path[0])] = e.message; });
      setContactErrors(errs);
      return false;
    }
    setContactErrors({});
    return true;
  };

  const handleSubmit = async () => {
    if (!validateContact()) return;
    setSubmitting(true);
    try {
      const basePrice = selectedPricing?.price || 0;
      const addonTotal = Object.values(selectedAddons).reduce((s, a) => s + (a.price || 0), 0);
      const slotFee = slot?.additionalFee ?? 0;
      const total = basePrice + addonTotal + slotFee;

      await supabase.from('events').insert({
        Title: `${name} - ${SERVICES.find((s) => s.key === service)?.label}`,
        Service_Type: service,
        Start_Date: selectedDate?.toISOString().split('T')[0],
        Start_Time_Display: slot?.start,
        End_Time_Display: slot?.end,
        Name: name,
        Whatsapp_Number: phone,
        Email: email,
        address,
        Note: notes,
        Price: total,
        owned_by_third_party: user?.id,
        Extra_Service: subtype ? [subtype] : [],
        source: 'partner_web',
      });

      router.push('/dashboard');
    } finally {
      setSubmitting(false);
    }
  };

  const totalPrice = (selectedPricing?.price || 0) + Object.values(selectedAddons).reduce((s, a) => s + (a.price || 0), 0) + (slot?.additionalFee || 0);

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div className="bg-emerald-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-xs text-gray-500 text-center">Step {stepIndex + 1} of {STEP_ORDER.length}</p>

      {/* STEP: SERVICE */}
      {step === 'service' && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-gray-800">Select a Service</h2>
          {SERVICES.map((s) => (
            <button
              key={s.key}
              onClick={() => { setService(s.key); setStep('datetime'); }}
              className="w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/50 active:scale-[0.99] transition-all text-left"
              style={{ borderLeftColor: s.color, borderLeftWidth: 4 }}
            >
              <span className="text-3xl">{s.emoji}</span>
              <div>
                <p className="font-semibold text-gray-800">{s.label}</p>
                <p className="text-xs text-gray-500">{s.sub}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* STEP: DATETIME */}
      {step === 'datetime' && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-gray-800">Pick a Date</h2>
          <div className="flex justify-center bg-white rounded-xl border border-gray-200 p-2">
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={{ before: new Date() }}
              classNames={{ day_selected: 'bg-emerald-600 text-white rounded-full', day_today: 'font-bold text-emerald-600' }}
            />
          </div>
          {selectedDate && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Select a time slot:</p>
              {SLOTS.map((s) => (
                <button key={s.label} onClick={() => setSlot(s)}
                  className={cn('w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all',
                    slot?.label === s.label ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white hover:border-emerald-300'
                  )}>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-sm">{s.label}</span>
                    {(s.additionalFee ?? 0) > 0 && <Badge variant="warning">+${s.additionalFee}</Badge>}
                  </div>
                  {slot?.label === s.label && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={goBack} className="flex-1"><ChevronLeft className="w-4 h-4" />Back</Button>
            <Button onClick={() => setStep('subtype')} disabled={!selectedDate || !slot} className="flex-1">Next<ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      )}

      {/* STEP: SUBTYPE */}
      {step === 'subtype' && service && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-gray-800">What type of cleaning?</h2>
          {SUBTYPES[service].map((st) => (
            <button key={st} onClick={() => { setSubtype(st); setStep('property'); }}
              className={cn('w-full p-4 rounded-xl border text-left text-sm font-medium transition-all',
                subtype === st ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white hover:border-emerald-300 text-gray-700'
              )}>
              {st}
            </button>
          ))}
          <Button variant="outline" onClick={goBack} className="w-full"><ChevronLeft className="w-4 h-4" />Back</Button>
        </div>
      )}

      {/* STEP: PROPERTY TYPE */}
      {step === 'property' && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-gray-800">Property Type</h2>
          <div className="grid grid-cols-2 gap-3">
            {(['hdb', 'condo'] as const).map((pt) => (
              <button key={pt} onClick={() => { setPropertyType(pt); setStep('size'); }}
                className={cn('p-5 rounded-xl border text-center font-semibold capitalize transition-all',
                  propertyType === pt ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-300'
                )}>
                {pt === 'hdb' ? '🏢 HDB' : '🏙️ Condo'}
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={goBack} className="w-full"><ChevronLeft className="w-4 h-4" />Back</Button>
        </div>
      )}

      {/* STEP: SIZE / PRICING */}
      {step === 'size' && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-gray-800">Select Unit Size</h2>
          {loadingPricing ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>
          ) : pricingRows.filter((r) => !r.is_site_visit && (!r.property_type || r.property_type === propertyType)).length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">Contact us for a custom quote.</p>
          ) : (
            pricingRows
              .filter((r) => !r.is_site_visit && (!r.property_type || r.property_type === propertyType))
              .map((row) => (
                <button key={row.id} onClick={() => setSelectedPricing(row)}
                  className={cn('w-full p-4 rounded-xl border text-left transition-all',
                    selectedPricing?.id === row.id ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white hover:border-emerald-300'
                  )}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm text-gray-800">{row.unit_label}</p>
                      {row.price_note && <p className="text-xs text-gray-500 mt-0.5">{row.price_note}</p>}
                    </div>
                    <p className="font-bold text-emerald-600">{row.price ? `$${row.price}` : 'POA'}</p>
                  </div>
                </button>
              ))
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={goBack} className="flex-1"><ChevronLeft className="w-4 h-4" />Back</Button>
            <Button onClick={() => setStep('addons')} disabled={!selectedPricing} className="flex-1">Next<ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      )}

      {/* STEP: ADDONS */}
      {step === 'addons' && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-gray-800">Add-Ons (Optional)</h2>
          {addonRows.filter((r) => !r.is_site_visit && (!r.property_type || r.property_type === propertyType)).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-3">No add-ons available for this service.</p>
          ) : (
            addonRows
              .filter((r) => !r.is_site_visit && (!r.property_type || r.property_type === propertyType))
              .map((addon) => {
                const selected = !!selectedAddons[addon.addon_group];
                return (
                  <button key={addon.id}
                    onClick={() => setSelectedAddons((prev) => {
                      const next = { ...prev };
                      if (selected) delete next[addon.addon_group];
                      else next[addon.addon_group] = addon;
                      return next;
                    })}
                    className={cn('w-full p-4 rounded-xl border text-left transition-all',
                      selected ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white hover:border-emerald-300'
                    )}>
                    <div className="flex justify-between items-start">
                      <p className="text-sm font-medium text-gray-800">{addon.unit_label}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-emerald-600">{addon.price ? `+$${addon.price}` : 'POA'}</p>
                        {selected && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                      </div>
                    </div>
                  </button>
                );
              })
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={goBack} className="flex-1"><ChevronLeft className="w-4 h-4" />Back</Button>
            <Button onClick={() => setStep('contact')} className="flex-1">Next<ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      )}

      {/* STEP: CONTACT */}
      {step === 'contact' && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-gray-800">Your Contact Details</h2>
          <div>
            <label className="text-xs font-medium text-gray-600">Full Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" placeholder="e.g. John Tan" />
            {contactErrors.name && <p className="text-xs text-red-600 mt-1">{contactErrors.name}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Phone / WhatsApp *</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" placeholder="+65 9123 4567" type="tel" />
            {contactErrors.phone && <p className="text-xs text-red-600 mt-1">{contactErrors.phone}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Email</label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" placeholder="optional" type="email" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Address *</label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1" placeholder="Full unit address" />
            {contactErrors.address && <p className="text-xs text-red-600 mt-1">{contactErrors.address}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" placeholder="Access instructions, special requests…" rows={2} />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={goBack} className="flex-1"><ChevronLeft className="w-4 h-4" />Back</Button>
            <Button onClick={() => { if (validateContact()) setStep('confirm'); }} className="flex-1">Review<ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      )}

      {/* STEP: CONFIRM */}
      {step === 'confirm' && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-gray-800">Confirm Booking</h2>
          <Card>
            <CardContent className="p-4 space-y-3 text-sm">
              <Row label="Service" value={SERVICES.find((s) => s.key === service)?.label || ''} />
              <Row label="Type" value={subtype} />
              <Row label="Date" value={selectedDate?.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'long' }) || ''} />
              <Row label="Time" value={slot?.label || ''} />
              <Row label="Property" value={propertyType?.toUpperCase() || ''} />
              <Row label="Size" value={selectedPricing?.unit_label || 'N/A'} />
              {Object.values(selectedAddons).map((a) => (
                <Row key={a.id} label="Add-on" value={`${a.unit_label} (+$${a.price})`} />
              ))}
              <hr className="border-gray-100" />
              <Row label="Name" value={name} />
              <Row label="Phone" value={phone} />
              <Row label="Address" value={address} />
              <hr className="border-gray-100" />
              <div className="flex justify-between font-bold text-base">
                <span className="text-gray-700">Estimated Total</span>
                <span className="text-emerald-600">${totalPrice.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
          <div className="flex gap-3">
            <Button variant="outline" onClick={goBack} className="flex-1"><ChevronLeft className="w-4 h-4" />Back</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Booking'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-gray-800 font-medium text-right">{value || '—'}</span>
    </div>
  );
}
