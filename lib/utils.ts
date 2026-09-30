import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Converts "9:00 AM" / "2:00 PM" → "09:00" (24h) */
export function convertTo24Hour(timeStr: string | undefined): string | null {
  if (!timeStr) return null;
  const [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function isValidSGPostal(code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const district = parseInt(code.slice(0, 2), 10);
  return district >= 1 && district <= 80;
}

export function isServiceablePostal(code: string): boolean {
  return isValidSGPostal(code);
}

// Re-export from centralised rate limiter (uses globalThis for cross-request persistence)
export { checkRateLimit, resetRateLimit } from '@/lib/rate-limit';

// ── Same-day lead-time gate ─────────────────────────────────────────────────
// Ported from booking-web (lib/utils.ts) so partner + customer bookings
// share the same rule. Partners cannot book a slot that starts within the
// lead window. Applies only to same-day (SGT); future dates always pass.
// Two hours default — gives cleaners time to prep + travel.
export const SAME_DAY_LEAD_MINS = 120;

function parseDisplayToMins(display: string): number | null {
  const m = display.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + mm;
}

/**
 * True if the slot start on the given YMD date is closer than
 * SAME_DAY_LEAD_MINS from now (SGT). Slots on future dates always return
 * false. Example: at 5 PM SGT, any slot on today whose start ≤ 6:59 PM
 * returns true (6 PM blocked; 7 PM bookable — 2 h lead).
 */
export function isSlotTooSoon(
  dateYMD: string,
  slotStartDisplay: string,
  leadTimeMins: number = SAME_DAY_LEAD_MINS,
): boolean {
  if (!dateYMD || !slotStartDisplay) return false;
  const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
  const nowSgtMs = Date.now() + SGT_OFFSET_MS;
  const todayYMD = new Date(nowSgtMs).toISOString().slice(0, 10);
  if (dateYMD !== todayYMD) return false; // only gates same-day
  const nowMins =
    new Date(nowSgtMs).getUTCHours() * 60 + new Date(nowSgtMs).getUTCMinutes();
  const slotMins = parseDisplayToMins(slotStartDisplay);
  if (slotMins === null) return false;
  return slotMins < nowMins + leadTimeMins;
}


export function formatDate(dateStr?: string) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-SG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatTime(timeStr?: string) {
  if (!timeStr) return '—';
  return timeStr;
}

export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

export const SERVICE_DISPLAY_NAMES: Record<string, string> = {
  float: 'Deep Cleaning',
  curtain: 'Curtain Cleaning',
  housekeeping: 'Regular Housekeeping',
  office: 'Office Cleaning',
  'office cleaning': 'Office Cleaning',
  carpet: 'Carpet Cleaning',
  mattress: 'Mattress Cleaning',
  sofa: 'Sofa Cleaning',
  upholstery: 'Upholstery Cleaning',
  aircon: 'Aircon Cleaning',
  'aircon cleaning': 'Aircon Cleaning & Servicing',
  disinfection: 'Disinfection Service',
  'deep cleaning': 'Deep Cleaning',
  'deep clean': 'Deep Cleaning',
  'move in': 'Move-In Cleaning',
  'move out': 'Move-Out Cleaning',
  'post renovation': 'Post Renovation Cleaning',
  scrubbing: 'Scrubbing Machine',
};

export const SERVICE_COLORS: Record<string, string> = {
  float: '#3B82F6',
  curtain: '#8B5CF6',
  housekeeping: '#10B981',
  office: '#0EA5E9',
  carpet: '#F59E0B',
  mattress: '#EC4899',
  sofa: '#06B6D4',
  upholstery: '#14B8A6',
  aircon: '#0284C7',
  disinfection: '#EF4444',
  scrubbing: '#6366F1',
};

export function getServiceDisplayName(type: string, serviceSubtype?: string | null): string {
  const key = (type || '').toLowerCase().trim();
  if (key === 'float') return serviceSubtype || SERVICE_DISPLAY_NAMES['float'] || type;
  return SERVICE_DISPLAY_NAMES[key] || type;
}

export function getServiceColor(type: string): string {
  const key = (type || '').toLowerCase().trim();
  return SERVICE_COLORS[key] || '#64748b';
}

export function getProgressStepIndex(lifecycle: string): number {
  const map: Record<string, number> = {
    not_ready: 0,
    in_transit: 1,
    started: 2,
    completed: 3,
  };
  return map[lifecycle] ?? 0;
}
