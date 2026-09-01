'use client';

import { ArrowLeft, Check, CheckCircle2, Eye, EyeOff, Loader2, Lock, MessageCircle, Phone, Shield } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const LOGO_URL =
  'https://agyzvknaqnamaoczxgsb.supabase.co/storage/v1/object/public/doctor-clean-files/uploads/doctor_clean_logo.542c4621e2b4379e4d95.png';

type Stage = 'phone' | 'code' | 'done';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');

  async function handleSend() {
    setError('');
    if (phone.trim().length < 8) {
      setError('Enter your WhatsApp number with country code.');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/auth/forgot-password/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Could not send code.');
        return;
      }
      setStage('code');
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSending(false);
    }
  }

  async function handleReset() {
    setError('');
    if (code.length !== 6) { setError('Enter the 6-digit code.'); return; }
    if (newPwd.length < 8)  { setError('New password must be at least 8 characters.'); return; }
    if (newPwd !== confirmPwd) { setError('Passwords don\'t match.'); return; }
    setResetting(true);
    try {
      const res = await fetch('/api/auth/forgot-password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), code, new_password: newPwd }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Reset failed.');
        return;
      }
      setStage('done');
      // Bounce to login after 3s
      setTimeout(() => router.replace('/login'), 3000);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="fp-wrap">
        <div className="fp-container">
          <div className="fp-brand">
            <img src={LOGO_URL} alt="Doctor Clean" />
          </div>

          <div className="fp-card">
            <div className="fp-header">
              <h1 className="fp-title">
                {stage === 'phone' && 'Forgot Password'}
                {stage === 'code'  && 'Enter Verification Code'}
                {stage === 'done'  && 'Password Reset'}
              </h1>
              <p className="fp-subtitle">
                {stage === 'phone' && 'We\'ll send a 6-digit code to your registered WhatsApp number.'}
                {stage === 'code'  && `A 6-digit code was sent to ${phone}. Enter it below with your new password.`}
                {stage === 'done'  && 'Your password has been updated. Redirecting you to login…'}
              </p>
            </div>

            {error && <div className="fp-error">{error}</div>}

            {stage === 'phone' && (
              <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="fp-form">
                <div className="fp-field">
                  <label htmlFor="fp-phone" className="fp-label">WhatsApp Number</label>
                  <div className="fp-input-wrap">
                    <Phone className="fp-input-icon" size={18} />
                    <input
                      id="fp-phone"
                      type="tel"
                      autoFocus
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+65 8888 8888 or +91 99558 32189"
                      autoComplete="tel"
                      className="fp-input"
                    />
                  </div>
                  <p className="fp-hint">Include your country code.</p>
                </div>

                <button
                  type="submit"
                  disabled={sending || phone.trim().length < 8}
                  className="fp-btn-primary"
                >
                  {sending ? (<><Loader2 className="fp-spin" size={16} />Sending…</>) : (<><MessageCircle size={16} />Send code via WhatsApp</>)}
                </button>
              </form>
            )}

            {stage === 'code' && (
              <form onSubmit={e => { e.preventDefault(); handleReset(); }} className="fp-form">
                <div className="fp-field">
                  <label htmlFor="fp-code" className="fp-label">Verification code</label>
                  <input
                    id="fp-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    autoFocus
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="fp-input fp-input--code"
                  />
                </div>

                <div className="fp-field">
                  <label htmlFor="fp-newpwd" className="fp-label">New password</label>
                  <div className="fp-input-wrap">
                    <Lock className="fp-input-icon" size={18} />
                    <input
                      id="fp-newpwd"
                      type={showPwd ? 'text' : 'password'}
                      value={newPwd}
                      onChange={e => setNewPwd(e.target.value)}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      className="fp-input fp-input--password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(v => !v)}
                      className="fp-eye"
                      aria-label={showPwd ? 'Hide password' : 'Show password'}
                    >
                      {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="fp-field">
                  <label htmlFor="fp-confirmpwd" className="fp-label">Confirm new password</label>
                  <div className="fp-input-wrap">
                    <Lock className="fp-input-icon" size={18} />
                    <input
                      id="fp-confirmpwd"
                      type={showPwd ? 'text' : 'password'}
                      value={confirmPwd}
                      onChange={e => setConfirmPwd(e.target.value)}
                      placeholder="Repeat password"
                      autoComplete="new-password"
                      className="fp-input fp-input--password"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={resetting || code.length !== 6 || newPwd.length < 8}
                  className="fp-btn-primary"
                >
                  {resetting ? (<><Loader2 className="fp-spin" size={16} />Resetting…</>) : (<><Check size={16} />Reset password</>)}
                </button>

                <button
                  type="button"
                  onClick={() => { setStage('phone'); setCode(''); setNewPwd(''); setConfirmPwd(''); setError(''); }}
                  className="fp-btn-link"
                >
                  Use a different number
                </button>
              </form>
            )}

            {stage === 'done' && (
              <div className="fp-success">
                <div className="fp-success-badge">
                  <CheckCircle2 size={44} />
                </div>
                <p className="fp-success-msg">You can now log in with your new password.</p>
                <Link href="/login" className="fp-btn-primary" style={{ marginTop: 12, textDecoration: 'none' }}>
                  <ArrowLeft size={16} />
                  Go to login now
                </Link>
              </div>
            )}

            <p className="fp-help">
              Remembered your password? <Link href="/login" className="fp-link">Sign in</Link>
            </p>
          </div>

          <div className="fp-footer">
            <Shield size={13} />
            <span>Secure</span>
            <span className="fp-dot">•</span>
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
  --dc-navy: #13233f;
  --dc-text: #334155;
  --dc-muted: #718096;
  --dc-border: #dce2e9;
}
.fp-wrap {
  min-height: 100vh;
  background:
    radial-gradient(circle at 25% 40%, rgba(22,180,145,0.08), transparent 45%),
    linear-gradient(135deg, #f4fff9 0%, #ffffff 48%, #ffffff 100%);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--dc-text);
  padding: 32px 16px;
  display: flex; align-items: flex-start; justify-content: center;
}
.fp-wrap * { box-sizing: border-box; }
.fp-container { width: 100%; max-width: 480px; margin: 0 auto; }
.fp-brand { text-align: center; margin-bottom: 24px; }
.fp-brand img { width: 120px; height: auto; }

.fp-card {
  padding: 32px;
  background: rgba(255,255,255,0.96);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(226,232,240,0.8);
  border-radius: 22px;
  box-shadow: 0 25px 60px rgba(15,23,42,0.08), 0 5px 15px rgba(15,23,42,0.04);
}
.fp-header { text-align: center; margin-bottom: 22px; }
.fp-title { margin: 0; font-size: 22px; font-weight: 800; color: var(--dc-navy); letter-spacing: -0.02em; }
.fp-subtitle { margin: 8px 0 0; font-size: 13.5px; color: var(--dc-muted); line-height: 1.5; }

.fp-error {
  margin-bottom: 12px; padding: 12px 14px;
  border-radius: 10px; background: #fff5f5;
  color: #c53030; border: 1px solid #fecaca; font-size: 13px;
}

.fp-form { display: flex; flex-direction: column; gap: 14px; }
.fp-field { display: flex; flex-direction: column; gap: 6px; }
.fp-label {
  font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: #008d72;
}
.fp-hint { margin: 0; font-size: 12px; color: var(--dc-muted); }

.fp-input-wrap { position: relative; }
.fp-input {
  width: 100%; height: 52px;
  padding: 0 16px 0 46px;
  border: 1.5px solid var(--dc-border); border-radius: 14px;
  background: #fff; color: var(--dc-navy);
  font-size: 15px; font-family: inherit; outline: none;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.fp-input--password { padding-right: 44px; }
.fp-input--code {
  padding: 0 20px;
  letter-spacing: 0.35em;
  font-family: ui-monospace, monospace; font-size: 22px;
  text-align: center;
}
.fp-input:focus {
  border-color: var(--dc-green);
  box-shadow: 0 0 0 4px rgba(19,170,137,0.10);
}
.fp-input-icon {
  position: absolute; left: 14px; top: 50%;
  transform: translateY(-50%); color: #94a3b8; pointer-events: none;
}
.fp-eye {
  position: absolute; right: 10px; top: 50%;
  transform: translateY(-50%); padding: 6px;
  background: transparent; border: none; color: #94a3b8; cursor: pointer;
  display: flex; align-items: center; border-radius: 8px;
}
.fp-eye:hover { color: #64748b; background: #f1f5f9; }

.fp-btn-primary {
  height: 52px;
  border-radius: 14px; border: none;
  background: var(--dc-green); color: #fff;
  font-size: 15px; font-weight: 800; font-family: inherit;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  cursor: pointer;
  box-shadow: 0 10px 20px rgba(14,174,139,0.22);
  transition: background 150ms ease, transform 150ms ease;
}
.fp-btn-primary:hover:not(:disabled) { background: var(--dc-green-dark); transform: translateY(-1px); }
.fp-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.fp-btn-link {
  background: transparent; border: none; color: var(--dc-green);
  font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  padding: 4px 0; margin-top: -4px;
}
.fp-btn-link:hover { color: var(--dc-green-dark); text-decoration: underline; }

.fp-success { text-align: center; padding: 12px 0 4px; }
.fp-success-badge {
  width: 72px; height: 72px; margin: 0 auto 12px;
  border-radius: 50%;
  background: rgba(20,174,143,0.12);
  display: flex; align-items: center; justify-content: center;
  color: var(--dc-green);
  animation: fp-pop 400ms ease-out;
}
.fp-success-msg { margin: 0; font-size: 14px; color: var(--dc-text); }
@keyframes fp-pop {
  0%   { transform: scale(0.4); opacity: 0; }
  60%  { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1);   opacity: 1; }
}

.fp-help { margin: 20px 0 0; text-align: center; font-size: 13px; color: var(--dc-muted); }
.fp-link { color: var(--dc-green); font-weight: 600; text-decoration: none; }
.fp-link:hover { color: var(--dc-green-dark); }

.fp-footer {
  margin-top: 22px; display: flex; align-items: center; justify-content: center;
  gap: 8px; font-size: 12.5px; font-weight: 500; color: #64748b;
}
.fp-footer svg { color: var(--dc-green); }
.fp-dot { color: #cbd5e1; }

.fp-spin { animation: fp-spin 700ms linear infinite; }
@keyframes fp-spin { to { transform: rotate(360deg); } }
`;
