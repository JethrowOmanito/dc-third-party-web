'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ServiceKey, BookingStep, PricingRow, AddonRow, BookingSlot, HousekeepingPricingRow, PartnerBrand } from '@/types';

interface BookingState {
  step: BookingStep;
  service: ServiceKey | null;
  bookingMode: 'general' | 'deep' | null;
  date: string | null;
  slot: BookingSlot | null;
  subtype: string;
  subcategoryKey: string;
  propertyType: 'hdb' | 'condo' | null;
  selectedPricing: PricingRow | null;
  selectedHKPricing: HousekeepingPricingRow | null;
  selectedAddons: Record<string, AddonRow>;
  postalCode: string;
  fetchedAddress: string;
  unitNumber: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  contactNotes: string;
  partnerBrand: PartnerBrand | null;
  setStep: (step: BookingStep) => void;
  setService: (s: ServiceKey) => void;
  setBookingMode: (m: 'general' | 'deep' | null) => void;
  setDate: (d: string) => void;
  setSlot: (slot: BookingSlot) => void;
  setSubtype: (s: string, key?: string) => void;
  setPropertyType: (p: 'hdb' | 'condo') => void;
  setSelectedPricing: (p: PricingRow) => void;
  setSelectedHKPricing: (p: HousekeepingPricingRow | null) => void;
  setSelectedAddons: (addons: Record<string, AddonRow>) => void;
  setPostal: (code: string, address: string, unit?: string) => void;
  setContact: (fields: Partial<Pick<BookingState, 'contactName' | 'contactPhone' | 'contactEmail' | 'contactNotes'>>) => void;
  setPartnerBrand: (brand: PartnerBrand | null) => void;
  reset: () => void;
}

const initialState = {
  step: 'service' as BookingStep,
  service: null,
  bookingMode: null,
  date: null,
  slot: null,
  subtype: '',
  subcategoryKey: '',
  propertyType: null,
  selectedPricing: null,
  selectedHKPricing: null,
  selectedAddons: {},
  postalCode: '',
  fetchedAddress: '',
  unitNumber: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  contactNotes: '',
  partnerBrand: null as PartnerBrand | null,
};

export const useBookingStore = create<BookingState>()(
  persist(
    (set) => ({
      ...initialState,
      setStep: (step) => set({ step }),
      setService: (service) => set({ service, bookingMode: null, subtype: '', subcategoryKey: '', propertyType: null, selectedPricing: null, selectedHKPricing: null, selectedAddons: {} }),
      setBookingMode: (bookingMode) => set({ bookingMode }),
      setDate: (date) => set({ date }),
      setSlot: (slot) => set({ slot }),
      setSubtype: (subtype, key) => set({ subtype, subcategoryKey: key ?? subtype }),
      setPropertyType: (propertyType) => set({ propertyType }),
      setSelectedPricing: (selectedPricing) => set({ selectedPricing }),
      setSelectedHKPricing: (selectedHKPricing) => set({ selectedHKPricing }),
      setSelectedAddons: (selectedAddons) => set({ selectedAddons }),
      setPostal: (postalCode, fetchedAddress, unitNumber = '') => set({ postalCode, fetchedAddress, unitNumber }),
      setContact: (fields) => set((s) => ({ ...s, ...fields })),
      setPartnerBrand: (partnerBrand) => set({ partnerBrand }),
      reset: () => set(initialState),
    }),
    {
      // v2: added partnerBrand for ID users (tcc / doctor_clean_id / agents).
      // Bump so persisted state from before the brand selector clears out.
      name: 'dc-partner-booking-v2',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? sessionStorage : localStorage
      ),
    }
  )
);
