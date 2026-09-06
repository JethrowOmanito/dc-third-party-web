// Scope-of-work definitions for Deep Cleaning subtypes. Ported from
// booking-web/lib/scope-of-work.ts so the wizard shows the same
// included / excluded list the marketing site shows.

export interface ScopeOfWork {
  serviceTitle: string;
  scope: string[];
  excluded: string[];
  heightNote?: string;
}

export const TOOLS_AND_CHEMICALS: string[] = [
  'Vacuum',
  'Mop',
  'Cloth(s)',
  'Ladder',
  'Cleaning solutions',
  'Pail',
  'Scrapper',
  'Brush(es)',
  'Toilet brush',
  'Sponge(s)',
];

export const DEFAULT_HEIGHT_NOTE =
  'Height must be 3 meters and below. Additional charges may apply for cleaning above 3 meters.';

export const POST_RENOVATION_SCOPE: ScopeOfWork = {
  serviceTitle: 'Post Renovation',
  heightNote: DEFAULT_HEIGHT_NOTE,
  scope: [
    'Empty cabinets (interior & exterior) — 3 meters & below',
    'Ceiling fans',
    'Window glass & grilles — 3 meters & below',
    'Floors (vacuum, mop)',
    'Skirtings',
    'Tiled walls — chemical wash',
    'Toilet(s) — chemical wash',
    'Toilet accessories / sink / toilet bowl',
    'Bomb shelter',
    'Service yard',
    'Balcony',
    'Fixtures — 3 meters & below (lights, lamps, plug sockets, mirrors)',
    'Doors & gates & glass door',
    'New stove / hood / oven / fridge (external)',
    'Dusting of painted wall / ceiling (no stain removal)',
    'Aircon (external only)',
  ],
  excluded: [
    'Packing, unpacking, heavy shifting',
    'Heavy-duty stain removal (rusts, adhesive stains, excessive paint stains)',
    'Upholstery (sofa, mattresses, carpets, curtains, bedsheets)',
    'Blinds (any type)',
    'Personal belongings (cups, plates, etc)',
    'Degreasing kitchen / grout cleaning',
    'Painted walls stain removal / wet wipe down',
    'Wall fans',
    'Disposal & removal of construction waste',
    'Aircon ledge / any area outside of house',
  ],
};

export const TENANCY_MOVE_IN_SCOPE: ScopeOfWork = {
  serviceTitle: 'Tenancy (Move-In)',
  heightNote: DEFAULT_HEIGHT_NOTE,
  scope: [
    'Empty cabinets — 3 meters & below (interior & exterior)',
    'Ceiling fans — 3 meters & below',
    'Window glass & grilles',
    'Floors (vacuum, mop)',
    'Skirtings',
    'Tiled walls — degreasing',
    'Toilet(s) — chemical wash',
    'Toilet accessories / sink / toilet bowl',
    'Bomb shelter',
    'Service yard & service yard',
    'Fixtures — 3 meters & below (lights, lamps, plug sockets, mirrors)',
    'Doors & gates & glass door',
    'Degreasing of stove & hood',
    'Empty fridge (internal & external)',
    'Washing machine (general)',
    'Oven / Microwave degreasing (general)',
    'Dusting of painted wall (no stain removal)',
  ],
  excluded: [
    'Packing, unpacking, heavy shifting',
    'Heavy-duty stain removal (rusts, adhesive stains, paint stains)',
    'Upholstery (sofa, mattresses, carpets, curtains, bedsheets)',
    'Blinds (any type) & window mesh',
    'Personal belongings (cups, plates, etc)',
    'Heavy degreasing / grout cleaning',
    'Painted walls stain removal / wet wipe down',
    'Wall fans',
    'Disposal & removal of waste',
    'Aircon ledge / any area outside of house',
  ],
};

