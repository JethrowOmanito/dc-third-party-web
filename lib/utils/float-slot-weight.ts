/**
 * Float service slot capacity weights based on property sqft.
 * Ported from booking-web/lib/utils/float-slot-weight.ts — both sites
 * must reserve slots the same way, otherwise capacity accounting
 * drifts between the retail and partner-portal flows.
 *
 * 2026-11-01 rule (Ganesh): Unit_type is a hint only — sqft decides.
 *   sqft ≥ 1600    → primary=2
 *   sqft < 1600    → primary=1
 *   sqft ≥ 2200    → secondary=2
 *   sqft ≥ 2000    → secondary=1
 *   else           → secondary=0
 *
 * Mirrors DB public.float_primary_weight() + public.float_secondary_weight().
 */
export function getFloatLowerSqft(sub: string | null | undefined): number | null {
  if (!sub) return null;
  const l = sub.toLowerCase();
  if (!l.includes('sqft')) return null;
  if (l.startsWith('below')) return 0;
  const m = sub.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export function getFloatSlotWeight(
  _unitType: string | null | undefined,
  unitSubType: string | null | undefined,
): { primary: number; secondary: number } {
  const lower = getFloatLowerSqft(unitSubType) ?? 0;
  const primary = lower >= 1600 ? 2 : 1;
  const secondary = lower >= 2200 ? 2 : lower >= 2000 ? 1 : 0;
  return { primary, secondary };
}
