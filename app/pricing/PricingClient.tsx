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

const LOGO_URL = "https://agyzvknaqnamaoczxgsb.supabase.co/storage/v1/object/public/doctor-clean-files/uploads/doctor_clean_logo.542c4621e2b4379e4d95.png";

const SECTION_TITLES: Record<string, string> = {
  post_renovation_hdb:    'Post-Renovation Cleaning — HDB',
  post_renovation_condo:  'Post-Renovation Cleaning — Condominium',
  ala_carte_first_wash:   'Ala Carte for First Wash',
};

const SUBGROUP_ORDER = ["Individual", "Combo", "Surcharge"];

function fmt(v: number | null, tbq: boolean): string {
  if (tbq) return 'TBQ';
  if (v == null || v === 0) return '—';
  return `$${Number(v).toFixed(0)}`;
}
function pct(tcc: number | null, dc: number | null, tbq: boolean): number | null {
  if (tbq || !tcc || !dc || tcc <= dc) return null;
  return Math.round(((tcc - dc) / tcc) * 100);
}

// ─── Renovation table: unit rows × 3 price tiers, TCC vs DC ─────────────────
function RenoSection({ title, tccRows, idRows }: { title: string; tccRows: Row[]; idRows: Row[] }) {
  const merged = useMemo(() => {
    const byUnit = new Map<string, { unit: string; sqft: string | null; sort: number; tcc?: Row; dc?: Row }>();
    for (const r of tccRows) byUnit.set(r.unit_label, { unit: r.unit_label, sqft: r.sqft_label, sort: r.sort_order, tcc: r });
    for (const r of idRows) {
      const ex = byUnit.get(r.unit_label);
      if (ex) ex.dc = r;
      else byUnit.set(r.unit_label, { unit: r.unit_label, sqft: r.sqft_label, sort: r.sort_order, dc: r });
    }
    return Array.from(byUnit.values()).sort((a, b) => a.sort - b.sort);
  }, [tccRows, idRows]);

  if (merged.length === 0) return null;

  return (
    <section className="dc-card">
      <div className="dc-card__head">
        <h2 className="dc-card__title">{title}</h2>
        <span className="dc-card__count">{merged.length} units</span>
      </div>

      <div className="dc-reno-grid">
        {merged.map((u, i) => {
          const tbq = (u.tcc?.is_tbq || u.dc?.is_tbq) ?? false;
          const tiers: { label: string; tccCol: keyof Row; dcCol: keyof Row }[] = [
            { label: "Ala Carte",             tccCol: "ala_carte_price",               dcCol: "ala_carte_price" },
            { label: "+ Scrubbing",           tccCol: "scrubbing_price",               dcCol: "scrubbing_price" },
            { label: "+ Scrub + Formaldehyde", tccCol: "scrubbing_formaldehyde_price", dcCol: "scrubbing_formaldehyde_price" },
          ];
          return (
            <div key={i} className="dc-reno-card">
              <div className="dc-reno-card__head">
                <p className="dc-reno-card__unit">{u.unit}</p>
                {u.sqft && <p className="dc-reno-card__sqft">{u.sqft}</p>}
              </div>
              <div className="dc-reno-card__tiers">
                {tiers.map(tier => {
                  const tccV = (u.tcc?.[tier.tccCol] ?? null) as number | null;
                  const dcV  = (u.dc?.[tier.dcCol]  ?? null) as number | null;
                  const s = pct(tccV, dcV, tbq);
                  return (
                    <div key={tier.label} className="dc-tier-row">
                      <span className="dc-tier__label">{tier.label}</span>
                      <span className="dc-tier__tcc">{fmt(tccV, tbq)}</span>
                      <span className="dc-tier__dc">{fmt(dcV, tbq)}</span>
                      <span className="dc-tier__save">{s ? <span className="dc-savings">-{s}%</span> : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── À la carte: 1 price col, grouped by subgroup ───────────────────────────
function AlaCarteSection({ tccRows, idRows }: { tccRows: Row[]; idRows: Row[] }) {
  const groups = useMemo(() => {
    const g: Record<string, Map<string, { unit: string; tcc?: Row; dc?: Row; sort: number }>> = {};
    const push = (r: Row, side: 'tcc' | 'dc') => {
      const key = r.subgroup || 'Other';
      if (!g[key]) g[key] = new Map();
      const m = g[key];
      const existing = m.get(r.unit_label);
      if (existing) {
        if (side === 'tcc') existing.tcc = r;
        else existing.dc = r;
      } else {
        m.set(r.unit_label, { unit: r.unit_label, sort: r.sort_order, [side]: r });
      }
    };
    tccRows.forEach(r => push(r, 'tcc'));
    idRows.forEach(r => push(r, 'dc'));
    return g;
  }, [tccRows, idRows]);

  const orderedKeys = useMemo(() => {
    const inOrder = SUBGROUP_ORDER.filter(k => groups[k]);
    const rest = Object.keys(groups).filter(k => !SUBGROUP_ORDER.includes(k) && k !== 'Other');
    if (groups['Other']) rest.push('Other');
    return [...inOrder, ...rest];
  }, [groups]);

  if (orderedKeys.length === 0) return null;

  return (
    <section className="dc-card">
      <div className="dc-card__head">
        <h2 className="dc-card__title">{SECTION_TITLES.ala_carte_first_wash}</h2>
      </div>
      {orderedKeys.map(gk => {
        const rows = Array.from(groups[gk].values()).sort((a, b) => a.sort - b.sort);
        return (
          <div key={gk} className="dc-alacarte-group">
            <div className="dc-alacarte-group__head">{gk}</div>
            <div className="dc-alacarte-list">
              <div className="dc-alacarte-header">
                <span className="dc-alacarte__item">Item</span>
                <span className="dc-alacarte__tcc">TCC</span>
                <span className="dc-alacarte__dc">Doctor Clean</span>
                <span className="dc-alacarte__save">You Save</span>
              </div>
              {rows.map((r, i) => {
                const tbq = (r.tcc?.is_tbq || r.dc?.is_tbq) ?? false;
                const s = pct(r.tcc?.ala_carte_price ?? null, r.dc?.ala_carte_price ?? null, tbq);
                return (
                  <div key={i} className="dc-alacarte-row">
                    <span className="dc-alacarte__item">{r.unit}</span>
                    <span className="dc-alacarte__tcc">{fmt(r.tcc?.ala_carte_price ?? null, tbq)}</span>
                    <span className="dc-alacarte__dc">{fmt(r.dc?.ala_carte_price ?? null, tbq)}</span>
                    <span className="dc-alacarte__save">{s ? <span className="dc-savings">-{s}%</span> : ''}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export default function PricingClient({ tccRows, idRows }: { tccRows: Row[]; idRows: Row[] }) {
  const rowsBySection = (all: Row[], section: string) => all.filter(r => r.section === section);

  return (
    <div className="dc-pricing">
      {/* Nav */}
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
            Compare post-renovation and general cleaning rates. Special rates for
            Interior Designer and Renovation Contractor partners.
          </p>
          <p className="dc-hero__meta">All prices in SGD, before GST</p>
        </div>
      </header>

      {/* Main */}
      <main className="dc-main">
        <RenoSection
          title={SECTION_TITLES.post_renovation_hdb}
          tccRows={rowsBySection(tccRows, 'post_renovation_hdb')}
          idRows={rowsBySection(idRows, 'post_renovation_hdb')}
        />
        <RenoSection
          title={SECTION_TITLES.post_renovation_condo}
          tccRows={rowsBySection(tccRows, 'post_renovation_condo')}
          idRows={rowsBySection(idRows, 'post_renovation_condo')}
        />
        <AlaCarteSection
          tccRows={rowsBySection(tccRows, 'ala_carte_first_wash')}
          idRows={rowsBySection(idRows, 'ala_carte_first_wash')}
        />

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
                Singapore&apos;s trusted commercial &amp; residential cleaning partner.
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
}
.dc-pricing {
  min-height: 100vh;
  background:
    radial-gradient(circle at 25% 15%, rgba(22,180,145,0.08), transparent 45%),
    linear-gradient(180deg, #f4fff9 0%, #ffffff 320px, #ffffff 100%);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--dc-text);
}
.dc-pricing * { box-sizing: border-box; }

.dc-nav {
  background: rgba(255,255,255,0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--dc-border);
  position: sticky; top: 0; z-index: 30;
}
.dc-nav__inner { max-width: 1200px; margin: 0 auto; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; }
.dc-nav__brand { display: flex; align-items: center; gap: 12px; text-decoration: none; }
.dc-nav__logo { width: 42px; height: 42px; object-fit: contain; }
.dc-nav__title { margin: 0; font-size: 16px; font-weight: 800; color: var(--dc-navy); letter-spacing: -0.01em; }
.dc-nav__subtitle { margin: 0; font-size: 11px; color: var(--dc-muted); letter-spacing: 1px; text-transform: uppercase; }
.dc-nav__links { display: flex; gap: 14px; align-items: center; }
.dc-nav__link { font-size: 14px; font-weight: 600; color: var(--dc-navy); text-decoration: none; padding: 8px 12px; }
.dc-nav__link:hover { color: var(--dc-green-dark); }
.dc-nav__cta { font-size: 14px; font-weight: 700; color: #fff; background: var(--dc-green); padding: 10px 18px; border-radius: 10px; text-decoration: none; }
.dc-nav__cta:hover { background: var(--dc-green-dark); }

.dc-hero { padding: 48px 24px 40px; }
.dc-hero__inner { max-width: 900px; margin: 0 auto; text-align: center; }
.dc-hero__kicker {
  display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: 2px;
  color: var(--dc-green-dark); background: var(--dc-green-soft);
  padding: 6px 14px; border-radius: 100px; margin-bottom: 20px;
}
.dc-hero__title { margin: 0 0 16px; font-size: clamp(30px, 4.6vw, 48px); font-weight: 800; color: var(--dc-navy); letter-spacing: -0.035em; line-height: 1.1; }
.dc-hero__accent { color: var(--dc-green); }
.dc-hero__desc { max-width: 620px; margin: 0 auto 12px; font-size: 15px; line-height: 1.65; color: var(--dc-muted); }
.dc-hero__meta { margin: 0; font-size: 12px; color: var(--dc-muted); }

.dc-main { max-width: 1200px; margin: 0 auto; padding: 20px 24px 60px; display: flex; flex-direction: column; gap: 24px; }

.dc-card {
  background: #fff; border: 1px solid var(--dc-border); border-radius: 22px;
  padding: 28px; box-shadow: 0 12px 24px rgba(15,23,42,0.05);
}
.dc-card__head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 20px; }
.dc-card__title { margin: 0; font-size: 20px; font-weight: 800; color: var(--dc-navy); letter-spacing: -0.02em; }
.dc-card__count { font-size: 12px; color: var(--dc-muted); font-weight: 600; }

/* Renovation grid: cards per unit */
.dc-reno-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
@media (max-width: 720px) { .dc-reno-grid { grid-template-columns: 1fr; } }
.dc-reno-card {
  background: #fafbfc; border: 1px solid var(--dc-border); border-radius: 14px; overflow: hidden;
}
.dc-reno-card__head { padding: 14px 16px; background: var(--dc-navy); color: #fff; }
.dc-reno-card__unit { margin: 0; font-size: 15px; font-weight: 800; letter-spacing: -0.01em; }
.dc-reno-card__sqft { margin: 2px 0 0; font-size: 11px; color: rgba(255,255,255,0.65); font-weight: 500; }
.dc-reno-card__tiers { padding: 4px 12px 12px; }
.dc-tier-row {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) 1fr 1fr 60px;
  align-items: center;
  gap: 10px;
  padding: 10px 4px;
  border-bottom: 1px solid var(--dc-border);
  font-size: 13px;
}
.dc-tier-row:last-child { border-bottom: none; }
.dc-tier__label { font-weight: 600; color: var(--dc-text); font-size: 12px; }
.dc-tier__tcc { color: var(--dc-muted); text-decoration: line-through; text-align: right; font-weight: 600; }
.dc-tier__dc { color: var(--dc-navy); font-weight: 800; text-align: right; font-size: 14px; }
.dc-tier__save { text-align: right; }
.dc-savings {
  display: inline-block; font-size: 10px; font-weight: 800;
  color: var(--dc-green-dark); background: var(--dc-green-soft);
  padding: 3px 8px; border-radius: 100px; letter-spacing: 0.3px;
}

/* À la carte */
.dc-alacarte-group + .dc-alacarte-group { margin-top: 20px; }
.dc-alacarte-group__head {
  font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
  color: var(--dc-green-dark);
  padding: 8px 14px; background: var(--dc-green-soft); border-radius: 8px;
  margin-bottom: 8px;
}
.dc-alacarte-list { border: 1px solid var(--dc-border); border-radius: 12px; overflow: hidden; }
.dc-alacarte-header {
  display: grid;
  grid-template-columns: minmax(0, 2fr) 1fr 1fr 80px;
  padding: 10px 14px;
  background: #fafbfc;
  border-bottom: 1px solid var(--dc-border);
  font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
  color: var(--dc-muted);
}
.dc-alacarte-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) 1fr 1fr 80px;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--dc-border);
  font-size: 14px;
}
.dc-alacarte-row:last-child { border-bottom: none; }
.dc-alacarte__item { font-weight: 700; color: var(--dc-navy); }
.dc-alacarte-header .dc-alacarte__item { font-weight: 700; color: var(--dc-muted); }
.dc-alacarte__tcc { text-align: right; color: var(--dc-muted); text-decoration: line-through; font-weight: 600; }
.dc-alacarte-header .dc-alacarte__tcc { text-decoration: none; color: var(--dc-muted); }
.dc-alacarte__dc { text-align: right; font-weight: 800; color: var(--dc-navy); }
.dc-alacarte-header .dc-alacarte__dc { font-weight: 700; color: var(--dc-green-dark); }
.dc-alacarte__save { text-align: right; }
.dc-alacarte-header .dc-alacarte__save { color: var(--dc-muted); }

.dc-scope { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.dc-scope ul { margin: 0; padding: 0; list-style: none; }
.dc-scope li { position: relative; padding: 8px 0 8px 28px; font-size: 14px; color: var(--dc-text); line-height: 1.5; }
.dc-scope li::before {
  content: "✓"; position: absolute; left: 0; top: 8px;
  width: 20px; height: 20px; background: var(--dc-green-soft); color: var(--dc-green-dark);
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 800;
}
@media (max-width: 640px) { .dc-scope { grid-template-columns: 1fr; gap: 0; } }

.dc-ctas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
@media (max-width: 768px) { .dc-ctas { grid-template-columns: 1fr; } }
.dc-cta {
  display: flex; flex-direction: column; align-items: center;
  padding: 28px 20px; border-radius: 18px; text-decoration: none; text-align: center;
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

.dc-footnote { text-align: center; font-size: 12px; color: var(--dc-muted); max-width: 720px; margin: 8px auto 0; line-height: 1.6; }

.dc-footer-block { background: var(--dc-navy); color: rgba(255,255,255,0.85); padding: 56px 24px 28px; margin-top: 40px; }
.dc-footer-block__inner { max-width: 1200px; margin: 0 auto; }
.dc-footer-block__grid { display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; gap: 40px; padding-bottom: 40px; border-bottom: 1px solid rgba(255,255,255,0.10); }
@media (max-width: 900px) { .dc-footer-block__grid { grid-template-columns: 1fr 1fr; gap: 32px; } }
@media (max-width: 560px) { .dc-footer-block__grid { grid-template-columns: 1fr; } }
.dc-footer-block__col { display: flex; flex-direction: column; gap: 10px; }
.dc-footer-block__col--brand { max-width: 320px; }
.dc-footer-block__logo { width: 52px; height: 52px; object-fit: contain; margin-bottom: 4px; }
.dc-footer-block__brand-name { margin: 0; font-size: 16px; font-weight: 800; color: #fff; }
.dc-footer-block__brand-desc { margin: 6px 0 0; font-size: 13px; line-height: 1.65; color: rgba(255,255,255,0.65); }
.dc-footer-block__col-title { margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--dc-green); }
.dc-footer-block__link { font-size: 13.5px; color: rgba(255,255,255,0.75); text-decoration: none; }
.dc-footer-block__link:hover { color: #fff; }
.dc-footer-block__meta { font-size: 13px; color: rgba(255,255,255,0.65); line-height: 1.55; }
.dc-footer-block__bar { padding-top: 24px; display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px; font-size: 12px; color: rgba(255,255,255,0.55); }
.dc-footer-block__pipe { color: rgba(255,255,255,0.30); margin: 0 2px; }
.dc-footer-block__dot { color: rgba(255,255,255,0.30); }
`;