export const TENANCY_MOVE_OUT_SCOPE: ScopeOfWork = {
  serviceTitle: 'Tenancy (Move-Out)',
  heightNote: DEFAULT_HEIGHT_NOTE,
  scope: [
    'Empty cabinets — 3 meters & below (interior & exterior)',
    'Ceiling fans — 3 meters & below',
    'Window glass & grilles',
    'Floors (vacuum, mop)',
    'Skirtings',
    'Tiled walls — degreasing',
    'Toilet(s) — chemical wash',
    'Toilet accessories / sink / toilet bowl',
    'Bomb shelter',
    'Balcony & Service yard',
    'Fixtures — 3 meters & below (lights, lamps, plug sockets, mirrors)',
    'Doors & gates & glass door',
    'Degreasing of stove & hood',
    'Washing machine (general)',
    'Empty fridge (internal & external)',
    'Oven / Microwave degreasing (general)',
    'Dusting of painted wall (no stain removal)',
  ],
  excluded: [
    'Packing, unpacking, heavy shifting',
    'Heavy-duty stain removal (rusts, adhesive stains, paint stains)',
    'Upholstery (sofa, mattresses, carpets, curtains, bedsheets)',
    'Blinds (any type) & window mesh',
    'Personal belongings (cups, plates, etc)',
    'Heavy degreasing / grout cleaning',
    'Painted walls stain removal / wet wipe down',
    'Wall fans',
    'Disposal & removal of waste',
    'Aircon ledge / any area outside of house',
  ],
};

export const SPRING_CLEANING_SCOPE: ScopeOfWork = {
  serviceTitle: 'Spring Cleaning',
  heightNote: DEFAULT_HEIGHT_NOTE,
  scope: [
    'External cabinets — 3 meters & below',
    'Ceiling fans — 3 meters & below',
    'Wall fan / standing fan (if any)',
    'Window glass & grilles',
    'Floors (vacuum, mop)',
    'Skirtings',
    'Tiled walls — degreasing',
    'Toilet(s) — chemical wash',
    'Toilet accessories / sink / toilet bowl',
    'Blinds / window mesh (if any)',
    'Service yard',
    'Balcony',
    'Fixtures — 3 meters & below (lights, lamps, plug sockets, mirrors)',
    'Doors & gates & glass door',
    'Degreasing of stove & hood',
    'Fridge (external only)',
    'Oven / Microwave degreasing (general)',
    'Dusting of painted wall / ceiling',
  ],
  excluded: [
    'Packing, unpacking, heavy shifting',
    'Heavy-duty stain removal (rusts, adhesive stains, paint stains)',
    'Upholstery (sofa, mattresses, carpets, curtains, bedsheets)',
    'Personal belongings (cups, plates, etc)',
    'Heavy degreasing / grout cleaning',
    'Painted walls stain removal / wet wipe down',
    'Disposal & removal of large / heavy waste (general trash waste is included)',
    'Aircon ledge / any area outside of house',
  ],
};

export const HIP_CLEANING_SCOPE: ScopeOfWork = {
  serviceTitle: 'HIP Cleaning',
  heightNote: DEFAULT_HEIGHT_NOTE,
  scope: [
    'External cabinets — 3 meters & below',
    'Ceiling fans — 3 meters & below',
    'Wall fan / standing fan (if any)',
    'Window glass & grilles',
    'Floors (vacuum, mop)',
    'Skirtings',
    'Tiled walls — degreasing',
    'Toilet(s) — chemical wash',
    'Toilet accessories / sink / toilet bowl',
    'Blinds / window mesh (if any)',
    'Service yard',
    'Balcony',
    'Fixtures — 3 meters & below (lights, lamps, plug sockets, mirrors)',
    'Doors & gates & glass door',
    'Degreasing of stove & hood',
    'Fridge (external only)',
    'Oven / Microwave degreasing (general)',
    'Dusting of painted wall / ceiling',
  ],
  excluded: [
    'Packing, unpacking, heavy shifting',
    'Heavy-duty stain removal (rusts, adhesive stains, paint stains)',
    'Upholstery (sofa, mattresses, carpets, curtains, bedsheets)',
    'Personal belongings (cups, plates, etc)',
    'Heavy degreasing / grout cleaning',
    'Painted walls stain removal / wet wipe down',
    'Disposal & removal of waste (general trash waste is included)',
    'Aircon ledge / any area outside of house',
    'Putting & removal of plastic sheets / protection',
  ],
};

// Resolve the correct scope for the current wizard selection. Returns null
// for subtypes with no defined scope (falls back to no scope card).
export function resolveDeepCleaningScope(
  subcategoryKey: string,
  tenancyMoveType: 'move_in' | 'move_out' | null,
): ScopeOfWork | null {
  if (subcategoryKey === 'post_reno') return POST_RENOVATION_SCOPE;
  if (subcategoryKey === 'spring')    return SPRING_CLEANING_SCOPE;
  if (subcategoryKey === 'hip')       return HIP_CLEANING_SCOPE;
  if (subcategoryKey === 'tenancy') {
    if (tenancyMoveType === 'move_out') return TENANCY_MOVE_OUT_SCOPE;
    return TENANCY_MOVE_IN_SCOPE;
  }
  return null;
}
