'use client';

import { useAuthStore } from '@/store/authStore';
import { ArrowRight, CheckCircle2, Clock, MessageCircle, Shield } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const LOGO_URL =
  'https://agyzvknaqnamaoczxgsb.supabase.co/storage/v1/object/public/doctor-clean-files/uploads/doctor_clean_logo.542c4621e2b4379e4d95.png';

export default function SignupSuccessPage() {
  const router = useRouter();
  const { user, _hasHydrated } = useAuthStore();

  // If someone navigates here without a session (e.g. deep-link), bounce them
  // to the login page — this page is only meaningful right after signup.
  useEffect(() => {
    if (_hasHydrated && !user) router.replace('/login');
  }, [_hasHydrated, user, router]);

  const name = user?.name ?? user?.username ?? 'there';

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

            <h1 className="ss-title">Application submitted!</h1>
            <p className="ss-lead">
              Thanks {name} — your Doctor Clean Partner application has been received.
            </p>

            <div className="ss-steps">
              <div className="ss-step">
                <div className="ss-step-icon ss-step-icon--done"><CheckCircle2 size={18} /></div>
                <div>
                  <p className="ss-step-title">Account created</p>
                  <p className="ss-step-desc">Your details are saved and waiting for admin review.</p>
                </div>
              </div>
              <div className="ss-step">
                <div className="ss-step-icon"><Clock size={18} /></div>
                <div>
                  <p className="ss-step-title">Under review</p>
                  <p className="ss-step-desc">Admin usually reviews within 24 hours (Mon–Sat, business hours).</p>
                </div>
              </div>
              <div className="ss-step">
                <div className="ss-step-icon"><MessageCircle size={18} /></div>
                <div>
                  <p className="ss-step-title">You&apos;ll get a WhatsApp</p>
                  <p className="ss-step-desc">
                    We&apos;ll message <strong>{user?.whatsapp_phone ?? 'your WhatsApp'}</strong> when your account is approved (or if we need more info).
                  </p>
                </div>
              </div>
            </div>

            <div className="ss-cta">
              <Link href="/dashboard" className="ss-btn-primary">
                Go to dashboard
                <ArrowRight size={16} />
              </Link>
              <p className="ss-help">
                Booking is unlocked as soon as admin approves you. In the meantime you can explore the dashboard.
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
