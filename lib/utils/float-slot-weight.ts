/**
 * Float service slot capacity weights based on property sqft.
 * Ported from booking-web/lib/utils/float-slot-weight.ts — both sites
 * must reserve slots the same way, otherwise capacity accounting
 * drifts between the retail and partner-portal flows.
 *
 * Rules (by lower bound of the sqft range stored in Unit_sub_type):
 *   < 1501 sqft  → primary=1, secondary=0
 *   1501–1900    → primary=2, secondary=0  (2 teams, same time block)
 *   1901–2299    → primary=2, secondary=1  (booked slot + 1 from paired slot)
 *   ≥ 2300       → primary=2, secondary=2  (2 from both AM and PM slots)
 *
 * Handles unit_sub_type formats:
 *   "400 - 550 sqft"     (admin form bands)
 *   "1521sqft - 1600sqft" (pricing table bands)
 *   "2300 sqft & above"  (admin form large band)
 *   "below 350sqft"      → treated as 0 (1 slot)
 *   "1 Room", "Terrace"  → no sqft → fall back to unit_type
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
  unitType: string | null | undefined,
  unitSubType: string | null | undefined,
): { primary: number; secondary: number } {
  const lower = getFloatLowerSqft(unitSubType);

  if (lower !== null) {
    if (lower >= 2300) return { primary: 2, secondary: 2 };
    if (lower >= 1901) return { primary: 2, secondary: 1 };
    if (lower >= 1501) return { primary: 2, secondary: 0 };
    return { primary: 1, secondary: 0 };
  }

  if (unitType === 'Landed' || unitType === 'landed') return { primary: 2, secondary: 0 };
  return { primary: 1, secondary: 0 };
}
