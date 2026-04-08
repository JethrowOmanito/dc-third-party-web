export interface User {
  id: string;
  username: string;
  role: string;
  privilege: number;
  service_assigned?: string[];
  company_name?: string;
  company_code?: string;
  company_type?: string;
  can_create_jobs?: boolean;
  can_view_all_jobs?: boolean;
  whatsapp_phone?: string;
  color_label?: string;
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
  Note?: string;
  Assign_Cleaner: string[];
  Extra_Service?: string[];
  upload_files?: string[];
  calendar_id?: string;
  owned_by_third_party?: string;
  Name?: string;
  Email?: string;
  Price?: number;
  owned_by_third_party?: string;
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
  subcategory: string;
  property_type: string | null;
  unit_label: string;
  price: number | null;
  duration_hours: number | null;
  sessions: number;
  price_note: string | null;
  sort_order: number;
  is_site_visit: boolean;
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

export type ProgressStep = 'not_ready' | 'in_transit' | 'started' | 'completed';

export type ServiceKey = 'deep_cleaning' | 'housekeeping' | 'upholstery' | 'curtain';
export type PropertyType = 'hdb' | 'condo';

export type BookingStep =
  | 'service'
  | 'datetime'
  | 'subtype'
  | 'property_type'
  | 'size'
  | 'addons'
  | 'contact'
  | 'confirm';
