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

function savingsPct(tcc: number | null, dc: number | null): number | null {
  if (!tcc || !dc || tcc <= dc) return null;
  return Math.round(((tcc - dc) / tcc) * 100);
}

const LOGO_URL = "https://agyzvknaqnamaoczxgsb.supabase.co/storage/v1/object/public/doctor-clean-files/uploads/doctor_clean_logo.542c4621e2b4379e4d95.png";

export default function PricingClient({ tccRows, idRows }: { tccRows: Row[]; idRows: Row[] }) {
  const sections = useMemo(() => {
    const set = new Set<string>();
    [...tccRows, ...idRows].forEach(r => set.add(r.section));
    // Sort with post_renovation first
    return Array.from(set).sort((a, b) => {
      const pri = (s: string) => s.startsWith('post_renovation') ? 0 : s.startsWith('general') ? 1 : 2;
      return pri(a) - pri(b);
    });
  }, [tccRows, idRows]);

  const [activeSection, setActiveSection] = useState(sections[0] ?? 'post_renovation_hdb');

  const merged = useMemo(() => {
    const byUnit = new Map<string, { unit: string; sqft: string | null; tcc?: Row; dc?: Row; sort: number }>();
    for (const r of tccRows.filter(r => r.section === activeSection)) {
      const key = `${r.subgroup ?? ''}::${r.unit_label}`;
      byUnit.set(key, { unit: r.unit_label, sqft: r.sqft_label, tcc: r, sort: r.sort_order });
    }
    for (const r of idRows.filter(r => r.section === activeSection)) {
      const key = `${r.subgroup ?? ''}::${r.unit_label}`;
      const existing = byUnit.get(key);
      if (existing) existing.dc = r;
      else byUnit.set(key, { unit: r.unit_label, sqft: r.sqft_label, dc: r, sort: r.sort_order });
    }
    return Array.from(byUnit.values()).sort((a, b) => a.sort - b.sort);
  }, [activeSection, tccRows, idRows]);

  return (
    <div className="dc-pricing">
      {/* Nav bar */}
      <nav className="dc-nav">
        <div className="dc-nav__inner">
          <a href="/" className="dc-nav__brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_URL} alt="Doctor Clean" className="dc-nav__logo" />
            <div>
              <p className="dc-nav__title">Doctor Clean</p>
              <p className="dc-nav__subtitle">Partner Portal</p>
            </div>
          </a>
          <div className="dc-nav__links">
            <a href="/login" className="dc-nav__link">Sign In</a>
            <a href="/signup" className="dc-nav__cta">Register</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="dc-hero">
        <div className="dc-hero__inner">
          <span className="dc-hero__kicker">TRANSPARENT PRICING</span>
          <h1 className="dc-hero__title">
            Doctor Clean <span className="dc-hero__accent">vs TCC</span>
          </h1>
          <p className="dc-hero__desc">
            Compare post-renovation and general cleaning rates side-by-side.
            Special rates for Interior Designer and Renovation Contractor partners.
          </p>
          <p className="dc-hero__meta">All prices in SGD, before GST · Updated regularly</p>
        </div>
      </header>

      {/* Section tabs */}
      <div className="dc-tabs-wrap">
        <div className="dc-tabs-inner">
          <div className="dc-tabs">
            {sections.map(s => (
              <button
                key={s}
                onClick={() => setActiveSection(s)}
                className={`dc-tab ${activeSection === s ? 'dc-tab--active' : ''}`}
              >
                {sectionLabel(s)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <main className="dc-main">
        <section className="dc-card">
          <h2 className="dc-card__title">{sectionLabel(activeSection)}</h2>
          <div className="dc-table-wrap">
            <table className="dc-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Size</th>
                  <th className="dc-table__right">TCC (à la carte)</th>
                  <th className="dc-table__right dc-table__dc">Doctor Clean</th>
                  <th className="dc-table__right">TCC (scrubbing)</th>
                  <th className="dc-table__right dc-table__dc">Doctor Clean</th>
                  <th className="dc-table__right">You Save</th>
                </tr>
              </thead>
              <tbody>
                {merged.map((row, i) => {
                  const pct = savingsPct(row.tcc?.ala_carte_price ?? null, row.dc?.ala_carte_price ?? null)
                          ?? savingsPct(row.tcc?.scrubbing_price ?? null, row.dc?.scrubbing_price ?? null);
                  return (
                    <tr key={i}>
                      <td className="dc-table__unit">{row.unit}</td>
                      <td className="dc-table__size">{row.sqft ?? '—'}</td>
                      <td className="dc-table__right dc-table__strike">{fmtPrice(row.tcc?.ala_carte_price ?? null, row.tcc?.is_tbq ?? false)}</td>
                      <td className="dc-table__right dc-table__price">{fmtPrice(row.dc?.ala_carte_price ?? null, row.dc?.is_tbq ?? false)}</td>
                      <td className="dc-table__right dc-table__strike">{fmtPrice(row.tcc?.scrubbing_price ?? null, row.tcc?.is_tbq ?? false)}</td>
                      <td className="dc-table__right dc-table__price">{fmtPrice(row.dc?.scrubbing_price ?? null, row.dc?.is_tbq ?? false)}</td>
                      <td className="dc-table__right">{pct ? <span className="dc-savings">{pct}% less</span> : ''}</td>
                    </tr>
                  );
                })}
                {merged.length === 0 && (
                  <tr><td colSpan={7} className="dc-table__empty">No data available for this section.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Scope of Work */}
        <section className="dc-card">
          <h2 className="dc-card__title">Scope of Work — Post-Renovation Cleaning</h2>
          <div className="dc-scope">
            <ul>
              <li>Fine dust removal from all surfaces (walls, floors, ceilings)</li>
              <li>Paint splatter, silicone, and adhesive removal</li>
              <li>Cement / grout haze cleaning on tiles</li>
              <li>Cabinet, wardrobe, and drawer wipe-down (inside &amp; outside)</li>
              <li>Window frames, tracks, grills and glass cleaning</li>
              <li>Kitchen deep clean — hood, hob, sink, backsplash</li>
            </ul>
            <ul>
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
        <section className="dc-ctas">
          <a href="/signup" className="dc-cta dc-cta--primary">
            <span className="dc-cta__icon">🏢</span>
            <span className="dc-cta__title">Register Your Company</span>
            <span className="dc-cta__sub">Get contractor rates instantly</span>
          </a>
          <a
            href="https://wa.me/6589182880?text=Hi%2C%20I%27d%20like%20to%20book%20a%20post-renovation%20cleaning."
            target="_blank" rel="noopener noreferrer"
            className="dc-cta dc-cta--whatsapp"
          >
            <span className="dc-cta__icon">💬</span>
            <span className="dc-cta__title">Book on WhatsApp</span>
            <span className="dc-cta__sub">+65 8918 2880</span>
          </a>
          <a href="mailto:hello@securedoctorclean.com?subject=Cleaning%20Inquiry" className="dc-cta dc-cta--outline">
            <span className="dc-cta__icon">✉️</span>
            <span className="dc-cta__title">Chat with CS</span>
            <span className="dc-cta__sub">hello@securedoctorclean.com</span>
          </a>
        </section>

        <p className="dc-footnote">
          All prices in SGD, exclusive of GST. Actual pricing may vary based on site conditions and scope.
          Doctor Clean pricing shown is our Interior Designer partner rate.
        </p>
      </main>

      {/* Footer */}
      <footer className="dc-footer-block">
        <div className="dc-footer-block__inner">
          <div className="dc-footer-block__grid">
            <div className="dc-footer-block__col dc-footer-block__col--brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO_URL} alt="Doctor Clean" className="dc-footer-block__logo" />
              <p className="dc-footer-block__brand-name">Doctor Clean Pte Ltd.</p>
              <p className="dc-footer-block__brand-desc">
                Singapore's trusted commercial &amp; residential cleaning partner.
                Specialists in post-renovation, general, and deep cleaning.
              </p>
            </div>

            <div className="dc-footer-block__col">
              <p className="dc-footer-block__col-title">Partners</p>
              <a href="/signup" className="dc-footer-block__link">Register your company</a>
              <a href="/login" className="dc-footer-block__link">Partner sign in</a>
              <a href="/pricing" className="dc-footer-block__link">Partner pricing</a>
            </div>

            <div className="dc-footer-block__col">
              <p className="dc-footer-block__col-title">Contact</p>
              <a href="https://wa.me/6589182880" className="dc-footer-block__link" target="_blank" rel="noopener noreferrer">
                WhatsApp: +65 8918 2880
              </a>
              <a href="mailto:hello@securedoctorclean.com" className="dc-footer-block__link">hello@securedoctorclean.com</a>
              <span className="dc-footer-block__meta">Mon–Sat · 9am–6pm SGT</span>
            </div>

            <div className="dc-footer-block__col">
              <p className="dc-footer-block__col-title">Trust</p>
              <span className="dc-footer-block__meta">✅ Trained &amp; Verified Team</span>
              <span className="dc-footer-block__meta">📅 Flexible Scheduling</span>
              <span className="dc-footer-block__meta">🌿 Eco-Friendly Products</span>
              <span className="dc-footer-block__meta">🇸🇬 Serving all of Singapore</span>
            </div>
          </div>

          <div className="dc-footer-block__bar">
            <span>© {new Date().getFullYear()} Doctor Clean Pte Ltd. All rights reserved.</span>
            <span className="dc-footer-block__pipe">|</span>
            <span>Secure</span>
            <span className="dc-footer-block__dot">•</span>
            <span>Reliable</span>
            <span className="dc-footer-block__dot">•</span>
            <span>Singapore-based</span>
          </div>
        </div>
      </footer>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
:root {
  --dc-green: #0eae8b;
  --dc-green-dark: #079c7c;
  --dc-green-soft: rgba(20,174,143,0.10);
  --dc-teal: #159eaa;
  --dc-navy: #13233f;
  --dc-text: #334155;
  --dc-muted: #718096;
  --dc-border: #dce2e9;
  --dc-white: #ffffff;
  --dc-soft-bg: #f4fff9;
}

.dc-pricing {
  min-height: 100vh;
  min-height: 100svh;
  background:
    radial-gradient(circle at 25% 15%, rgba(22,180,145,0.08), transparent 45%),
    linear-gradient(180deg, #f4fff9 0%, #ffffff 320px, #ffffff 100%);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--dc-text);
}
.dc-pricing * { box-sizing: border-box; }

/* NAV */
.dc-nav {
  background: rgba(255,255,255,0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--dc-border);
  position: sticky; top: 0; z-index: 30;
}
.dc-nav__inner {
  max-width: 1200px; margin: 0 auto;
  padding: 14px 24px;
  display: flex; align-items: center; justify-content: space-between;
}
.dc-nav__brand { display: flex; align-items: center; gap: 12px; text-decoration: none; }
.dc-nav__logo { width: 42px; height: 42px; object-fit: contain; }
.dc-nav__title { margin: 0; font-size: 16px; font-weight: 800; color: var(--dc-navy); letter-spacing: -0.01em; }
.dc-nav__subtitle { margin: 0; font-size: 11px; color: var(--dc-muted); letter-spacing: 1px; text-transform: uppercase; }
.dc-nav__links { display: flex; gap: 14px; align-items: center; }
.dc-nav__link { font-size: 14px; font-weight: 600; color: var(--dc-navy); text-decoration: none; padding: 8px 12px; }
.dc-nav__link:hover { color: var(--dc-green-dark); }
.dc-nav__cta {
  font-size: 14px; font-weight: 700; color: #fff;
  background: var(--dc-green); padding: 10px 18px; border-radius: 10px;
  text-decoration: none; transition: background 0.15s ease;
}
.dc-nav__cta:hover { background: var(--dc-green-dark); }

/* HERO */
.dc-hero { padding: 56px 24px 40px; }
.dc-hero__inner { max-width: 900px; margin: 0 auto; text-align: center; }
.dc-hero__kicker {
  display: inline-block;
  font-size: 12px; font-weight: 700; letter-spacing: 2px;
  color: var(--dc-green-dark);
  background: var(--dc-green-soft);
  padding: 6px 14px; border-radius: 100px;
  margin-bottom: 20px;
}
.dc-hero__title {
  margin: 0 0 16px;
  font-size: clamp(32px, 5vw, 52px);
  font-weight: 800;
  color: var(--dc-navy);
  letter-spacing: -0.035em;
  line-height: 1.1;
}
.dc-hero__accent { color: var(--dc-green); }
.dc-hero__desc {
  max-width: 620px; margin: 0 auto 12px;
  font-size: 16px; line-height: 1.65; color: var(--dc-muted);
}
.dc-hero__meta { margin: 0; font-size: 12px; color: var(--dc-muted); }

/* TABS */
.dc-tabs-wrap {
  background: #fff;
  border-bottom: 1px solid var(--dc-border);
  position: sticky; top: 74px; z-index: 20;
}
.dc-tabs-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
.dc-tabs { display: flex; gap: 8px; overflow-x: auto; padding: 14px 0; scrollbar-width: none; }
.dc-tabs::-webkit-scrollbar { display: none; }
.dc-tab {
  flex-shrink: 0;
  border: 1px solid var(--dc-border);
  background: #fff;
  color: var(--dc-text);
  font-size: 13px; font-weight: 600;
  padding: 9px 16px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  font-family: inherit;
}
.dc-tab:hover { background: var(--dc-green-soft); border-color: var(--dc-green); color: var(--dc-green-dark); }
.dc-tab--active { background: var(--dc-navy); color: #fff; border-color: var(--dc-navy); }

/* MAIN */
.dc-main { max-width: 1200px; margin: 0 auto; padding: 36px 24px 60px; display: flex; flex-direction: column; gap: 28px; }

.dc-card {
  background: #fff;
  border: 1px solid var(--dc-border);
  border-radius: 22px;
  padding: 32px;
  box-shadow: 0 12px 24px rgba(15,23,42,0.05);
}
.dc-card__title {
  margin: 0 0 20px;
  font-size: 22px; font-weight: 800;
  color: var(--dc-navy);
  letter-spacing: -0.02em;
}

.dc-table-wrap { overflow-x: auto; margin: 0 -8px; }
.dc-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.dc-table thead th {
  padding: 12px 14px;
  text-align: left;
  font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
  color: var(--dc-muted);
  border-bottom: 2px solid var(--dc-border);
  background: #fafbfc;
  white-space: nowrap;
}
.dc-table__right { text-align: right !important; }
.dc-table__dc { color: var(--dc-green-dark); }
.dc-table tbody td {
  padding: 14px;
  border-bottom: 1px solid var(--dc-border);
  vertical-align: middle;
}
.dc-table tbody tr:hover { background: var(--dc-green-soft); }
.dc-table tbody tr:last-child td { border-bottom: none; }
.dc-table__unit { font-weight: 700; color: var(--dc-navy); }
.dc-table__size { font-size: 12px; color: var(--dc-muted); }
.dc-table__strike { color: var(--dc-muted); text-decoration: line-through; }
.dc-table__price { font-weight: 800; color: var(--dc-navy); font-size: 15px; }
.dc-table__empty { text-align: center; padding: 40px; color: var(--dc-muted); }
.dc-savings {
  display: inline-block;
  font-size: 11px; font-weight: 800;
  color: var(--dc-green-dark);
  background: var(--dc-green-soft);
  padding: 4px 10px; border-radius: 100px;
}

/* SCOPE */
.dc-scope { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.dc-scope ul { margin: 0; padding: 0; list-style: none; }
.dc-scope li {
  position: relative;
  padding: 8px 0 8px 28px;
  font-size: 14px; color: var(--dc-text);
  line-height: 1.5;
}
.dc-scope li::before {
  content: "✓";
  position: absolute; left: 0; top: 8px;
  width: 20px; height: 20px;
  background: var(--dc-green-soft);
  color: var(--dc-green-dark);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 800;
}
@media (max-width: 640px) { .dc-scope { grid-template-columns: 1fr; gap: 0; } }

/* CTAs */
.dc-ctas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
@media (max-width: 768px) { .dc-ctas { grid-template-columns: 1fr; } }
.dc-cta {
  display: flex; flex-direction: column; align-items: center;
  padding: 28px 20px; border-radius: 18px;
  text-decoration: none;
  text-align: center;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  border: 1px solid transparent;
}
.dc-cta:hover { transform: translateY(-2px); box-shadow: 0 16px 28px rgba(15,23,42,0.10); }
.dc-cta__icon { font-size: 32px; margin-bottom: 10px; line-height: 1; }
.dc-cta__title { font-size: 16px; font-weight: 800; margin-bottom: 4px; }
.dc-cta__sub { font-size: 12px; opacity: 0.85; }
.dc-cta--primary { background: var(--dc-navy); color: #fff; }
.dc-cta--whatsapp { background: #22c55e; color: #fff; }
.dc-cta--outline { background: #fff; color: var(--dc-navy); border-color: var(--dc-border); }
.dc-cta--outline:hover { border-color: var(--dc-green); }

.dc-footnote {
  text-align: center;
  font-size: 12px; color: var(--dc-muted);
  max-width: 720px; margin: 8px auto 0;
  line-height: 1.6;
}

/* FOOTER */
.dc-footer-block {
  background: var(--dc-navy);
  color: rgba(255,255,255,0.85);
  padding: 56px 24px 28px;
  margin-top: 40px;
}
.dc-footer-block__inner { max-width: 1200px; margin: 0 auto; }
.dc-footer-block__grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr 1fr;
  gap: 40px;
  padding-bottom: 40px;
  border-bottom: 1px solid rgba(255,255,255,0.10);
}
@media (max-width: 900px) {
  .dc-footer-block__grid { grid-template-columns: 1fr 1fr; gap: 32px; }
}
@media (max-width: 560px) {
  .dc-footer-block__grid { grid-template-columns: 1fr; }
}
.dc-footer-block__col { display: flex; flex-direction: column; gap: 10px; }
.dc-footer-block__col--brand { max-width: 320px; }
.dc-footer-block__logo { width: 52px; height: 52px; object-fit: contain; margin-bottom: 4px; }
.dc-footer-block__brand-name { margin: 0; font-size: 16px; font-weight: 800; color: #fff; }
.dc-footer-block__brand-desc {
  margin: 6px 0 0;
  font-size: 13px; line-height: 1.65;
  color: rgba(255,255,255,0.65);
}
.dc-footer-block__col-title {
  margin: 0 0 8px;
  font-size: 12px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
  color: var(--dc-green);
}
.dc-footer-block__link {
  font-size: 13.5px;
  color: rgba(255,255,255,0.75);
  text-decoration: none;
  transition: color 0.15s ease;
}
.dc-footer-block__link:hover { color: #fff; }
.dc-footer-block__meta {
  font-size: 13px;
  color: rgba(255,255,255,0.65);
  line-height: 1.55;
}
.dc-footer-block__bar {
  padding-top: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: rgba(255,255,255,0.55);
}
.dc-footer-block__pipe { color: rgba(255,255,255,0.30); margin: 0 2px; }
.dc-footer-block__dot { color: rgba(255,255,255,0.30); }
`;
