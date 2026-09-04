'use client';
import { useState } from 'react';
import { ChevronDown, Check, X, AlertTriangle, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Scope of work for branded partner flows (TCC + Doctor Clean).
// Renders as a collapsible card at the top of the property step so the
// partner sees exactly what's included / excluded before picking a unit
// tier. Defaults to expanded on first render.
//
// Brand differences:
//   tcc              → "Standard Cleaning" label, TOOLS header,
//                      height note below the scope list
//   doctor_clean_id  → "Post Renovation" label, TOOLS / CHEMICALS header,
//                      height note above the scope list, extended item
//                      descriptions ("fixtures", "new stove / hood / oven",
//                      "dusting of painted wall / ceiling")

type Brand = 'tcc' | 'doctor_clean_id';

interface Props {
  brand: Brand;
}

const TOOLS = [
  'Vacuum', 'Mop', 'Cloth(s)', 'Ladder', 'Cleaning solutions',
  'Pail', 'Scrapper', 'Brush(es)', 'Toilet brush', 'Sponge(s)',
];

const SCOPE_EXCLUDED = [
  'Packing, unpacking, heavy shifting',
  'Heavy-duty stain removal (rusts, adhesive, excessive paint stains)',
  'Upholstery (sofa, mattresses, carpets, curtains, bedsheets)',
  'Blinds (any type)',
  'Personal belongings (cups, plates, etc)',
  'Degreasing kitchen / grout cleaning',
  'Painted walls stain removal / wet wipe down',
  'Wall fans',
  'Disposal & removal of construction waste',
  'Aircon ledge / any area outside of house',
];

function getScopeIncluded(brand: Brand): string[] {
  if (brand === 'doctor_clean_id') {
    return [
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
      'Doors, gates & glass doors',
      'New stove / hood / oven / fridge (external)',
      'Dusting of painted wall / ceiling (no stain removal)',
      'Aircon (external only)',
    ];
  }
  // tcc
  return [
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
    'Fixtures — 3 meters & below',
    'Doors, gates & glass doors',
    'Oven / fridge (external only)',
    'Walls / ceiling',
    'Aircon (external only)',
  ];
}

function getMeta(brand: Brand) {
  if (brand === 'doctor_clean_id') {
    return {
      eyebrow: 'Post Renovation · What’s Included',
      title: 'Doctor Clean — Scope of Work',
      toolsHeader: 'Tools / Chemicals',
      heightNoteTop: true, // DC shows height note ABOVE the scope list
    };
  }
  return {
    eyebrow: 'Post Renovation · What’s Included',
    title: 'Standard Cleaning — Scope of Work',
    toolsHeader: 'Tools',
    heightNoteTop: false, // TCC shows height note BELOW the scope list
  };
}

const WA_URL =
  'https://wa.me/6589182880?text=' +
  encodeURIComponent(
    "Hi Doctor Clean! I need help with a service item that's outside the standard scope for my booking.",
  );

export default function PartnerScopeOfWork({ brand }: Props) {
  const [open, setOpen] = useState(true);
  const meta = getMeta(brand);
  const scopeIncluded = getScopeIncluded(brand);

  const HeightNote = () => (
    <div className="flex items-start gap-2 bg-amber-50 ring-1 ring-amber-100 rounded-xl p-3">
      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" strokeWidth={2} />
      <p className="text-[11px] text-amber-900 leading-snug">
        <span className="font-bold">Height must be 3 meters and below.</span> Additional charges
        may apply for cleaning above 3 meters.
      </p>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl ring-1 ring-emerald-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <div>
          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-0.5">
            {meta.eyebrow}
          </p>
          <h3 className="text-sm font-bold text-slate-900">{meta.title}</h3>
        </div>
        <ChevronDown
          className={cn('w-5 h-5 text-slate-400 transition-transform flex-shrink-0', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-slate-100 pt-4">

          {/* Tools */}
          <section>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              {meta.toolsHeader}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TOOLS.map((t) => (
                <span
                  key={t}
                  className="text-[11px] font-semibold text-slate-700 bg-slate-50 ring-1 ring-slate-200 rounded-full px-2.5 py-1"
                >
                  {t}
                </span>
              ))}
            </div>
          </section>

          {/* Scope (surface cleaning) */}
          <section>
            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-2">
              Scope (Surface Cleaning)
            </p>
            {meta.heightNoteTop && (
              <div className="mb-3">
                <HeightNote />
              </div>
            )}
            <ul className="space-y-1.5">
              {scopeIncluded.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-slate-700 leading-snug">
                  <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" strokeWidth={2.5} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {!meta.heightNoteTop && (
              <div className="mt-3">
                <HeightNote />
              </div>
            )}
          </section>

          {/* Excluded */}
          <section>
            <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest mb-2">
              Excluded Scope
            </p>
            <ul className="space-y-1.5">
              {SCOPE_EXCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-slate-600 leading-snug">
                  <X className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" strokeWidth={2.5} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Chat with agent */}
          <a
            href={WA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 ring-1 ring-slate-200 hover:bg-slate-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-4 h-4 text-emerald-600" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 leading-snug">Chat with an agent</p>
              <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                If you require any item under Excluded Scope or anything needing special attention
                / deep cleaning — additional charges apply.
              </p>
            </div>
          </a>
        </div>
      )}
    </div>
  );
}
