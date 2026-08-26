import { createClient } from '@/lib/supabase/server';

/**
 * Converts "HH:MM AM/PM" or "HH:MM:SS" to minutes since midnight for comparison.
 */
function toMinutes(t: string | null | undefined): number {
  if (!t) return 0;
  
  // Handle 24h format (HH:MM:SS or HH:MM)
  if (t.includes(':') && !t.includes(' ')) {
    const parts = t.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
  }

  // Handle 12h format ("9:00 AM")
  const match = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return 0;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3]?.toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

export interface AvailabilityResult {
  available: boolean;
  reason?: string;
  errorCode?: 'CAPACITY_FULL' | 'NO_CLEANERS' | 'INVALID_TIME' | 'DURATION_TOO_SHORT';
}

const SERVICE_MAP: Record<string, string> = {
  'deep_cleaning': 'Float',
  'housekeeping': 'Housekeeping',
  'office': 'Housekeeping',
  'upholstery': 'Upholstery',
  'curtain': 'Curtain',
};

// SOP Constants
const HOUSEKEEPING_MIN_MINUTES = 120; // 2 hours
const TRAVEL_BUFFER_MINUTES = 60; // 1 hour travel buffer
const BREAK_BUFFER_MINUTES = 60; // 1 hour cleaner break

/**
 * Validates if a booking slot is truly available based on:
 * 1. The Capacity table (limit 5/5/2 for Float).
 * 2. SOP rules (Travel buffers, Breaks).
 * 3. Exhaustive search: if cleaner 1 is busy, check cleaner 2, 3, etc.
 */
