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

type PropertyKey = 'hdb' | 'condo' | 'landed' | 'office';
const PROPERTY_TYPES: { key: PropertyKey; label: string; subtitle: string; icon: string; section: string }[] = [
  { key: 'hdb',    label: 'HDB',          subtitle: '1-5 Room',                     icon: '🏢', section: 'post_renovation_hdb' },
  { key: 'condo',  label: 'Condo',        subtitle: 'Studio – 5BR',                 icon: '🏙️', section: 'post_renovation_condo' },
  { key: 'landed', label: 'Landed House', subtitle: 'Terrace / Semi-D / Bungalow',  icon: '🏡', section: 'post_renovation_landed' },
  { key: 'office', label: 'Office',       subtitle: 'Commercial',                    icon: '🏬', section: 'office' },
];

// Hours to display next to each unit label. Post-reno small units = 3 hrs, larger = 4 hrs.
function hoursFor(unit: string): string {
  const s = unit.toLowerCase();
  if (/(4|5|penthouse|5-bed|5-room|4-bed|4-room)/.test(s)) return '/ 4 hours';
  return '/ 3 hours';
}

function fmtPrice(v: number | null): string {
  if (v == null || v === 0) return '—';
  return `$${Number(v).toFixed(0)}`;
}

type BrandKey = 'dc' | 'tcc';

function FeatureRow({ label, dc, other, isLast }: { label: string; dc: React.ReactNode; other: React.ReactNode; isLast?: boolean }) {
  return (
    <div className={`dc-features__row ${isLast ? 'dc-features__row--last' : ''}`}>
      <div className="dc-features__col-label">{label}</div>
      <div className="dc-features__col-cell">{dc}</div>
      <div className="dc-features__col-cell">{other}</div>
    </div>
  );
}

