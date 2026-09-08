'use client';

import { useState, useMemo } from 'react';

type Row = {
  section: string;
  subgroup: string | null;
  unit_label: string;
  sqft_label: string | null;
  ala_carte_price: number | null;
  scrubbing_price: number | null;
  scrubbing_formaldehyde_price: number | null;
  is_tbq: boolean;
  sort_order: number;
};

const SECTION_LABELS: Record<string, string> = {
  post_renovation_hdb:   'Post-Renovation — HDB',
  post_renovation_condo: 'Post-Renovation — Condo / Apartment',
  post_renovation_landed:'Post-Renovation — Landed',
  ala_carte_first_wash:  'À La Carte — First Wash',
  ala_carte_addons:      'À La Carte — Add-ons',
  spring_cleaning:       'Spring Cleaning',
  general_cleaning:      'General Cleaning',
};

function sectionLabel(s: string): string {
  return SECTION_LABELS[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmtPrice(v: number | null, isTbq: boolean): string {
  if (isTbq) return 'By quote';
  if (v == null || v === 0) return '—';
  return `$${Number(v).toFixed(0)}`;
}

function savings(tcc: number | null, dc: number | null): string | null {
  if (!tcc || !dc || tcc <= dc) return null;
  const pct = Math.round(((tcc - dc) / tcc) * 100);
  return `${pct}% less`;
}

export default function PricingClient({ tccRows, idRows }: { tccRows: Row[]; idRows: Row[] }) {
  const sections = useMemo(() => {
    const set = new Set<string>();
    [...tccRows, ...idRows].forEach(r => set.add(r.section));
    return Array.from(set);
  }, [tccRows, idRows]);

  const [activeSection, setActiveSection] = useState(sections[0] ?? 'post_renovation_hdb');

  // Merge rows by unit_label within the active section
  const merged = useMemo(() => {
    const tccInSec = tccRows.filter(r => r.section === activeSection);
    const idInSec  = idRows.filter(r => r.section === activeSection);
    const byUnit = new Map<string, { unit: string; sqft: string | null; tcc?: Row; dc?: Row }>();
    for (const r of tccInSec) {
      const key = `${r.subgroup ?? ''}::${r.unit_label}`;
      byUnit.set(key, { unit: r.unit_label, sqft: r.sqft_label, tcc: r });
    }
    for (const r of idInSec) {
      const key = `${r.subgroup ?? ''}::${r.unit_label}`;
      const existing = byUnit.get(key);
      if (existing) existing.dc = r;
      else byUnit.set(key, { unit: r.unit_label, sqft: r.sqft_label, dc: r });
    }
    return Array.from(byUnit.values()).sort((a, b) =>
      (a.tcc?.sort_order ?? a.dc?.sort_order ?? 0) - (b.tcc?.sort_order ?? b.dc?.sort_order ?? 0)
    );
  }, [activeSection, tccRows, idRows]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="bg-gradient-to-br from-[#0d3d56] to-[#12587a] text-white">
        <div className="max-w-6xl mx-auto px-6 py-16 text-center">
          <p className="text-sm font-semibold text-sky-300 tracking-widest mb-3">TRANSPARENT PRICING</p>
          <h1 className="text-4xl md:text-5xl font-black mb-4">Doctor Clean vs TCC</h1>
          <p className="text-lg text-sky-100 max-w-2xl mx-auto">
            Compare post-renovation and general cleaning rates side-by-side.
            All prices in SGD, before GST.
          </p>
        </div>
      </header>

      {/* Section tabs */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-2 overflow-x-auto py-3">
            {sections.map(s => (
              <button
                key={s}
                onClick={() => setActiveSection(s)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                  activeSection === s
                    ? 'bg-[#0d3d56] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {sectionLabel(s)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Comparison table */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-black text-[#0d3d56] mb-6">{sectionLabel(activeSection)}</h2>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Unit</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Size</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-500">TCC (à la carte)</th>
                  <th className="px-4 py-3 text-right font-semibold text-[#0d3d56]">Doctor Clean (à la carte)</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-500">TCC (scrubbing)</th>
                  <th className="px-4 py-3 text-right font-semibold text-[#0d3d56]">Doctor Clean (scrubbing)</th>
                  <th className="px-4 py-3 text-right font-semibold text-green-700">Your Savings</th>
                </tr>
              </thead>
              <tbody>
                {merged.map((row, i) => {
                  const s = savings(row.tcc?.ala_carte_price ?? null, row.dc?.ala_carte_price ?? null)
                        ?? savings(row.tcc?.scrubbing_price ?? null, row.dc?.scrubbing_price ?? null);
                  return (
                    <tr key={i} className="border-b border-gray-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-gray-900">{row.unit}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{row.sqft ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-500 line-through">
                        {fmtPrice(row.tcc?.ala_carte_price ?? null, row.tcc?.is_tbq ?? false)}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-[#0d3d56]">
                        {fmtPrice(row.dc?.ala_carte_price ?? null, row.dc?.is_tbq ?? false)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 line-through">
                        {fmtPrice(row.tcc?.scrubbing_price ?? null, row.tcc?.is_tbq ?? false)}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-[#0d3d56]">
                        {fmtPrice(row.dc?.scrubbing_price ?? null, row.dc?.is_tbq ?? false)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s && <span className="inline-block px-2 py-1 rounded-md bg-green-50 text-green-700 text-xs font-bold">{s}</span>}
                      </td>
                    </tr>
                  );
                })}
                {merged.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No data for this section yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Scope of Work */}
        <section className="mt-12 bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <h3 className="text-xl font-black text-[#0d3d56] mb-4">Scope of Work — Post-Renovation Cleaning</h3>
          <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-700">
            <ul className="space-y-2 list-disc list-inside">
              <li>Fine dust removal from all surfaces (walls, floors, ceilings)</li>
              <li>Paint splatter, silicone, and adhesive removal</li>
              <li>Cement / grout haze cleaning on tiles</li>
              <li>Cabinet, wardrobe, and drawer wipe-down (inside &amp; outside)</li>
              <li>Window frames, tracks, grills and glass cleaning</li>
              <li>Kitchen deep clean — hood, hob, sink, backsplash</li>
            </ul>
            <ul className="space-y-2 list-disc list-inside">
              <li>Bathroom scrub — toilet, walls, floor, glass panels</li>
              <li>Light fittings, switches, and air-con casings wipe-down</li>
              <li>Balcony wash and railing polish</li>
              <li>Floor polishing / scrubbing (if selected)</li>
              <li>Rubbish and packaging disposal (bagged)</li>
              <li>Handover-ready walk-through with your team</li>
            </ul>
          </div>
        </section>

        {/* CTAs */}
        <section className="mt-12 grid md:grid-cols-3 gap-4">
          <a
            href="/signup"
            className="block bg-[#0d3d56] hover:bg-[#12587a] text-white rounded-xl p-6 text-center shadow-md transition-colors"
          >
            <p className="text-3xl mb-2">🏢</p>
            <p className="font-black text-lg">Register Your Company</p>
            <p className="text-sm text-sky-200 mt-1">Get contractor rates instantly</p>
          </a>
          <a
            href="https://wa.me/6589182880?text=Hi%2C%20I%27d%20like%20to%20book%20a%20post-renovation%20cleaning."
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-green-500 hover:bg-green-600 text-white rounded-xl p-6 text-center shadow-md transition-colors"
          >
            <p className="text-3xl mb-2">💬</p>
            <p className="font-black text-lg">Book Now on WhatsApp</p>
            <p className="text-sm text-green-100 mt-1">+65 8918 2880</p>
          </a>
          <a
            href="mailto:hello@securedoctorclean.com?subject=Cleaning%20Inquiry"
            className="block bg-white border-2 border-[#0d3d56] hover:bg-slate-50 text-[#0d3d56] rounded-xl p-6 text-center shadow-md transition-colors"
          >
            <p className="text-3xl mb-2">✉️</p>
            <p className="font-black text-lg">Chat with CS</p>
            <p className="text-sm text-gray-500 mt-1">hello@securedoctorclean.com</p>
          </a>
        </section>

        {/* Footer note */}
        <p className="mt-10 text-center text-xs text-gray-400">
          All prices in SGD, exclusive of GST. Actual pricing may vary based on site conditions and scope.
          Doctor Clean pricing shown is our Interior Designer partner rate.
        </p>
      </main>
    </div>
  );
}
