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

export default function PricingClient({ tccRows, idRows }: { tccRows: Row[]; idRows: Row[] }) {
  const [activeProp, setActiveProp] = useState<PropertyKey>('hdb');
  const activeCfg = PROPERTY_TYPES.find(p => p.key === activeProp)!;

  // Filter both datasets to the active section, sort by unit sort_order
  const dcUnits = useMemo(
    () => idRows.filter(r => r.section === activeCfg.section).sort((a, b) => a.sort_order - b.sort_order),
    [idRows, activeCfg.section]
  );
  const otherUnits = useMemo(
    () => tccRows.filter(r => r.section === activeCfg.section).sort((a, b) => a.sort_order - b.sort_order),
    [tccRows, activeCfg.section]
  );

  // Highlight the middle unit ("Most Popular") — typically 3rd row
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
              <p className="dc-nav__subtitle">A Cleaner Home · A Happier You</p>
            </div>
          </a>
          <div className="dc-nav__links">
            <a href="#home" className="dc-nav__link">Home</a>
            <a href="#services" className="dc-nav__link">Services</a>
            <a href="#pricing" className="dc-nav__link dc-nav__link--active">Pricing</a>
            <a href="#why" className="dc-nav__link">Why Us</a>
            <a href="#reviews" className="dc-nav__link">Reviews</a>
            <a href="#faq" className="dc-nav__link">FAQ</a>
          </div>
          <a
            href="https://wa.me/6589182880?text=Hi%2C%20I%27d%20like%20to%20book%20a%20cleaning."
            target="_blank" rel="noopener noreferrer"
            className="dc-nav__cta"
          >
            Book Now
          </a>
        </div>
      </nav>

      {/* Hero */}
      <header className="dc-hero" id="pricing">
        <div className="dc-hero__inner">
          <span className="dc-hero__kicker">PRICE COMPARISON</span>
          <h1 className="dc-hero__title">
            Doctor Clean <span className="dc-hero__accent">vs TCC</span>
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
              <span className="dc-brand__icon">🏠</span>
              <div>
                <p className="dc-brand__name">Doctor Clean</p>
                <p className="dc-brand__tag">A Cleaner Home · A Happier You</p>
              </div>
            </div>
            <div className="dc-brand__prices">
              {dcUnits.length === 0 ? (
                <p className="dc-brand__empty">Pricing coming soon for {activeCfg.label}.</p>
              ) : dcUnits.map((u, i) => (
                <div key={i} className={`dc-price ${i === popularIdx ? 'dc-price--pop' : ''}`}>
                  <p className="dc-price__unit">{u.unit_label}</p>
                  <p className="dc-price__amt">{u.is_tbq ? 'TBQ' : fmtPrice(u.ala_carte_price)}</p>
                  <p className="dc-price__hrs">{hoursFor(u.unit_label)}</p>
                </div>
              ))}
            </div>
            <ul className="dc-brand__perks">
              <li><span className="dc-check">✓</span>Professional &amp; Trained Cleaners</li>
              <li><span className="dc-check">✓</span>Bring Our Own Cleaning Supplies</li>
              <li><span className="dc-check">✓</span>Same-Day Booking (Subject to Availability)</li>
            </ul>
          </div>

          {/* TCC */}
          <div className="dc-brand dc-brand--other">
            <div className="dc-brand__head">
              <span className="dc-brand__icon dc-brand__icon--muted">🏠</span>
              <div>
                <p className="dc-brand__name">TCC</p>
                <p className="dc-brand__tag">&nbsp;</p>
              </div>
            </div>
            <div className="dc-brand__prices">
              {otherUnits.length === 0 ? (
                <p className="dc-brand__empty">No comparison data available.</p>
              ) : otherUnits.map((u, i) => (
                <div key={i} className="dc-price dc-price--other">
                  <p className="dc-price__unit">{u.unit_label}</p>
                  <p className="dc-price__amt">{u.is_tbq ? 'TBQ' : fmtPrice(u.ala_carte_price)}</p>
                  <p className="dc-price__hrs">{hoursFor(u.unit_label)}</p>
                </div>
              ))}
            </div>
            <ul className="dc-brand__perks dc-brand__perks--other">
              <li><span className="dc-x">✗</span>Basic Cleaning Service</li>
              <li><span className="dc-x">✗</span>Cleaning Supplies Not Included <span className="dc-brand__note">(Additional charges may apply)</span></li>
              <li><span className="dc-x">✗</span>Limited Booking Slots</li>
              <li><span className="dc-x">✗</span>Hidden Fees <span className="dc-brand__note">(May include travel or equipment charges)</span></li>
            </ul>
          </div>
        </div>
      </section>

      {/* Feature comparison table */}
      <section className="dc-features">
        <div className="dc-features__card">
          <table className="dc-features__table">
            <thead>
              <tr>
                <th>Features</th>
                <th className="dc-features__col dc-features__col--dc">🏠 Doctor Clean</th>
                <th className="dc-features__col dc-features__col--other">🏠 TCC</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Price ({popularDc?.unit_label ?? '—'})</td>
                <td className="dc-features__center dc-features__big">{popularDc ? fmtPrice(popularDc.ala_carte_price) : '—'}</td>
                <td className="dc-features__center dc-features__big dc-features__muted">{popularOther ? fmtPrice(popularOther.ala_carte_price) : '—'}</td>
              </tr>
              <tr><td>Professional Cleaners</td><td className="dc-features__center"><span className="dc-yes">✓</span></td><td className="dc-features__center"><span className="dc-yes">✓</span></td></tr>
              <tr><td>Cleaning Supplies Provided</td><td className="dc-features__center"><span className="dc-yes">✓</span></td><td className="dc-features__center"><span className="dc-no">✗</span></td></tr>
              <tr><td>Same-Day Booking</td><td className="dc-features__center"><span className="dc-yes">✓</span></td><td className="dc-features__center"><span className="dc-yes">✓</span></td></tr>
              <tr><td>Hidden Fees</td><td className="dc-features__center"><span className="dc-no">✗</span></td><td className="dc-features__center"><span className="dc-no">✗</span></td></tr>
              <tr><td>Customer Support</td><td className="dc-features__center dc-features__pos">7 Days a Week</td><td className="dc-features__center dc-features__neg">Weekdays Only</td></tr>
              <tr><td>Satisfaction Guarantee</td><td className="dc-features__center"><span className="dc-yes">✓</span></td><td className="dc-features__center"><span className="dc-no">✗</span></td></tr>
            </tbody>
          </table>
        </div>
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
            <a
              href="https://wa.me/6589182880?text=Hi%2C%20I%27d%20like%20to%20book%20a%20cleaning."
              target="_blank" rel="noopener noreferrer"
              className="dc-cta-banner__btn"
            >
              Book Your Cleaning Now →
            </a>
            <p className="dc-cta-banner__tagline">A Cleaner Home. A Happier You.</p>
          </div>
        </div>
      </section>

      {/* Trust stats */}
      <section className="dc-stats">
        <div className="dc-stats__inner">
          <div className="dc-stat"><span className="dc-stat__icon">👥</span><div><p className="dc-stat__num">10,000+</p><p className="dc-stat__lbl">Homes Cleaned</p></div></div>
          <div className="dc-stat"><span className="dc-stat__icon">⭐</span><div><p className="dc-stat__num">4.9/5</p><p className="dc-stat__lbl">Customer Rating</p></div></div>
          <div className="dc-stat"><span className="dc-stat__icon">🛡️</span><div><p className="dc-stat__num">100%</p><p className="dc-stat__lbl">Satisfaction Guaranteed</p></div></div>
          <div className="dc-stat"><span className="dc-stat__icon">🌿</span><div><p className="dc-stat__num">A Cleaner, Healthier</p><p className="dc-stat__lbl">Singapore</p></div></div>
        </div>
      </section>

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
              <a href="https://wa.me/6589182880" className="dc-footer-block__link" target="_blank" rel="noopener noreferrer">WhatsApp: +65 8918 2880</a>
              <a href="mailto:sales@doctorclean.com.sg" className="dc-footer-block__link">sales@doctorclean.com.sg</a>
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
  --dc-blue: #2563eb;
  --dc-blue-dark: #1d4ed8;
  --dc-blue-soft: #dbeafe;
  --dc-blue-tint: #eff6ff;
  --dc-navy: #1e3a8a;
  --dc-text: #1f2937;
  --dc-muted: #64748b;
  --dc-border: #e2e8f0;
  --dc-green: #22c55e;
  --dc-red: #ef4444;
  --dc-page-bg: #f0f7ff;
}
.dc-pricing {
  min-height: 100vh;
  background: linear-gradient(180deg, #ffffff 0%, #f0f7ff 200px, #f0f7ff 100%);
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
.dc-nav__cta { font-size: 14px; font-weight: 700; color: #fff; background: var(--dc-blue); padding: 10px 22px; border-radius: 999px; text-decoration: none; box-shadow: 0 4px 12px rgba(37,99,235,0.25); }
.dc-nav__cta:hover { background: var(--dc-blue-dark); }
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

/* COMPARE */
.dc-compare { padding: 28px 24px 0; }
.dc-compare__grid { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 900px) { .dc-compare__grid { grid-template-columns: 1fr; } }
.dc-brand { position: relative; border-radius: 20px; padding: 32px 24px 24px; }
.dc-brand--dc { background: var(--dc-blue-tint); border: 2px solid var(--dc-blue-soft); }
.dc-brand--other { background: #f8fafc; border: 2px solid var(--dc-border); }
.dc-brand__ribbon {
  position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
  background: var(--dc-green); color: #fff;
  font-size: 12px; font-weight: 800; letter-spacing: 0.3px;
  padding: 6px 18px; border-radius: 100px;
  box-shadow: 0 4px 10px rgba(34,197,94,0.30);
  white-space: nowrap;
}
.dc-brand__head { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; justify-content: center; }
.dc-brand__icon { font-size: 32px; }
.dc-brand__icon--muted { opacity: 0.4; }
.dc-brand__name { margin: 0; font-size: 22px; font-weight: 800; color: var(--dc-blue); letter-spacing: -0.02em; }
.dc-brand--other .dc-brand__name { color: var(--dc-muted); }
.dc-brand__tag { margin: 2px 0 0; font-size: 11px; color: var(--dc-muted); font-weight: 500; min-height: 16px; }
.dc-brand__prices { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 20px; }
@media (max-width: 560px) { .dc-brand__prices { grid-template-columns: repeat(3, 1fr); } }
.dc-brand__empty { grid-column: 1 / -1; text-align: center; color: var(--dc-muted); padding: 24px 0; font-size: 14px; }
.dc-price {
  background: #fff; border-radius: 10px; padding: 12px 6px; text-align: center;
  border: 1px solid transparent;
}
.dc-price--pop { background: var(--dc-blue); color: #fff; box-shadow: 0 8px 20px rgba(37,99,235,0.30); }
.dc-price--other { background: #fff; }
.dc-price__unit { margin: 0; font-size: 11px; color: var(--dc-muted); font-weight: 600; }
.dc-price--pop .dc-price__unit { color: rgba(255,255,255,0.85); }
.dc-price__amt { margin: 4px 0 2px; font-size: 22px; font-weight: 800; color: var(--dc-text); letter-spacing: -0.02em; }
.dc-price--pop .dc-price__amt { color: #fff; }
.dc-price--other .dc-price__amt { color: var(--dc-text); }
.dc-price__hrs { margin: 0; font-size: 10px; color: var(--dc-muted); }
.dc-price--pop .dc-price__hrs { color: rgba(255,255,255,0.85); }
.dc-brand__perks { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.dc-brand__perks li { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: var(--dc-text); }
.dc-check { flex-shrink: 0; width: 18px; height: 18px; border-radius: 50%; background: var(--dc-green); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; margin-top: 1px; }
.dc-x { flex-shrink: 0; width: 18px; height: 18px; border-radius: 50%; background: var(--dc-red); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; margin-top: 1px; }
.dc-brand__note { color: var(--dc-muted); font-size: 12px; font-style: italic; }

/* FEATURES TABLE */
.dc-features { padding: 32px 24px 0; }
.dc-features__card { max-width: 1100px; margin: 0 auto; background: #fff; border: 1px solid var(--dc-border); border-radius: 16px; overflow: hidden; }
.dc-features__table { width: 100%; border-collapse: collapse; font-size: 14px; }
.dc-features__table thead th {
  padding: 16px 20px; text-align: left; font-size: 14px; font-weight: 700;
  color: var(--dc-text); background: #f8fafc; border-bottom: 1px solid var(--dc-border);
}
.dc-features__col { text-align: center !important; }
.dc-features__col--dc { color: var(--dc-blue); }
.dc-features__col--other { color: var(--dc-muted); }
.dc-features__table tbody td { padding: 14px 20px; border-bottom: 1px solid var(--dc-border); color: var(--dc-text); }
.dc-features__table tbody tr:last-child td { border-bottom: none; }
.dc-features__center { text-align: center; }
.dc-features__big { font-size: 18px; font-weight: 800; color: var(--dc-text); }
.dc-features__muted { color: var(--dc-muted); }
.dc-features__pos { color: var(--dc-green); font-weight: 700; }
.dc-features__neg { color: var(--dc-red); font-weight: 700; }
.dc-yes { display: inline-flex; width: 24px; height: 24px; border-radius: 50%; background: var(--dc-green); color: #fff; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; }
.dc-no  { display: inline-flex; width: 24px; height: 24px; border-radius: 50%; background: var(--dc-red);  color: #fff; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; }

/* CTA BANNER */
.dc-cta-banner { padding: 32px 24px 0; }
.dc-cta-banner__inner { max-width: 1100px; margin: 0 auto; background: var(--dc-blue-soft); border-radius: 20px; padding: 32px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 28px; }
@media (max-width: 800px) { .dc-cta-banner__inner { grid-template-columns: 1fr; text-align: center; } }
.dc-cta-banner__illus { font-size: 68px; }
.dc-cta-banner__title { margin: 0 0 6px; font-size: 22px; font-weight: 800; color: var(--dc-text); line-height: 1.3; }
.dc-cta-banner__sub { margin: 0; font-size: 14px; color: var(--dc-muted); }
.dc-cta-banner__action { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.dc-cta-banner__btn { background: var(--dc-blue); color: #fff; font-size: 16px; font-weight: 800; padding: 14px 28px; border-radius: 12px; text-decoration: none; box-shadow: 0 8px 20px rgba(37,99,235,0.30); transition: background 0.15s ease; }
.dc-cta-banner__btn:hover { background: var(--dc-blue-dark); }
.dc-cta-banner__tagline { margin: 0; font-size: 12px; color: var(--dc-muted); }

/* STATS */
.dc-stats { padding: 40px 24px 20px; }
.dc-stats__inner { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
@media (max-width: 768px) { .dc-stats__inner { grid-template-columns: repeat(2, 1fr); } }
.dc-stat { display: flex; align-items: center; gap: 12px; padding: 12px; }
.dc-stat__icon { font-size: 32px; }
.dc-stat__num { margin: 0; font-size: 18px; font-weight: 800; color: var(--dc-blue); line-height: 1.1; }
.dc-stat__lbl { margin: 2px 0 0; font-size: 12px; color: var(--dc-muted); font-weight: 500; }

/* FOOTER */
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