export async function validateBookingAvailability(
  serviceKey: string,
  date: string,
  startTimeDisplay: string,
  endTimeDisplay: string,
  durationOverrideMins?: number,
  propertyType?: string
): Promise<AvailabilityResult> {
  const supabase = await createClient();
  const dbService = SERVICE_MAP[serviceKey] || serviceKey;
  
  const startTimeMins = toMinutes(startTimeDisplay);
  const endTimeMins = toMinutes(endTimeDisplay);
  const durationMins = durationOverrideMins || (endTimeMins - startTimeMins);

  // 1. SOP Check: Housekeeping specific rules
  if (dbService === 'Housekeeping') {
    // 1a. Min 2 hours
    if (durationMins < HOUSEKEEPING_MIN_MINUTES) {
      return {
        available: false,
        reason: 'Housekeeping sessions must be at least 2 hours.',
        errorCode: 'DURATION_TOO_SHORT'
      };
    }

    // 1b. Hours of operation (9 AM - 11 PM)
    const minTime = toMinutes('9:00 AM');
    const maxTime = toMinutes('11:00 PM');
    if (startTimeMins < minTime || endTimeMins > maxTime) {
      return { 
        available: false, 
        reason: 'Housekeeping is only available from 9:00 AM to 11:00 PM.',
        errorCode: 'INVALID_TIME' 
      };
    }
  }

  // 2. Check Capacity Table (Fixed daily slot limits)
  const { data: capRecords, error: capError } = await supabase
    .from('Capacity')
    .select('id, capacity, booked_count, Start_Time, End_Time')
    .eq('date_capacity', date)
    .eq('service', dbService);

  if (capError) throw capError;

  if (capRecords && capRecords.length > 0) {
    const slotRecord = capRecords.find(r => {
      if (!r.Start_Time) return false;
      const dbStartMins = toMinutes(r.Start_Time);
      return Math.abs(dbStartMins - startTimeMins) < 15; // Within 15 min tolerance
    });

    if (slotRecord) {
      const booked = slotRecord.booked_count || 0;
      const limit = slotRecord.capacity || 0;
      const slotsNeeded = (dbService === 'Float' && propertyType === 'landed') ? 2 : 1;
      if (booked + slotsNeeded > limit) {
        return {
          available: false,
          reason: `The ${startTimeDisplay} slot is fully booked for ${dbService} (${booked}/${limit}).`,
          errorCode: 'CAPACITY_FULL'
        };
      }
    }
  }

  // 3. Exhaustive Cleaner Availability Check
  // Get all cleaners assigned to this service
  const { data: cleaners, error: cleanerError } = await supabase
    .from('user')
    .select('id, username, service_assigned')
    .eq('role', 'cleaner')
    .contains('service_assigned', [dbService]);

  if (cleanerError) throw cleanerError;
  if (!cleaners || cleaners.length === 0) {
    // Fallback: search all cleaners if no service-specific ones found
    const { data: allCleaners } = await supabase.from('user').select('id, username').eq('role', 'cleaner');
    if (!allCleaners || allCleaners.length === 0) {
      return { available: false, reason: 'No cleaners are registered in the system.', errorCode: 'NO_CLEANERS' };
    }
  }

  const cleanerPool = cleaners || [];

  // Fetch all jobs for this date to check individual conflicts
  const { data: jobs } = await supabase
    .from('events')
    .select('id, Assign_Cleaner, Start_Time, End_Time, Start_Time_Display, End_Time_Display')
    .eq('Start_Date', date)
    .eq('lifecycle_state', 'active');

  // Fetch all breaks/leave for this date
  const { data: breaks } = await supabase
    .from('cleaner_breaks')
    .select('user_id, start_time, end_time, break_type')
    .eq('break_date', date);

  const { data: leaves } = await supabase
    .from('leave_requests')
    .select('user_id')
    .eq('status', 'approved')
    .lte('start_date', date)
    .gte('end_date', date);

  const onLeaveUsers = new Set((leaves || []).map(l => l.user_id));

  // Try to find ANY available cleaner
  let foundAvailableCleaner = false;
  
  for (const cleaner of cleanerPool) {
    // Skip if on leave
    if (onLeaveUsers.has(cleaner.id)) continue;

    let hasConflict = false;

    // Check Job Conflicts + Travel Buffer
    const cleanerJobs = (jobs || []).filter(j => j.Assign_Cleaner?.includes(cleaner.username));
    for (const job of cleanerJobs) {
      const jobStart = toMinutes(job.Start_Time_Display || job.Start_Time);
      const jobEnd = toMinutes(job.End_Time_Display || job.End_Time);
      
      // Basic Overlap check
      if (startTimeMins < jobEnd && endTimeMins > jobStart) {
        hasConflict = true;
        break;
      }

      // SOP: 1-hour Travel Buffer between jobs (only for Housekeeping)
      if (dbService === 'Housekeeping') {
        // If job B starts after job A ends
        if (startTimeMins >= jobEnd && startTimeMins < jobEnd + TRAVEL_BUFFER_MINUTES) {
          hasConflict = true;
          break;
        }
        // If job A starts after job B ends
        if (jobStart >= endTimeMins && jobStart < endTimeMins + TRAVEL_BUFFER_MINUTES) {
          hasConflict = true;
          break;
        }
      }
    }

    if (hasConflict) continue;

    // Check Cleaner Breaks (1h scheduled break)
    const cleanerBreaks = (breaks || []).filter(b => b.user_id === cleaner.id);
    for (const b of cleanerBreaks) {
      if (b.break_type === 'day_off') {
        hasConflict = true;
        break;
      }
      
      const breakStart = toMinutes(b.start_time);
      const breakEnd = toMinutes(b.end_time);

      // Overlap with break
      if (startTimeMins < breakEnd && endTimeMins > breakStart) {
        hasConflict = true;
        break;
      }
      
      // SOP: 1-hour gap between break and job for housekeeping
      if (dbService === 'Housekeeping') {
        if (startTimeMins >= breakEnd && startTimeMins < breakEnd + BREAK_BUFFER_MINUTES) {
          hasConflict = true;
          break;
        }
        if (breakStart >= endTimeMins && breakStart < endTimeMins + BREAK_BUFFER_MINUTES) {
          hasConflict = true;
          break;
        }
      }
    }

    if (!hasConflict) {
      foundAvailableCleaner = true;
      break;
    }
  }

  if (!foundAvailableCleaner) {
    return { 
      available: false, 
      reason: 'No available cleaners for this time slot (checking travel buffers and breaks).',
      errorCode: 'NO_CLEANERS'
    };
  }

  return { available: true };
}

