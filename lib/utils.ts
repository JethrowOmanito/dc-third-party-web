import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Re-export from centralised rate limiter (uses globalThis for cross-request persistence)
export { checkRateLimit, resetRateLimit } from '@/lib/rate-limit';


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

export function getServiceDisplayName(type: string): string {
  const key = (type || '').toLowerCase().trim();
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
