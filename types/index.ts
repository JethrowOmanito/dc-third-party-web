export interface User {
  id: string;
  username: string;
  name?: string;
  email?: string;
  whatsapp_phone?: string;
  company_id?: string | null;
  company_name?: string;
  company_code?: string;
  company_type?: string;
  company_discount_type?: 'percent' | 'flat' | null;
  company_discount_value?: number;
  company_payment_terms?: 'upfront' | 'end_of_month' | null;
  // Onboarding lifecycle for the partner company (added Phase 1).
  // ID admins whose company_status !== 'approved' are routed to
  // /dashboard/onboarding/company before they can access the wizard.
  company_status?: 'draft' | 'pending' | 'approved' | 'rejected';
  partner_tier?: string;
  approval_status?: 'pending' | 'approved' | 'rejected';
  // Values 'admin' | 'employee' are the new RBAC targets. Older values
  // ('interior_designer' | 'agent' | 'other') stay until Phase 2 cleanup
  // migration flips them (existing ID users will be wiped first).
  partner_role?: 'admin' | 'employee' | 'interior_designer' | 'agent' | 'other' | null;
}

export interface Job {
  id: string;
  Title: string;
  Start_Date: string;
  End_Date?: string;
  Start_Time: string;
  End_Time: string;
  Start_Time_Display: string;
  End_Time_Display: string;
  Service_Type: string;
  service_subtype?: string | null;
  Note?: string;
  Assign_Cleaner: string[];
  Extra_Service?: string[];
  upload_files?: string[];
  calendar_id?: string;
  owned_by_third_party?: string;
  Name?: string;
  Email?: string;
  Price?: number;
  final_price?: number;
  gst_rate?: number;
  gst_amount?: number;
  commission_percentage?: number;
  rebate_amount?: number;
  company_reference?: string;
  on_my_way_sent_at?: string;
  on_my_way_eta?: string;
  on_my_way_sent_by?: string;
  on_my_way_sent_by_name?: string;
  lifecycle_state?: string;
  display_status?: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED';
}

export interface ClockRecord {
  id: string;
  job_id: string;
  user_id: string;
  username: string;
  clock_in_time: string;
  clock_out_time?: string;
  status: 'clocked_in' | 'clocked_out';
  created_at: string;
  updated_at: string;
}

export interface ServiceReport {
  id: string;
  job_id: string;
  customer_name?: string;
  address?: string;
  phone?: string;
  email?: string;
  service_date?: string;
  signature: boolean;
  signature_url?: string;
  ack_date?: string;
  not_clean_areas?: string;
  photos?: string[];
  videos?: string[];
  rating?: number;
  Extra_Service?: string[];
  created_at: string;
}

export interface ChecklistItem {
  id: number;
  section: string;
  item: string;
  sort_order: number;
}

export interface ChecklistResponse {
  item_id: number;
  report_id: string;
  status: 'done' | 'not_done' | 'na';
  note?: string;
}

export interface ChatMessage {
  id: string;
  event_id: string;
  user: string;
  user_id: string | null;
  message: string;
  sender_role: string;
  is_read: boolean;
  created_at: string;
}

export interface GuestSession {
  isGuest: true;
  eventId: string;
  customerName: string;
}

export interface BookingSlot {
  label: string;
  start: string;
  end: string;
  additionalFee?: number;
}

export interface Service {
  id: number;
  name: string;
  color?: string;
}

export interface PricingRow {
  id: number;
  category: string;
  subcategory: string | null;
  subcategory_label: string | null;
  property_type: string | null;
  unit_label: string;
  price: number | null;
  promo_price: number | null;
  partner_price: number | null;
  duration_hours: number | null;
  sessions: number;
  price_note: string | null;
  sort_order: number;
  is_site_visit: boolean;
  is_active?: boolean;
}

export interface AddonRow {
  id: number;
  addon_group: string;
  addon_group_label: string;
  property_type: string | null;
  unit_label: string;
  price: number | null;
  price_note: string | null;
  sort_order: number;
  is_site_visit: boolean;
}

export interface HousekeepingPricingRow {
  hours: number;
  price: number;
  label: string;
  session_type?: string;
}

export interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_booking_amount: number;
}

export interface AdditionalService {
  id: number;
  name: string;
  parent_service: string;
  price?: number | null;
  price_note?: string | null;
  description?: string | null;
  color?: string | null;
  sort_order?: number | null;
  allowed_job_types?: string[] | null;
}

export type ProgressStep = 'not_ready' | 'in_transit' | 'started' | 'completed';

export type ServiceKey =
  | 'deep_cleaning'
  | 'housekeeping'
  | 'upholstery'
  | 'curtain'
  | 'scrubbing_machine'
  | 'formaldehyde_removal'
  | 'coating'
  | 'disinfection'
  | 'office'
  | 'window_cleaning'
  | 'blinds';

export type PropertyType = 'hdb' | 'condo';

export type BookingStep =
  | 'service'
  | 'type_selection'
  | 'hk_postal'
  | 'duration'
  | 'subtype'
  | 'property'
  | 'size'
  | 'datetime'
  | 'addons'
  | 'contact'
  | 'terms'
  | 'confirm';

// Partner brand — drives which pricing catalog the booking wizard reads.
//   tcc            → tcc_pricing (The Cleaning Crew — ID users, standard)
//   doctor_clean_id→ id_pricing  (Doctor Clean ID — ID users, deep + rebate)
//   agents         → service_pricing.partner_price (property_manager flow)
export type PartnerBrand = 'tcc' | 'doctor_clean_id' | 'agents';

// TCC / ID pricing table row (identical schema for tcc_pricing and id_pricing).
export interface TccIdPricingRow {
  id: number;
  section: 'post_renovation_hdb' | 'post_renovation_condo' | 'ala_carte_first_wash' | string;
  subgroup: string | null;
  unit_label: string;
  sqft_label: string | null;
  ala_carte_price: number | string | null;
  scrubbing_price: number | string | null;
  scrubbing_formaldehyde_price: number | string | null;
  is_tbq: boolean;
  sort_order: number;
  is_active: boolean;
}

// One of the three tiers a user can pick per HDB/Condo unit type.
export type TccIdTier = 'ala_carte' | 'scrubbing' | 'scrubbing_formaldehyde';

export interface TccIdSelection {
  row: TccIdPricingRow;
  tier: TccIdTier;
  price: number;
}
