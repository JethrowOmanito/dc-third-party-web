'use client';
import { create } from 'zustand';
import type { ServiceKey, BookingStep, PricingRow, AddonRow, BookingSlot } from '@/types';

interface BookingState {
  step: BookingStep;
  service: ServiceKey | null;
  date: string | null;
  slot: BookingSlot | null;
  subtype: string | null;
  propertyType: 'hdb' | 'condo' | null;
  selectedPricing: PricingRow | null;
  selectedAddons: Record<string, AddonRow>;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
  contactNotes: string;
  setStep: (step: BookingStep) => void;
  setService: (s: ServiceKey) => void;
  setDate: (d: string) => void;
  setSlot: (slot: BookingSlot) => void;
  setSubtype: (s: string) => void;
  setPropertyType: (p: 'hdb' | 'condo') => void;
  setSelectedPricing: (p: PricingRow) => void;
  setSelectedAddons: (addons: Record<string, AddonRow>) => void;
  setContact: (fields: Partial<Pick<BookingState, 'contactName' | 'contactPhone' | 'contactEmail' | 'contactAddress' | 'contactNotes'>>) => void;
  reset: () => void;
}

const initialState = {
  step: 'service' as BookingStep,
  service: null,
  date: null,
  slot: null,
  subtype: null,
  propertyType: null,
  selectedPricing: null,
  selectedAddons: {},
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  contactAddress: '',
  contactNotes: '',
};

export const useBookingStore = create<BookingState>()((set) => ({
  ...initialState,
  setStep: (step) => set({ step }),
  setService: (service) => set({ service, subtype: null, propertyType: null, selectedPricing: null, selectedAddons: {} }),
  setDate: (date) => set({ date }),
  setSlot: (slot) => set({ slot }),
  setSubtype: (subtype) => set({ subtype }),
  setPropertyType: (propertyType) => set({ propertyType }),
  setSelectedPricing: (selectedPricing) => set({ selectedPricing }),
  setSelectedAddons: (selectedAddons) => set({ selectedAddons }),
  setContact: (fields) => set((s) => ({ ...s, ...fields })),
  reset: () => set(initialState),
}));
