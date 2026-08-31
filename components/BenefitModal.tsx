'use client';

import { useEffect, useState } from 'react';
import { X, Gift, CalendarClock } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

// Session flag: login handlers set this immediately before router.push.
// Local flag: user's "Never show again" dismissal, keyed per-partner so a
// dismissal by one user on a shared browser doesn't silence a colleague.
const SESSION_FLAG_KEY = 'dc-show-benefit';
const DISMISSED_KEY_PREFIX = 'dc-benefit-dismissed:';

function formatDiscount(
  type: 'percent' | 'flat' | null | undefined,
  value: number | undefined
): string | null {
  if (!type || !value || value <= 0) return null;
  if (type === 'percent') return `${value}% OFF`;
  return `S$${Number(value).toFixed(2)} OFF`;
}

function paymentTermsCopy(
  terms: 'upfront' | 'end_of_month' | null | undefined
): { title: string; body: string } | null {
  if (terms === 'end_of_month') {
    return {
      title: 'End of Month (invoiced)',
      body: 'Bookings are confirmed immediately. We invoice at month-end for all jobs.',
    };
  }
  if (terms === 'upfront') {
    return {
      title: 'Upfront (Stripe)',
      body: 'Bookings are confirmed as soon as payment clears through Stripe.',
    };
  }
  return null;
}

export function BenefitModal() {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [neverShow, setNeverShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!user?.id) return;
    const shouldShow = sessionStorage.getItem(SESSION_FLAG_KEY) === '1';
    const dismissed = localStorage.getItem(`${DISMISSED_KEY_PREFIX}${user.id}`) === '1';
    // Always clear the session flag — a refresh on /dashboard shouldn't re-open
    // the modal, only a fresh login should.
    sessionStorage.removeItem(SESSION_FLAG_KEY);
    if (shouldShow && !dismissed) {
      setOpen(true);
    }
  }, [user?.id]);

  if (!open || !user) return null;

  const companyName = user.company_name ?? 'your company';
  const discount = formatDiscount(user.company_discount_type, user.company_discount_value);
  const payment = paymentTermsCopy(user.company_payment_terms);

  const close = () => {
    if (neverShow) {
      try {
        localStorage.setItem(`${DISMISSED_KEY_PREFIX}${user.id}`, '1');
      } catch { /* private-mode etc — dismiss just applies to this session */ }
    }
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="benefit-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 100,
        animation: 'dcBenefitFade 180ms ease-out',
      }}
    >
      <style>{`
        @keyframes dcBenefitFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes dcBenefitPop { from { opacity: 0; transform: translateY(8px) scale(0.98) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>
      <div
        style={{
          background: '#ffffff',
          borderRadius: 20,
          maxWidth: 460,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '28px 24px 24px',
          boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.25)',
          position: 'relative',
          animation: 'dcBenefitPop 220ms ease-out',
        }}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: '#f1f5f9',
            border: 'none',
            borderRadius: 999,
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#475569',
          }}
        >
          <X size={16} />
        </button>

        <h2
          id="benefit-modal-title"
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: '#0f172a',
            margin: '0 0 4px',
            letterSpacing: '-0.01em',
          }}
        >
          Your Partner Benefits
        </h2>
        <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 20px', fontWeight: 600 }}>
          {companyName}
        </p>

        {discount && (
          <BenefitCard
            Icon={Gift}
            label="Discount"
            value={discount}
            description={`Applied automatically to every booking made under ${companyName}.`}
            accent="#059669"
            accentBg="#ecfdf5"
          />
        )}

        {payment && (
          <BenefitCard
            Icon={CalendarClock}
            label="Payment Terms"
            value={payment.title}
            description={payment.body}
            accent="#2563eb"
            accentBg="#eff6ff"
          />
        )}

        {!discount && !payment && (
          <p style={{ fontSize: 14, color: '#64748b', margin: '12px 0 20px' }}>
            Your account is set up. Benefits will appear here once your admin
            configures them for {companyName}.
          </p>
        )}

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 18,
            fontSize: 13,
            color: '#475569',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={neverShow}
            onChange={(e) => setNeverShow(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          Don&apos;t show this again
        </label>

        <button
          type="button"
          onClick={close}
          style={{
            width: '100%',
            marginTop: 14,
            background: '#0f172a',
            color: '#ffffff',
            border: 'none',
            borderRadius: 12,
            padding: '12px 16px',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function BenefitCard({
  Icon,
  label,
  value,
  description,
  accent,
  accentBg,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  value: string;
  description: string;
  accent: string;
  accentBg: string;
}) {
  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 14,
        padding: '14px 16px',
        marginBottom: 12,
        background: '#ffffff',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: accentBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={16} color={accent} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent, letterSpacing: '-0.01em', margin: '2px 0 6px' }}>
        {value}
      </div>
      <p style={{ fontSize: 13, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
        {description}
      </p>
    </div>
  );
}