export default function PricingClient({ tccRows, idRows }: { tccRows: Row[]; idRows: Row[] }) {
  const [activeProp, setActiveProp] = useState<PropertyKey>('hdb');
  const [activeBrand, setActiveBrand] = useState<BrandKey>('dc');
  const activeCfg = PROPERTY_TYPES.find(p => p.key === activeProp)!;

  const dcUnits = useMemo(
    () => idRows.filter(r => r.section === activeCfg.section).sort((a, b) => a.sort_order - b.sort_order),
    [idRows, activeCfg.section]
  );
  const otherUnits = useMemo(
    () => tccRows.filter(r => r.section === activeCfg.section).sort((a, b) => a.sort_order - b.sort_order),
    [tccRows, activeCfg.section]
  );

  const activeUnits = activeBrand === 'dc' ? dcUnits : otherUnits;

  // First wash (à la carte) — only for the active brand, always from the ala_carte_first_wash section
  const firstWash = useMemo(() => {
    const src = activeBrand === 'dc' ? idRows : tccRows;
    const rows = src.filter(r => r.section === 'ala_carte_first_wash').sort((a, b) => a.sort_order - b.sort_order);
    const SUBGROUP_ORDER = ['Individual', 'Combo', 'Surcharge'];
    const grouped: Record<string, Row[]> = {};
    for (const r of rows) {
      const k = r.subgroup || 'Other';
      (grouped[k] ??= []).push(r);
    }
    const ordered = [
      ...SUBGROUP_ORDER.filter(k => grouped[k]?.length),
      ...Object.keys(grouped).filter(k => !SUBGROUP_ORDER.includes(k) && k !== 'Other'),
      ...(grouped['Other'] ? ['Other'] : []),
    ];
    return { ordered, grouped };
  }, [idRows, tccRows, activeBrand]);
  const brandLabel = activeBrand === 'dc' ? 'Doctor Clean' : 'The Cleaning Crew';
  const sectionTitle = activeCfg.key === 'hdb'   ? 'Post-Renovation Cleaning — HDB'
                     : activeCfg.key === 'condo' ? 'Post-Renovation Cleaning — Condominium'
                     : activeCfg.key === 'landed'? 'Post-Renovation Cleaning — Landed'
                     : 'Post-Renovation Cleaning — Office';

  const popularIdx = Math.min(2, Math.max(0, Math.floor(dcUnits.length / 2)));
  const popularDc = dcUnits[popularIdx];
  const popularOther = otherUnits[popularIdx];

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
              <p className="dc-nav__subtitle">Spotless Faces, Smiling Faces</p>
            </div>
          </a>
          <div className="dc-nav__links">
            <a href="/dashboard" className="dc-nav__link">Home</a>
            <a href="/signup" className="dc-nav__link">Sign Up</a>
            <a href="/pricing" className="dc-nav__link dc-nav__link--active">Pricing</a>
          </div>
          <a href="/dashboard/booking/new" className="dc-nav__cta">
            Book Now
          </a>
        </div>
      </nav>

      {/* Hero */}
      <header className="dc-hero" id="pricing">
        <div className="dc-hero__inner">
          <span className="dc-hero__kicker">PRICE COMPARISON</span>
          <h1 className="dc-hero__title">
            <span className="dc-hero__accent">Doctor Clean</span> vs The Cleaning Crew
          </h1>
          <p className="dc-hero__desc">Same cleaning. More value with Doctor Clean.</p>

          <div className="dc-hero__trust">
            <div className="dc-trust">
              <span className="dc-trust__icon" style={{ background: '#dbeafe' }}>✔️</span>
              <div>
                <p className="dc-trust__title">Transparent Pricing</p>
                <p className="dc-trust__sub">No hidden fees</p>
              </div>
            </div>
            <div className="dc-trust">
              <span className="dc-trust__icon" style={{ background: '#dbeafe' }}>⭐</span>
              <div>
                <p className="dc-trust__title">Trusted &amp; Reliable</p>
                <p className="dc-trust__sub">Hundreds of happy customers</p>
              </div>
            </div>
            <div className="dc-trust">
              <span className="dc-trust__icon" style={{ background: '#dbeafe' }}>💙</span>
              <div>
                <p className="dc-trust__title">A Cleaner, Healthier Home</p>
                <p className="dc-trust__sub">It&apos;s more than just cleaning</p>
              </div>
            </div>
          </div>
        </div>

        <div className="dc-hero__scribble">Clean Homes<br/>Brighter Days ♡</div>
      </header>

      {/* Property type selector */}
      <div className="dc-props-wrap">
        <div className="dc-props">
          {PROPERTY_TYPES.map(p => (
            <button
              key={p.key}
              onClick={() => setActiveProp(p.key)}
              className={`dc-prop ${activeProp === p.key ? 'dc-prop--active' : ''}`}
            >
              <span className="dc-prop__icon">{p.icon}</span>
              <div className="dc-prop__text">
                <p className="dc-prop__label">{p.label}</p>
                <p className="dc-prop__sub">({p.subtitle})</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Two-card comparison */}
      <section className="dc-compare">
        <div className="dc-compare__grid">
          {/* Doctor Clean */}
          <div className="dc-brand dc-brand--dc">
            <span className="dc-brand__ribbon">👑 Most Popular</span>
            <div className="dc-brand__head">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO_URL} alt="Doctor Clean" className="dc-brand__logo" />
              <div>
                <p className="dc-brand__name">Doctor Clean</p>
                <p className="dc-brand__tag">Private Limited</p>
              </div>
            </div>
            <p className="dc-brand__section-label">Renovation Cleaning</p>
            <div className="dc-brand__prices">
              {dcUnits.length === 0 ? (
                <a
                  href={`https://wa.me/6589182880?text=Hi%2C%20I%27d%20like%20a%20quote%20for%20${encodeURIComponent(activeCfg.label)}%20cleaning.`}
                  target="_blank" rel="noopener noreferrer"
                  className="dc-brand__empty dc-brand__empty--cta"
                >
                  Ask quote via WhatsApp →
                </a>
              ) : dcUnits.map((u, i) => (
                <div key={i} className={`dc-price ${i === popularIdx ? 'dc-price--pop' : ''}`}>
                  <p className="dc-price__unit">{u.unit_label}</p>
                  <p className="dc-price__amt">{u.is_tbq ? 'TBQ' : fmtPrice(u.ala_carte_price)}</p>
                  <p className="dc-price__hrs">{hoursFor(u.unit_label)}</p>
                </div>
              ))}
            </div>
            <ul className="dc-brand__perks">
              <li><span className="dc-check">✓</span>10% Rebate for All ID</li>
              <li><span className="dc-check">✓</span>Price is only exclusive for ID</li>
              <li><span className="dc-check">✓</span>Project subject to 9% GST</li>
            </ul>
            <a href="/dashboard/booking/new" className="dc-brand__cta dc-brand__cta--dc">
              Book Now
            </a>
          </div>

          {/* The Cleaning Crew */}
          <div className="dc-brand dc-brand--other">
            <div className="dc-brand__head dc-brand__head--textonly">
              <div>
                <p className="dc-brand__name">The Cleaning Crew</p>
                <p className="dc-brand__tag">Your Trusted Cleaning Partners</p>
                <p className="dc-brand__powered">Powered by Doctor Clean</p>
              </div>
            </div>
            <p className="dc-brand__section-label">General Cleaning</p>
            <div className="dc-brand__prices">
              {otherUnits.length === 0 ? (
                <a
                  href={`https://wa.me/6589182880?text=Hi%2C%20I%27d%20like%20a%20quote%20for%20${encodeURIComponent(activeCfg.label)}%20cleaning.`}
                  target="_blank" rel="noopener noreferrer"
                  className="dc-brand__empty dc-brand__empty--cta"
                >
                  Ask quote via WhatsApp →
                </a>
              ) : otherUnits.map((u, i) => (
                <div key={i} className="dc-price dc-price--other">
                  <p className="dc-price__unit">{u.unit_label}</p>
                  <p className="dc-price__amt">{u.is_tbq ? 'TBQ' : fmtPrice(u.ala_carte_price)}</p>
                  <p className="dc-price__hrs">{hoursFor(u.unit_label)}</p>
                </div>
              ))}
            </div>
            <ul className="dc-brand__perks dc-brand__perks--other">
              <li><span className="dc-check">✓</span>Project subject to 9% GST</li>
            </ul>
            <a href="/dashboard/booking/new" className="dc-brand__cta dc-brand__cta--other">
              Book Now
            </a>
          </div>
        </div>
      </section>

      {/* Full pricing breakdown — matches admin dashboard style */}
      <section className="dc-pricetable">
        <div className="dc-pricetable__toggle-wrap">
          <div className="dc-brand-toggle">
            <button
              onClick={() => setActiveBrand('dc')}
              className={`dc-brand-toggle__btn ${activeBrand === 'dc' ? 'dc-brand-toggle__btn--active' : ''}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO_URL} alt="" className="dc-brand-toggle__logo" />
              Doctor Clean
            </button>
            <button
              onClick={() => setActiveBrand('tcc')}
              className={`dc-brand-toggle__btn ${activeBrand === 'tcc' ? 'dc-brand-toggle__btn--active' : ''}`}
            >
              The Cleaning Crew
            </button>
          </div>
        </div>

        <div className="dc-pricetable__card">
          <div className="dc-pricetable__head">
            <h2 className="dc-pricetable__title">{sectionTitle}</h2>
            <span className="dc-pricetable__count">{activeUnits.length} rows</span>
          </div>

          <div className="dc-pricetable__table">
            <div className="dc-pricetable__row dc-pricetable__row--header">
              <div className="dc-pricetable__unit">Unit Type</div>
              <div className="dc-pricetable__cell dc-pricetable__cell--header">Ala-Carte</div>
              <div className="dc-pricetable__cell dc-pricetable__cell--header">+ Scrub</div>
              <div className="dc-pricetable__cell dc-pricetable__cell--header">+ Scrub + Formal.</div>
            </div>

            {activeUnits.length === 0 ? (
              <div className="dc-pricetable__empty">
                <a
                  href={`https://wa.me/6589182880?text=Hi%2C%20I%27d%20like%20a%20quote%20for%20${encodeURIComponent(activeCfg.label)}%20cleaning.`}
                  target="_blank" rel="noopener noreferrer"
                  className="dc-pricetable__empty-cta"
                >
                  Ask quote via WhatsApp →
                </a>
              </div>
            ) : activeUnits.map((u, i) => (
              <div key={i} className="dc-pricetable__row">
                <div className="dc-pricetable__unit">
                  <p className="dc-pricetable__unit-label">{u.unit_label}</p>
                  {u.sqft_label && <p className="dc-pricetable__unit-sqft">({u.sqft_label})</p>}
                </div>
                <div className="dc-pricetable__cell">
                  <span className={`dc-pricepill ${u.ala_carte_price ? 'dc-pricepill--filled' : 'dc-pricepill--empty'}`}>
                    {u.is_tbq ? 'TBQ' : (u.ala_carte_price ? `$${Number(u.ala_carte_price).toFixed(2)}` : '—')}
                  </span>
                </div>
                <div className="dc-pricetable__cell">
                  <span className={`dc-pricepill ${u.scrubbing_price ? 'dc-pricepill--filled' : 'dc-pricepill--empty'}`}>
                    {u.is_tbq ? 'TBQ' : (u.scrubbing_price ? `$${Number(u.scrubbing_price).toFixed(2)}` : '—')}
                  </span>
                </div>
                <div className="dc-pricetable__cell">
                  <span className={`dc-pricepill ${u.scrubbing_formaldehyde_price ? 'dc-pricepill--filled' : 'dc-pricepill--empty'}`}>
                    {u.is_tbq ? 'TBQ' : (u.scrubbing_formaldehyde_price ? `$${Number(u.scrubbing_formaldehyde_price).toFixed(2)}` : '—')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* First Wash — À la carte */}
        {firstWash.ordered.length > 0 && (
          <div className="dc-pricetable__card" style={{ marginTop: 20 }}>
            <div className="dc-pricetable__head">
              <h2 className="dc-pricetable__title">Ala Carte for First Wash</h2>
              <span className="dc-pricetable__count">
                {firstWash.ordered.reduce((n, k) => n + firstWash.grouped[k].length, 0)} items
              </span>
            </div>

            <div className="dc-pricetable__table">
              <div className="dc-firstwash__header">
                <div className="dc-pricetable__unit">Item</div>
                <div className="dc-pricetable__cell dc-pricetable__cell--header">Price</div>
              </div>
              {firstWash.ordered.map(gk => (
                <div key={gk}>
                  <div className="dc-firstwash__group">{gk}</div>
                  {firstWash.grouped[gk].map((r, i) => (
                    <div key={i} className="dc-firstwash__row">
                      <div className="dc-pricetable__unit">
                        <p className="dc-pricetable__unit-label">{r.unit_label}</p>
                      </div>
                      <div className="dc-pricetable__cell">
                        <span className={`dc-pricepill ${r.ala_carte_price ? 'dc-pricepill--filled' : 'dc-pricepill--empty'}`}>
                          {r.is_tbq ? 'TBQ' : (r.ala_carte_price ? `$${Number(r.ala_carte_price).toFixed(2)}` : '—')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* CTA banner */}
      <section className="dc-cta-banner">
        <div className="dc-cta-banner__inner">
          <div className="dc-cta-banner__illus">🏠✨</div>
          <div className="dc-cta-banner__text">
            <p className="dc-cta-banner__title">Choose peace of mind.<br/>Choose Doctor Clean.</p>
            <p className="dc-cta-banner__sub">Quality cleaning at a better value.</p>
          </div>
          <div className="dc-cta-banner__action">
            <div className="dc-cta-banner__buttons">
              <a href="/dashboard/booking/new" className="dc-cta-banner__btn">
                Book Now
              </a>
              <a
                href="https://wa.me/6589182880?text=Hi%2C%20I%27d%20like%20to%20book%20a%20cleaning."
                target="_blank" rel="noopener noreferrer"
                className="dc-cta-banner__btn dc-cta-banner__btn--wa"
              >
                Chat via WhatsApp
              </a>
            </div>
            <p className="dc-cta-banner__tagline">Spotless Faces, Smiling Faces.</p>
          </div>
        </div>
      </section>

      {/* Trust stats */}
      <section className="dc-stats">
        <div className="dc-stats__inner">
          <div className="dc-stat"><span className="dc-stat__icon">👥</span><div><p className="dc-stat__num">10,000+</p><p className="dc-stat__lbl">Homes Cleaned</p></div></div>
          <div className="dc-stat">
            <span className="dc-stat__icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="32" height="32" style={{ display: 'block' }}>
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
            </span>
            <div><p className="dc-stat__num">4.9/5</p><p className="dc-stat__lbl">Google Rating</p></div>
          </div>
          <div className="dc-stat"><span className="dc-stat__icon">🛡️</span><div><p className="dc-stat__num">100%</p><p className="dc-stat__lbl">Satisfaction Guaranteed</p></div></div>
          <div className="dc-stat"><span className="dc-stat__icon">🌿</span><div><p className="dc-stat__num">A Cleaner, Healthier</p><p className="dc-stat__lbl">Singapore</p></div></div>
        </div>
      </section>

      {/* Footer — ported from booking-web homepage */}
      <footer className="dc-web-footer">
        <div className="dc-web-footer__inner">
          <div className="dc-web-footer__grid">
            <div className="dc-web-footer__brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO_URL} alt="Doctor Clean" className="dc-web-footer__logo" />
              <p className="dc-web-footer__desc">
                Singapore&apos;s trusted professional cleaning service. Vetted cleaners, insured jobs,
                and instant online booking — available islandwide.
              </p>
              <div className="dc-web-footer__contacts">
                <a href="https://wa.me/6589182880" target="_blank" rel="noopener noreferrer" className="dc-web-footer__contact">
                  <span className="dc-web-footer__ci">📞</span>+65 8918 2880
                </a>
                <a href="mailto:sales@doctorclean.com.sg" className="dc-web-footer__contact">
                  <span className="dc-web-footer__ci">✉️</span>sales@doctorclean.com.sg
                </a>
                <span className="dc-web-footer__contact dc-web-footer__contact--plain">
                  <span className="dc-web-footer__ci">📍</span>65 Ubi Rd 1, #02-64 Oxley Bizhub, Singapore 408729
                </span>
              </div>
            </div>

            <div className="dc-web-footer__col">
              <h4 className="dc-web-footer__col-title">Services</h4>
              <ul className="dc-web-footer__list">
                <li><a href="https://www.doctorcleanpayment.sg/deep-cleaning" target="_blank" rel="noopener noreferrer">Deep Cleaning</a></li>
                <li><a href="https://www.doctorcleanpayment.sg/hip-cleaning" target="_blank" rel="noopener noreferrer">Post-Renovation</a></li>
                <li><a href="https://www.doctorcleanpayment.sg/housekeeping" target="_blank" rel="noopener noreferrer">Housekeeping</a></li>
                <li><a href="https://www.doctorcleanpayment.sg/curtain-cleaning" target="_blank" rel="noopener noreferrer">Curtain Cleaning</a></li>
                <li><a href="https://www.doctorcleanpayment.sg/floor-coating" target="_blank" rel="noopener noreferrer">Floor Coating</a></li>
                <li><a href="https://www.doctorcleanpayment.sg/disinfection" target="_blank" rel="noopener noreferrer">Disinfection</a></li>
                <li><a href="https://www.doctorcleanpayment.sg/formaldehyde-removal" target="_blank" rel="noopener noreferrer">Formaldehyde Removal</a></li>
              </ul>
            </div>

            <div className="dc-web-footer__col">
              <h4 className="dc-web-footer__col-title">Company</h4>
              <ul className="dc-web-footer__list">
                <li><a href="/dashboard/booking/new">Book Online</a></li>
                <li><a href="https://www.doctorcleanpayment.sg/faq" target="_blank" rel="noopener noreferrer">FAQ</a></li>
                <li><a href="https://g.page/r/CTDvertxNGsEEAI/review" target="_blank" rel="noopener noreferrer">Google Reviews</a></li>
                <li><a href="https://wa.me/6589182880" target="_blank" rel="noopener noreferrer">Contact Us</a></li>
                <li><a href="/signup">Register your Company</a></li>
                <li><a href="/login">Partner Sign In</a></li>
              </ul>
            </div>
          </div>

          <div className="dc-web-footer__bar">
            <span>&copy; {new Date().getFullYear()} Doctor Clean Singapore. All rights reserved.</span>
            <div className="dc-web-footer__bar-right">
              <a href="https://www.doctorcleanpayment.sg/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
              <a href="https://www.doctorcleanpayment.sg/terms" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a>
              <span className="dc-web-footer__secure">🛡️ Payments secured by Stripe</span>
            </div>
          </div>
        </div>
      </footer>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
:root {
  /* Aliased "blue" keys onto brand green so existing classes keep working */
  --dc-blue: #0eae8b;
  --dc-blue-dark: #079c7c;
  --dc-blue-soft: rgba(20,174,143,0.12);
  --dc-blue-tint: #f4fff9;
  --dc-navy: #13233f;
  --dc-text: #334155;
  --dc-muted: #718096;
  --dc-border: #dce2e9;
  --dc-green: #0eae8b;
  --dc-green-dark: #079c7c;
  --dc-red: #ef4444;
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

/* NAV */
.dc-nav { background: #fff; border-bottom: 1px solid var(--dc-border); position: sticky; top: 0; z-index: 30; }
.dc-nav__inner { max-width: 1200px; margin: 0 auto; padding: 12px 24px; display: flex; align-items: center; gap: 24px; }
.dc-nav__brand { display: flex; align-items: center; gap: 10px; text-decoration: none; }
.dc-nav__logo { width: 44px; height: 44px; object-fit: contain; }
.dc-nav__title { margin: 0; font-size: 18px; font-weight: 800; color: var(--dc-blue); letter-spacing: -0.02em; }
.dc-nav__subtitle { margin: 0; font-size: 10px; color: var(--dc-muted); font-weight: 500; }
.dc-nav__links { display: flex; gap: 8px; align-items: center; flex: 1; justify-content: center; }
.dc-nav__link { font-size: 14px; font-weight: 600; color: var(--dc-text); text-decoration: none; padding: 8px 12px; border-radius: 8px; }
.dc-nav__link:hover { color: var(--dc-blue); }
.dc-nav__link--active { color: var(--dc-blue); }
.dc-nav__cta { font-size: 14px; font-weight: 700; color: #000; background: #fff; border: 1.5px solid #000; padding: 10px 22px; border-radius: 999px; text-decoration: none; transition: all 0.15s ease; }
.dc-nav__cta:hover { background: #000; color: #fff; }
@media (max-width: 900px) { .dc-nav__links { display: none; } }

/* HERO */
.dc-hero { padding: 48px 24px 28px; position: relative; overflow: hidden; }
.dc-hero__inner { max-width: 1100px; margin: 0 auto; text-align: center; position: relative; z-index: 2; }
.dc-hero__kicker {
  display: inline-block; font-size: 12px; font-weight: 800; letter-spacing: 2px;
  color: var(--dc-blue); background: var(--dc-blue-soft);
  padding: 6px 16px; border-radius: 100px; margin-bottom: 16px;
}
.dc-hero__title { margin: 0 0 12px; font-size: clamp(30px, 5vw, 50px); font-weight: 800; color: var(--dc-text); letter-spacing: -0.035em; line-height: 1.1; }
.dc-hero__accent { color: var(--dc-blue); }
.dc-hero__desc { margin: 0 auto 28px; font-size: 17px; color: #475569; }
.dc-hero__trust { display: flex; justify-content: center; gap: 40px; flex-wrap: wrap; }
.dc-trust { display: flex; align-items: center; gap: 12px; text-align: left; }
.dc-trust__icon { width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
.dc-trust__title { margin: 0; font-size: 14px; font-weight: 700; color: var(--dc-text); }
.dc-trust__sub { margin: 2px 0 0; font-size: 12px; color: var(--dc-muted); }
.dc-hero__scribble {
  position: absolute; top: 60px; right: 40px;
  font-family: 'Brush Script MT', 'Segoe Script', cursive;
  font-size: 22px; color: var(--dc-blue);
  transform: rotate(-6deg);
  text-align: center; line-height: 1.2;
}
@media (max-width: 900px) { .dc-hero__scribble { display: none; } }

/* PROPERTY SELECTOR */
.dc-props-wrap { padding: 20px 24px 0; }
.dc-props { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
@media (max-width: 768px) { .dc-props { grid-template-columns: repeat(2, 1fr); } }
.dc-prop {
  display: flex; align-items: center; gap: 14px;
  background: #fff; border: 2px solid var(--dc-border);
  padding: 14px 16px; border-radius: 14px; cursor: pointer;
  text-align: left; font-family: inherit;
  transition: all 0.15s ease;
}
.dc-prop:hover { border-color: var(--dc-blue); }
.dc-prop--active {
  background: var(--dc-blue); border-color: var(--dc-blue); color: #fff;
  box-shadow: 0 8px 20px rgba(37,99,235,0.25);
}
.dc-prop--active .dc-prop__icon { background: rgba(255,255,255,0.2); color: #fff; }
.dc-prop--active .dc-prop__sub { color: rgba(255,255,255,0.85); }
.dc-prop__icon { width: 48px; height: 48px; border-radius: 12px; background: var(--dc-blue-soft); color: var(--dc-blue); display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; }
.dc-prop__text { min-width: 0; }
.dc-prop__label { margin: 0; font-size: 15px; font-weight: 800; letter-spacing: -0.01em; }
.dc-prop__sub { margin: 2px 0 0; font-size: 11px; color: var(--dc-muted); font-weight: 500; }

/* BRAND TOGGLE */
.dc-brand-toggle-wrap { padding: 24px 24px 0; }
.dc-brand-toggle {
  max-width: 480px; margin: 0 auto;
  background: #fff; border: 1px solid var(--dc-border); border-radius: 100px;
  padding: 5px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px;
  box-shadow: 0 4px 12px rgba(15,23,42,0.05);
}
.dc-brand-toggle__btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  background: transparent; border: none;
  padding: 12px 16px; border-radius: 100px;
  font-family: inherit; font-size: 14px; font-weight: 700;
  color: var(--dc-muted); cursor: pointer; transition: all 0.15s ease;
}
.dc-brand-toggle__btn:hover { color: var(--dc-text); }
.dc-brand-toggle__btn--active {
  background: var(--dc-blue); color: #fff;
  box-shadow: 0 4px 10px rgba(37,99,235,0.30);
}
.dc-brand-toggle__logo { width: 20px; height: 20px; object-fit: contain; }

/* PRICE TABLE */
.dc-pricetable { padding: 32px 24px 0; }
.dc-pricetable__toggle-wrap { max-width: 1100px; margin: 0 auto 16px; display: flex; justify-content: center; }
.dc-pricetable__card { max-width: 1100px; margin: 0 auto; background: #fff; border: 1px solid var(--dc-border); border-radius: 16px; overflow: hidden; box-shadow: 0 8px 20px rgba(15,23,42,0.05); }
.dc-pricetable__head { display: flex; align-items: center; gap: 12px; padding: 18px 20px; border-bottom: 1px solid var(--dc-border); }
.dc-pricetable__icon { width: 36px; height: 36px; border-radius: 10px; background: var(--dc-blue-soft); color: var(--dc-blue); display: flex; align-items: center; justify-content: center; font-size: 18px; }
.dc-pricetable__title { margin: 0; font-size: 16px; font-weight: 800; color: var(--dc-text); flex: 1; }
.dc-pricetable__count { font-size: 12px; color: var(--dc-muted); font-weight: 600; }
.dc-pricetable__table { display: flex; flex-direction: column; }
.dc-pricetable__row { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--dc-border); }
.dc-pricetable__row:last-child { border-bottom: none; }
.dc-pricetable__row--header { background: #f8fafc; padding: 12px 20px; }
.dc-pricetable__row--header .dc-pricetable__cell { color: var(--dc-muted); font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; }
.dc-pricetable__cell { text-align: center; }
.dc-pricetable__cell--header { text-align: center; }
.dc-pricetable__unit-label { margin: 0; font-size: 14px; font-weight: 800; color: var(--dc-text); letter-spacing: -0.01em; }
.dc-pricetable__unit-sqft { margin: 2px 0 0; font-size: 11px; color: var(--dc-muted); }
.dc-pricetable__row--header .dc-pricetable__unit { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--dc-muted); }
.dc-pricepill {
  display: inline-block; padding: 8px 20px; border-radius: 8px;
  font-size: 14px; font-weight: 800; letter-spacing: -0.01em;
  min-width: 100px;
}
.dc-pricepill--filled { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
.dc-pricepill--empty { background: #f8fafc; color: #cbd5e1; border: 1px solid var(--dc-border); font-weight: 500; }
.dc-pricetable__empty { padding: 40px 20px; text-align: center; color: var(--dc-muted); font-size: 14px; }

.dc-firstwash__header {
  display: grid; grid-template-columns: 1.5fr 1fr;
  align-items: center; padding: 12px 20px;
  background: #f8fafc; border-bottom: 1px solid var(--dc-border);
  font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--dc-muted);
}
.dc-firstwash__group {
  padding: 10px 20px;
  background: #fef2f2; color: #dc2626;
  font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;
  border-bottom: 1px solid #fecaca;
  border-top: 1px solid #fecaca;
}
.dc-firstwash__row {
  display: grid; grid-template-columns: 1.5fr 1fr;
  align-items: center; padding: 14px 20px;
  border-bottom: 1px solid var(--dc-border);
}
.dc-firstwash__row:last-child { border-bottom: none; }

.dc-brand-notes { max-width: 1100px; margin: 16px auto 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 16px 28px; }
.dc-brand-notes__item { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--dc-text); font-weight: 600; }

@media (max-width: 720px) {
  .dc-pricetable__row { grid-template-columns: 1.4fr 1fr 1fr 1fr; padding: 12px 12px; gap: 6px; }
  .dc-pricepill { min-width: auto; padding: 6px 8px; font-size: 12px; }
}

/* COMPARE (legacy — unused) */
.dc-compare { padding: 28px 24px 0; }
.dc-compare__grid { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 900px) { .dc-compare__grid { grid-template-columns: 1fr; } }
.dc-brand { position: relative; border-radius: 20px; padding: 32px 24px 24px; display: flex; flex-direction: column; }
.dc-brand--dc { background: #fff; border: 2px solid var(--dc-green); box-shadow: 0 16px 32px rgba(14,174,139,0.18); }
.dc-brand--other { background: #fff; border: 2px solid #000; box-shadow: 0 12px 24px rgba(0,0,0,0.15); }
.dc-brand__ribbon {
  position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
  background: var(--dc-green); color: #fff;
  font-size: 12px; font-weight: 800; letter-spacing: 0.3px;
  padding: 6px 18px; border-radius: 100px;
  box-shadow: 0 4px 10px rgba(34,197,94,0.30);
  white-space: nowrap;
}
.dc-brand__head { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; justify-content: center; }
.dc-brand__head--textonly { min-height: 60px; }
.dc-brand__icon { font-size: 32px; }
.dc-brand__icon--muted { opacity: 0.4; }
.dc-brand__logo { width: 56px; height: 56px; object-fit: contain; }
.dc-brand__name { margin: 0; font-size: 22px; font-weight: 800; color: var(--dc-green); letter-spacing: -0.02em; }
.dc-brand--other .dc-brand__name { color: #000; }
.dc-brand__tag { margin: 2px 0 0; font-size: 11px; color: var(--dc-muted); font-weight: 500; min-height: 16px; }
.dc-brand__powered { margin: 4px 0 0; font-size: 10px; color: var(--dc-blue); font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
.dc-brand__cta {
  display: block;
  margin-top: auto;
  text-align: center;
  padding: 14px 20px;
  border-radius: 12px;
  font-size: 15px; font-weight: 800;
  text-decoration: none; letter-spacing: -0.01em;
  background: #fff; color: #000; border: 1.5px solid #000;
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, color 0.15s ease;
}
.dc-brand__cta:hover { background: #000; color: #fff; transform: translateY(-2px); box-shadow: 0 12px 24px rgba(15,23,42,0.20); }
/* Force explicit 20px gap between the last ✓ and the Book Now button —
   overrides the flex margin-top:auto absorption. */
.dc-brand__cta { margin-top: 20px !important; }
.dc-brand__section-label { margin: 0 0 10px; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: var(--dc-green); text-align: center; }
.dc-brand--other .dc-brand__section-label { color: #000; }
.dc-brand__prices { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 20px; }
@media (max-width: 560px) { .dc-brand__prices { grid-template-columns: repeat(3, 1fr); } }
.dc-brand__empty { grid-column: 1 / -1; text-align: center; color: var(--dc-muted); padding: 24px 0; font-size: 14px; }
.dc-brand__empty--cta {
  display: block; text-decoration: none;
  color: #000; font-weight: 800; font-size: 15px;
  background: #fff; border: 1.5px solid #000;
  padding: 20px; border-radius: 12px;
  transition: background 0.15s ease, color 0.15s ease;
}
.dc-brand__empty--cta:hover { background: #000; color: #fff; }
.dc-pricetable__empty-cta {
  display: inline-block; text-decoration: none;
  color: #000; font-weight: 800; font-size: 15px;
  background: #fff; border: 1.5px solid #000;
  padding: 12px 22px; border-radius: 12px;
  transition: background 0.15s ease, color 0.15s ease;
}
.dc-pricetable__empty-cta:hover { background: #000; color: #fff; }

/* ─────────── MOBILE (<= 720px) ─────────── */
@media (max-width: 720px) {
  /* Nav: compact links visible, hide subtitle */
  .dc-nav__inner { gap: 8px; padding: 10px 12px; flex-wrap: wrap; }
  .dc-nav__logo { width: 36px; height: 36px; }
  .dc-nav__title { font-size: 15px; }
  .dc-nav__subtitle { display: none; }
  .dc-nav__links { display: flex; order: 3; width: 100%; justify-content: center; gap: 4px; }
  .dc-nav__link { padding: 6px 8px; font-size: 12px; }
  .dc-nav__cta { padding: 8px 16px; font-size: 13px; }

  /* Hero */
  .dc-hero { padding: 32px 16px 24px; }
  .dc-hero__title { font-size: 26px; }
  .dc-hero__desc { font-size: 14px; }
  .dc-hero__trust { gap: 14px; flex-direction: column; align-items: flex-start; padding: 0 8px; }
  .dc-trust__icon { width: 36px; height: 36px; font-size: 16px; }
  .dc-trust__title { font-size: 13px; }
  .dc-trust__sub { font-size: 11px; }

  /* Property selector */
  .dc-props-wrap { padding: 12px 16px 0; }
  .dc-props { gap: 8px; }
  .dc-prop { padding: 10px 12px; gap: 10px; }
  .dc-prop__icon { width: 36px; height: 36px; font-size: 20px; }
  .dc-prop__label { font-size: 13px; }
  .dc-prop__sub { font-size: 10px; }

  /* Compare cards */
  .dc-compare { padding: 20px 16px 0; }
  .dc-brand { padding: 24px 16px 20px; }
  .dc-brand__ribbon { font-size: 11px; padding: 5px 14px; }
  .dc-brand__name { font-size: 18px; }
  .dc-brand__logo { width: 44px; height: 44px; }
  .dc-brand__prices { grid-template-columns: repeat(2, 1fr) !important; gap: 6px; }
  .dc-price { padding: 10px 4px; }
  .dc-price__amt { font-size: 18px; }
  .dc-price__unit { font-size: 10px; }
  .dc-price__hrs { font-size: 9px; }
  .dc-brand__cta { padding: 12px 16px; font-size: 14px; margin-top: 16px; }

  /* Pricing breakdown table — switch to card layout per row */
  .dc-pricetable { padding: 20px 16px 0; }
  .dc-pricetable__card { border-radius: 12px; }
  .dc-pricetable__head { padding: 14px 16px; }
  .dc-pricetable__title { font-size: 14px; }
  .dc-pricetable__row {
    grid-template-columns: 1fr 1fr;
    padding: 10px 12px 4px;
    gap: 6px 8px;
  }
  .dc-pricetable__row--header { display: none; }
  .dc-pricetable__row { border-bottom: 1px solid var(--dc-border); padding: 12px; }
  .dc-pricetable__unit { grid-column: 1 / -1; padding-bottom: 6px; border-bottom: 1px dashed var(--dc-border); margin-bottom: 4px; }
  .dc-pricetable__cell::before {
    display: block;
    font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
    color: var(--dc-muted); margin-bottom: 4px;
  }
  .dc-pricetable__cell:nth-of-type(2)::before { content: "Ala-Carte"; }
  .dc-pricetable__cell:nth-of-type(3)::before { content: "+ Scrub"; }
  .dc-pricetable__cell:nth-of-type(4)::before { content: "+ Scrub + Formal."; }
  .dc-pricetable__cell:nth-of-type(4) { grid-column: 1 / -1; }
  .dc-pricepill { min-width: auto; padding: 8px 12px; font-size: 13px; width: 100%; text-align: center; }

  /* First-wash sub-table */
  .dc-firstwash__header { padding: 10px 12px; }
  .dc-firstwash__row { grid-template-columns: 1.6fr 1fr; padding: 12px; gap: 8px; }
  .dc-firstwash__group { padding: 8px 12px; font-size: 10px; }

  /* Brand toggle */
  .dc-brand-toggle { max-width: 100%; margin: 0 16px; }
  .dc-brand-toggle__btn { padding: 10px 12px; font-size: 12px; }
  .dc-brand-toggle__logo { width: 16px; height: 16px; }

  /* CTA banner */
  .dc-cta-banner { padding: 20px 16px 0; }
  .dc-cta-banner__inner { padding: 24px 20px; gap: 18px; }
  .dc-cta-banner__illus { font-size: 48px; }
  .dc-cta-banner__title { font-size: 18px; }
  .dc-cta-banner__sub { font-size: 13px; }
  .dc-cta-banner__btn { font-size: 14px; padding: 12px 18px; }

  /* Stats */
  .dc-stats { padding: 28px 16px 12px; }
  .dc-stats__inner { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .dc-stat { padding: 8px; gap: 8px; }
  .dc-stat__icon { font-size: 24px; }
  .dc-stat__num { font-size: 15px; }
  .dc-stat__lbl { font-size: 11px; }

  /* Web footer */
  .dc-web-footer { padding: 40px 16px 24px; }
  .dc-web-footer__col-title { margin-bottom: 12px; letter-spacing: 1.5px; }
  .dc-web-footer__list { gap: 8px; }
  .dc-web-footer__bar { flex-direction: column; text-align: center; }
  .dc-web-footer__bar-right { justify-content: center; }
}

@media (max-width: 400px) {
  .dc-hero__title { font-size: 22px; }
  .dc-props { grid-template-columns: 1fr; }
  .dc-brand__prices { grid-template-columns: repeat(2, 1fr) !important; }
  .dc-brand-toggle { display: block; }
  .dc-brand-toggle__btn { width: 100%; margin-bottom: 4px; }
}
.dc-price {
  background: #f8fafc; border-radius: 10px; padding: 12px 6px; text-align: center;
  border: 1px solid var(--dc-border);
}
.dc-price--pop { background: var(--dc-blue); color: #fff; border-color: var(--dc-blue); box-shadow: 0 8px 20px rgba(37,99,235,0.30); }
.dc-price--other { background: #f8fafc; border-color: var(--dc-border); }
.dc-price__unit { margin: 0; font-size: 11px; color: var(--dc-muted); font-weight: 600; }
.dc-price--pop .dc-price__unit { color: rgba(255,255,255,0.85); }
.dc-price__amt { margin: 4px 0 2px; font-size: 22px; font-weight: 800; color: var(--dc-text); letter-spacing: -0.02em; }
.dc-price--pop .dc-price__amt { color: #fff; }
.dc-price--other .dc-price__amt { color: var(--dc-text); }
.dc-price__hrs { margin: 0; font-size: 10px; color: var(--dc-muted); }
.dc-price--pop .dc-price__hrs { color: rgba(255,255,255,0.85); }
.dc-brand__perks { list-style: none; padding: 0; margin: 8px 0 0; display: flex; flex-direction: column; gap: 8px; flex: 1; }
.dc-brand__perks li { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: var(--dc-text); }
.dc-check { flex-shrink: 0; width: 18px; height: 18px; border-radius: 50%; background: var(--dc-green); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; margin-top: 1px; }
.dc-x { flex-shrink: 0; width: 18px; height: 18px; border-radius: 50%; background: var(--dc-red); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; margin-top: 1px; }
.dc-brand__note { color: var(--dc-muted); font-size: 12px; font-style: italic; }

/* FEATURES TABLE — admin-dashboard-inspired pill style */
.dc-features { padding: 32px 24px 0; }
.dc-features__card {
  max-width: 1100px; margin: 0 auto;
  background: #fff; border: 1px solid var(--dc-border);
  border-radius: 16px; overflow: hidden;
  box-shadow: 0 8px 20px rgba(15,23,42,0.05);
}
.dc-features__head { display: flex; align-items: center; gap: 12px; padding: 18px 24px; border-bottom: 1px solid var(--dc-border); }
.dc-features__icon { width: 36px; height: 36px; border-radius: 10px; background: var(--dc-blue-soft); color: var(--dc-blue); display: flex; align-items: center; justify-content: center; font-size: 18px; }
.dc-features__heading { margin: 0; font-size: 16px; font-weight: 800; color: var(--dc-text); }

.dc-features__row {
  display: grid; grid-template-columns: 1.6fr 1fr 1fr;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid var(--dc-border);
  gap: 20px;
}
.dc-features__row--last { border-bottom: none; }
.dc-features__row--header {
  background: #f8fafc;
  padding: 14px 24px;
}
.dc-features__col-label {
  font-size: 10px; font-weight: 700; letter-spacing: 1.5px;
  text-transform: uppercase; color: var(--dc-muted);
}
.dc-features__row:not(.dc-features__row--header) .dc-features__col-label {
  font-size: 14px; font-weight: 700; text-transform: none; letter-spacing: 0;
  color: var(--dc-text);
}
.dc-features__col-brand {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  font-size: 13px; font-weight: 800; letter-spacing: -0.01em;
}
.dc-features__col-brand--dc { color: var(--dc-blue); }
.dc-features__col-brand--other { color: var(--dc-muted); }
.dc-features__brand-logo { width: 20px; height: 20px; object-fit: contain; }
.dc-features__col-cell { display: flex; align-items: center; justify-content: center; }

.dc-pricepill--muted { background: #f1f5f9; color: var(--dc-muted); border: 1px solid var(--dc-border); }

.dc-yes { display: inline-flex; width: 28px; height: 28px; border-radius: 50%; background: var(--dc-green); color: #fff; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; }
.dc-no  { display: inline-flex; width: 28px; height: 28px; border-radius: 50%; background: var(--dc-red);  color: #fff; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; }

/* CTA BANNER */
.dc-cta-banner { padding: 32px 24px 0; }
.dc-cta-banner__inner { max-width: 1100px; margin: 0 auto; background: var(--dc-blue-soft); border-radius: 20px; padding: 32px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 28px; }
@media (max-width: 800px) { .dc-cta-banner__inner { grid-template-columns: 1fr; text-align: center; } }
.dc-cta-banner__illus { font-size: 68px; }
.dc-cta-banner__title { margin: 0 0 6px; font-size: 22px; font-weight: 800; color: var(--dc-text); line-height: 1.3; }
.dc-cta-banner__sub { margin: 0; font-size: 14px; color: var(--dc-muted); }
.dc-cta-banner__action { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.dc-cta-banner__buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 500px) { .dc-cta-banner__buttons { grid-template-columns: 1fr; } }
.dc-cta-banner__btn { background: #fff; color: #000; border: 1.5px solid #000; font-size: 15px; font-weight: 800; padding: 13px 22px; border-radius: 12px; text-decoration: none; transition: background 0.15s ease, color 0.15s ease; white-space: nowrap; }
.dc-cta-banner__btn:hover { background: #000; color: #fff; }
.dc-cta-banner__btn--wa { background: #fff; color: #000; border: 1.5px solid #000; }
.dc-cta-banner__btn--wa:hover { background: #000; color: #fff; }
.dc-cta-banner__tagline { margin: 0; font-size: 12px; color: var(--dc-muted); }

/* STATS */
.dc-stats { padding: 40px 24px 20px; }
.dc-stats__inner { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
@media (max-width: 768px) { .dc-stats__inner { grid-template-columns: repeat(2, 1fr); } }
.dc-stat { display: flex; align-items: center; gap: 12px; padding: 12px; }
.dc-stat__icon { font-size: 32px; }
.dc-stat__num { margin: 0; font-size: 18px; font-weight: 800; color: var(--dc-blue); line-height: 1.1; }
.dc-stat__lbl { margin: 2px 0 0; font-size: 12px; color: var(--dc-muted); font-weight: 500; }

/* WEB FOOTER — ported from booking-web homepage */
.dc-web-footer { background: #fff; border-top: 1px solid #e2e8f0; padding: 64px 24px 32px; margin-top: 40px; }
.dc-web-footer__inner { max-width: 1200px; margin: 0 auto; }
.dc-web-footer__grid { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 40px; margin-bottom: 40px; }
@media (max-width: 900px) { .dc-web-footer__grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 560px) { .dc-web-footer__grid { grid-template-columns: 1fr; gap: 32px; } }
.dc-web-footer__brand { max-width: 380px; }
.dc-web-footer__logo { height: 56px; width: auto; margin-bottom: 14px; }
.dc-web-footer__desc { margin: 0 0 18px; font-size: 13.5px; line-height: 1.65; color: #64748b; }
.dc-web-footer__contacts { display: flex; flex-direction: column; gap: 10px; }
.dc-web-footer__contact { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: #64748b; text-decoration: none; transition: color 0.15s ease; }
.dc-web-footer__contact:hover { color: var(--dc-blue); }
.dc-web-footer__contact--plain:hover { color: #64748b; cursor: default; }
.dc-web-footer__ci { font-size: 14px; color: #10b981; flex-shrink: 0; margin-top: 1px; }
.dc-web-footer__col-title { margin: 0 0 20px; font-size: 12px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #0f172a; }
.dc-web-footer__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.dc-web-footer__list a { font-size: 13.5px; color: #64748b; text-decoration: none; transition: color 0.15s ease; }
.dc-web-footer__list a:hover { color: var(--dc-blue); }
.dc-web-footer__bar {
  padding-top: 24px; border-top: 1px solid #f1f5f9;
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap; font-size: 12px; color: #94a3b8;
}
.dc-web-footer__bar-right { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.dc-web-footer__bar-right a { color: #94a3b8; text-decoration: none; transition: color 0.15s ease; }
.dc-web-footer__bar-right a:hover { color: var(--dc-blue); }
.dc-web-footer__secure { display: inline-flex; align-items: center; gap: 6px; color: #94a3b8; }
@media (max-width: 640px) {
  .dc-web-footer__bar { justify-content: center; text-align: center; }
  .dc-web-footer__bar-right { justify-content: center; }
}

/* MINI FOOTER (unused legacy) */
.dc-mini-footer { background: #fff; border-top: 1px solid var(--dc-border); margin-top: 40px; }
.dc-mini-footer__inner { max-width: 1100px; margin: 0 auto; padding: 22px 24px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.dc-mini-footer__copy { margin: 0; font-size: 12px; color: var(--dc-muted); }
.dc-mini-footer__links { display: flex; align-items: center; gap: 12px; }
.dc-mini-footer__link { font-size: 12px; color: var(--dc-muted); text-decoration: none; transition: color 0.15s ease; }
.dc-mini-footer__link:hover { color: #26ABE2; }
.dc-mini-footer__pipe { color: #e5e7eb; font-size: 12px; }
@media (max-width: 560px) { .dc-mini-footer__inner { justify-content: center; text-align: center; } }

/* FOOTER (legacy — unused) */
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
.dc-footer-block__col-title { margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #7dd3fc; }
.dc-footer-block__link { font-size: 13.5px; color: rgba(255,255,255,0.75); text-decoration: none; }
.dc-footer-block__link:hover { color: #fff; }
.dc-footer-block__meta { font-size: 13px; color: rgba(255,255,255,0.65); line-height: 1.55; }
.dc-footer-block__bar { padding-top: 24px; display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px; font-size: 12px; color: rgba(255,255,255,0.55); }
.dc-footer-block__pipe { color: rgba(255,255,255,0.30); margin: 0 2px; }
.dc-footer-block__dot { color: rgba(255,255,255,0.30); }
`;
