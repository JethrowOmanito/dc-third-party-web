'use client';

import { useAuthStore } from '@/store/authStore';
import { getSupabaseClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { ArrowRight, CheckCircle2, Clock, MessageCircle, Shield } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const LOGO_URL =
  'https://agyzvknaqnamaoczxgsb.supabase.co/storage/v1/object/public/doctor-clean-files/uploads/doctor_clean_logo.542c4621e2b4379e4d95.png';

export default function SignupSuccessPage() {
  const router = useRouter();
  const { user, _hasHydrated, refresh } = useAuthStore();

  // If someone navigates here without a session (e.g. deep-link), bounce them
  // to the login page — this page is only meaningful right after signup.
  useEffect(() => {
    if (_hasHydrated && !user) router.replace('/login');
  }, [_hasHydrated, user, router]);

  // Refresh the session once on mount so the local `user` reflects
  // status changes the server made post-signup (e.g. company_status
  // flipping to 'approved' after doc uploads for ID). Without this
  // the boss briefly sees the onboarding page when clicking through
  // to the dashboard, because AuthGuard reads stale `pending' status.
  useEffect(() => {
    if (_hasHydrated && user) {
      refresh?.().catch(() => { /* silent — 30s poll will catch up */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_hasHydrated]);

  // Real-time updates via Supabase Broadcast — main-web fires an event
  // on the partner-user:<id> channel when Zoe approves/rejects, and on
  // partner-company:<id> when she PATCHes anything on the company
  // (payment_terms, name, etc.). We just call refresh() on receipt —
  // /api/auth/me returns the fresh state and the stage flips.
  //
  // Broadcast doesn't need partner_user or partner_companies to be on
  // the realtime publication (both were trimmed 2026-09-11), it's a
  // pure pub/sub channel keyed by name.
  //
  // Falls back to a 10s poll below in case the broadcast connection is
  // slow to establish or Zoe's PATCH races the client's subscribe. Poll
  // is paused on hidden tabs so backgrounded windows don't spam.
  useEffect(() => {
    if (!_hasHydrated || !user || !refresh) return;
    const supabase = getSupabaseClient();
    const channels = [
      supabase
        .channel(`partner-user:${user.id}`)
        .on('broadcast', { event: '*' }, () => {
          refresh?.().catch(() => { /* silent */ });
        })
        .subscribe(),
    ];
    if (user.company_id) {
      channels.push(
        supabase
          .channel(`partner-company:${user.company_id}`)
          .on('broadcast', { event: '*' }, () => {
            refresh?.().catch(() => { /* silent */ });
          })
          .subscribe(),
      );
    }
    return () => {
      channels.forEach((ch) => { supabase.removeChannel(ch); });
    };
  }, [_hasHydrated, user, refresh]);

  // Fallback poll — covers the small window between mount and channel
  // SUBSCRIBED state, plus any broadcast delivery misses. 10s cadence,
  // paused on hidden tabs.
  useEffect(() => {
    if (!_hasHydrated || !user || !refresh) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      refresh().catch(() => { /* silent — next tick will retry */ });
    };
    const interval = setInterval(tick, 10_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [_hasHydrated, user, refresh]);

  const name = user?.name ?? user?.username ?? 'there';

  // Three-state copy branching driven by the two independent gates:
  //   1. approval_status ('pending' → Zoe hasn't reviewed yet; ID case)
  //   2. company_payment_terms (null/undefined → Zoe hasn't activated
  //      booking yet; blocks the submit route regardless of approval)
  //
  // 'application' → not yet approved (ID pending Zoe's review)
  // 'awaiting_terms' → approved but no payment terms set — auto-approved
  //                    non-ID that hasn't been fully activated yet
  // 'activated' → approved + payment terms set — can create bookings
  //
  // Previously only checked approval_status, so non-ID auto-approved
  // partners saw "Booking activation pending" forever, never updating
  // after Zoe set the payment terms.
  const stage: 'application' | 'awaiting_terms' | 'activated' =
    user?.approval_status === 'pending'
      ? 'application'
      : user?.company_payment_terms === 'upfront' || user?.company_payment_terms === 'end_of_month'
      ? 'activated'
      : 'awaiting_terms';

  return (
    <>
      <style>{CSS}</style>
      <div className="ss-wrap">
        <div className="ss-container">
          <div className="ss-brand">
            <img src={LOGO_URL} alt="Doctor Clean" />
          </div>

          <div className="ss-card">
            <div className="ss-badge">
              <CheckCircle2 size={56} />
            </div>

            <h1 className="ss-title">
              {stage === 'application'
                ? 'Application submitted!'
                : stage === 'awaiting_terms'
                ? "You're in!"
                : "You're fully activated!"}
            </h1>
            <p className="ss-lead">
              {stage === 'application' && <>Thanks {name} — your Doctor Clean Partner application has been received.</>}
              {stage === 'awaiting_terms' && <>Thanks {name} — your Doctor Clean Partner account is ready.</>}
              {stage === 'activated' && <>Thanks {name} — booking is now enabled on your account. Head to your dashboard to create your first job.</>}
            </p>

            <div className="ss-steps">
              {/* Step 1 — Account created (always green) */}
              <div className="ss-step">
                <div className="ss-step-icon ss-step-icon--done"><CheckCircle2 size={18} /></div>
                <div>
                  <p className="ss-step-title">Account created</p>
                  <p className="ss-step-desc">
                    {stage === 'application'
                      ? 'Your details are saved and awaiting admin review.'
                      : 'You can log in and explore the dashboard right now.'}
                  </p>
                </div>
              </div>

              {/* Step 2 — Under review OR Booking activation. Turns green
                  once we're past 'awaiting_terms' into 'activated'. */}
              <div className="ss-step">
                <div className={cn('ss-step-icon', stage === 'activated' && 'ss-step-icon--done')}>
                  {stage === 'activated' ? <CheckCircle2 size={18} /> : <Clock size={18} />}
                </div>
                <div>
                  <p className="ss-step-title">
                    {stage === 'application'
                      ? 'Under review'
                      : stage === 'awaiting_terms'
                      ? 'Booking activation pending'
                      : 'Booking activated'}
                  </p>
                  <p className="ss-step-desc">
                    {stage === 'application'
                      ? 'Admin usually reviews within 24 hours (Mon–Sat, business hours).'
                      : stage === 'awaiting_terms'
                      ? 'Our admin will set your payment terms — usually within 24 hours (Mon–Sat, business hours). Booking creation unlocks once that’s done.'
                      : (
                        <>Payment terms set: <strong>{user?.company_payment_terms === 'end_of_month' ? 'End-of-month invoice' : 'Upfront (per booking)'}</strong>. You can create bookings now.</>
                      )}
                  </p>
                </div>
              </div>

              {/* Step 3 — WhatsApp confirmation. Only shown while we're
                  waiting on something; once activated the WhatsApp has
                  already gone out, so we swap it for a "start booking"
                  CTA hint. */}
              {stage !== 'activated' ? (
                <div className="ss-step">
                  <div className="ss-step-icon"><MessageCircle size={18} /></div>
                  <div>
                    <p className="ss-step-title">You&apos;ll get a WhatsApp</p>
                    <p className="ss-step-desc">
                      We&apos;ll message <strong>{user?.whatsapp_phone ?? 'your WhatsApp'}</strong>
                      {stage === 'application'
                        ? ' when your account is approved (or if we need more info).'
                        : ' when booking is enabled (or if we need any extra info).'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="ss-step">
                  <div className="ss-step-icon ss-step-icon--done"><CheckCircle2 size={18} /></div>
                  <div>
                    <p className="ss-step-title">Notification sent</p>
                    <p className="ss-step-desc">
                      We&apos;ve messaged <strong>{user?.whatsapp_phone ?? 'your WhatsApp'}</strong> with your activation details.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="ss-cta">
              <Link
                href={stage === 'activated' ? '/dashboard/booking/new' : '/dashboard'}
                className="ss-btn-primary"
              >
                {stage === 'activated' ? 'Create your first booking' : 'Go to dashboard'}
                <ArrowRight size={16} />
              </Link>
              <p className="ss-help">
                {stage === 'application'
                  ? 'Booking is unlocked as soon as admin approves your account.'
                  : stage === 'awaiting_terms'
                  ? 'Explore now, book once admin sets your payment terms.'
                  : "You're all set — click above to create a booking."}
              </p>
            </div>

            <div className="ss-contact">
              <p>
                Need help? WhatsApp us at{' '}
                <a href="https://wa.me/6588656751" target="_blank" rel="noopener noreferrer" className="ss-link">
                  +65 8865 6751
                </a>
                .
              </p>
            </div>
          </div>

          <div className="ss-footer">
            <Shield size={13} />
            <span>Secure</span>
            <span className="ss-dot">•</span>
            <span>Reliable</span>
          </div>
        </div>
      </div>
    </>
  );
}

const CSS = `
:root {
  --dc-green: #0eae8b;
  --dc-green-dark: #079c7c;
  --dc-green-soft: rgba(20,174,143,0.10);
  --dc-navy: #13233f;
  --dc-text: #334155;
  --dc-muted: #718096;
  --dc-border: #dce2e9;
}
.ss-wrap {
  min-height: 100vh;
  background:
    radial-gradient(circle at 25% 40%, rgba(22,180,145,0.08), transparent 45%),
    linear-gradient(135deg, #f4fff9 0%, #ffffff 48%, #ffffff 100%);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--dc-text);
  padding: 32px 16px;
  display: flex; align-items: flex-start; justify-content: center;
}
.ss-wrap * { box-sizing: border-box; }
.ss-container { width: 100%; max-width: 540px; margin: 0 auto; }
.ss-brand { text-align: center; margin-bottom: 24px; }
.ss-brand img { width: 120px; height: auto; }

.ss-card {
  padding: 36px 32px 28px;
  background: rgba(255,255,255,0.96);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(226,232,240,0.8);
  border-radius: 22px;
  box-shadow: 0 25px 60px rgba(15,23,42,0.08), 0 5px 15px rgba(15,23,42,0.04);
  text-align: center;
}

.ss-badge {
  width: 84px; height: 84px; margin: 0 auto 16px;
  border-radius: 50%;
  background: var(--dc-green-soft);
  display: flex; align-items: center; justify-content: center;
  color: var(--dc-green);
  animation: ss-pop 500ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes ss-pop {
  0%   { transform: scale(0.3); opacity: 0; }
  100% { transform: scale(1);   opacity: 1; }
}

.ss-title { margin: 0; font-size: 26px; font-weight: 800; color: var(--dc-navy); letter-spacing: -0.025em; }
.ss-lead  { margin: 8px 0 24px; font-size: 14.5px; color: var(--dc-muted); line-height: 1.55; }

.ss-steps {
  display: flex; flex-direction: column; gap: 12px;
  text-align: left;
  margin-bottom: 24px;
}
.ss-step {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 14px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 12px;
}
.ss-step-icon {
  width: 36px; height: 36px; flex-shrink: 0;
  border-radius: 50%;
  background: #fff;
  color: var(--dc-muted);
  border: 1.5px solid var(--dc-border);
  display: flex; align-items: center; justify-content: center;
}
.ss-step-icon--done {
  background: var(--dc-green-soft);
  color: var(--dc-green);
  border-color: rgba(20,174,143,0.30);
}
.ss-step-title {
  margin: 0; font-size: 14px; font-weight: 700; color: var(--dc-navy);
}
.ss-step-desc {
  margin: 2px 0 0; font-size: 12.5px; color: var(--dc-muted); line-height: 1.5;
}
.ss-step-desc strong { color: var(--dc-navy); font-weight: 600; }

.ss-cta { margin-bottom: 20px; }
.ss-btn-primary {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 10px;
  height: 52px; padding: 0 22px;
  border-radius: 14px; border: none;
  background: var(--dc-green); color: #fff;
  font-size: 15px; font-weight: 800; font-family: inherit;
  text-decoration: none; cursor: pointer;
  box-shadow: 0 10px 20px rgba(14,174,139,0.22);
  transition: background 150ms ease, transform 150ms ease;
}
.ss-btn-primary:hover { background: var(--dc-green-dark); transform: translateY(-1px); }
.ss-help {
  margin: 10px 0 0; font-size: 12px; color: var(--dc-muted); line-height: 1.5;
}

.ss-contact {
  padding-top: 18px; border-top: 1px solid #eef2f7;
  font-size: 13px; color: var(--dc-muted);
}
.ss-contact p { margin: 0; }
.ss-link { color: var(--dc-green); font-weight: 600; text-decoration: none; }
.ss-link:hover { color: var(--dc-green-dark); }

.ss-footer {
  margin-top: 22px; display: flex; align-items: center; justify-content: center;
  gap: 8px; font-size: 12.5px; font-weight: 500; color: #64748b;
}
.ss-footer svg { color: var(--dc-green); }
.ss-dot { color: #cbd5e1; }

@media (max-width: 480px) {
  .ss-card { padding: 28px 20px 20px; }
  .ss-title { font-size: 22px; }
}
`;
