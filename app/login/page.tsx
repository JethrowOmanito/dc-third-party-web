'use client';

import {
  loginSchema,
  referenceLoginSchema,
  type LoginInput,
  type ReferenceLoginInput,
} from '@/lib/validations/auth.schema';
import { useAuthStore } from '@/store/authStore';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  Calendar,
  Check,
  Eye,
  EyeOff,
  Hash,
  Loader2,
  Lock,
  LogIn,
  MessageCircle,
  Search,
  Shield,
  ShieldCheck,
  TrendingUp,
  User,
  Users,
} from 'lucide-react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

interface GoogleAccountsId {
  initialize: (config: { client_id: string; callback: (r: { credential: string }) => void }) => void;
  renderButton: (parent: HTMLElement, opts: Record<string, unknown>) => void;
}
interface AppleIDAuth {
  init: (config: { clientId: string; scope: string; redirectURI: string; usePopup: boolean }) => void;
  signIn: () => Promise<{
    authorization: { id_token: string };
    user?: { name?: { firstName?: string; lastName?: string }; email?: string };
  }>;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
    AppleID?: { auth: AppleIDAuth };
  }
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const APPLE_SERVICES_ID = process.env.NEXT_PUBLIC_APPLE_SERVICES_ID ?? '';

const LOGO_URL =
  'https://agyzvknaqnamaoczxgsb.supabase.co/storage/v1/object/public/doctor-clean-files/uploads/doctor_clean_logo.542c4621e2b4379e4d95.png';
const MERLION_URL =
  'https://agyzvknaqnamaoczxgsb.supabase.co/storage/v1/object/public/doctor-clean-files/uploads/DC_merlion_login.png';
const TEAM_URL =
  'https://agyzvknaqnamaoczxgsb.supabase.co/storage/v1/object/public/doctor-clean-files/uploads/DC_Team.png';

const FEATURES = [
  { Icon: Calendar,    title: 'Manage Bookings',    desc: 'Track and manage all cleaning jobs in one place.' },
  { Icon: Users,       title: 'Team Coordination',  desc: 'Assign tasks and keep your team connected.' },
  { Icon: TrendingUp,  title: 'Real-time Insights', desc: 'Monitor performance and operations with real-time reports.' },
  { Icon: ShieldCheck, title: 'Secure & Reliable',  desc: 'Your data is protected with enterprise grade security.' },
];

export default function LoginPage() {
  const router = useRouter();
  const { user, setUser, setGuestSession, _hasHydrated } = useAuthStore();

  const [activeTab, setActiveTab] = useState<'partner' | 'reference'>('partner');
  const [waStage, setWaStage] = useState<'idle' | 'phone' | 'code'>('idle');
  const [showPwd, setShowPwd] = useState(false);
  const [serverError, setServerError] = useState('');
  const [teamPhotoError, setTeamPhotoError] = useState(false);
  const [oauthProcessing, setOauthProcessing] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  const [appleLoadFailed, setAppleLoadFailed] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  // Measure the OAuth wrapper so Google's fixed-pixel button matches
  // Apple/WhatsApp widths on every screen size.
  const oauthRef = useRef<HTMLDivElement>(null);
  const [oauthWidth, setOauthWidth] = useState<number>(320);
  useEffect(() => {
    const measure = () => {
      if (!oauthRef.current) return;
      const w = Math.min(380, Math.max(240, Math.floor(oauthRef.current.clientWidth)));
      setOauthWidth(w);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const year = new Date().getFullYear();

  // WA login state
  const [waPhone, setWaPhone] = useState('');
  const [waCode, setWaCode] = useState('');
  const [waOtpSent, setWaOtpSent] = useState(false);
  const [waOtpSending, setWaOtpSending] = useState(false);
  const [waLoggingIn, setWaLoggingIn] = useState(false);

  // If a valid session already exists (JWT cookie), bounce to /dashboard
  // instead of showing the login form.
  useEffect(() => {
    if (!_hasHydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!cancelled && res.ok) {
          const data = await res.json();
          if (data.user) {
            setUser(data.user);
            router.replace('/dashboard');
          }
        }
      } catch {
        // no session — stay on login page
      }
    })();
    return () => { cancelled = true; };
  }, [_hasHydrated, router, setUser]);

  // Poll for Apple SDK to load. Give up after 15s so users see an actual
  // failure state instead of an eternal "Loading Apple…".
  useEffect(() => {
    if (!APPLE_SERVICES_ID) return;
    if (window.AppleID) { setAppleReady(true); return; }
    const start = Date.now();
    const t = setInterval(() => {
      if (window.AppleID) {
        setAppleReady(true);
        clearInterval(t);
      } else if (Date.now() - start > 15000) {
        setAppleLoadFailed(true);
        clearInterval(t);
      }
    }, 200);
    return () => clearInterval(t);
  }, []);

  const partnerForm = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  const referenceForm = useForm<ReferenceLoginInput>({
    resolver: zodResolver(referenceLoginSchema),
    defaultValues: { referenceNumber: '' },
  });

  // ── WhatsApp login handlers ────────────────────────────────
  const handleWaSendOtp = useCallback(async () => {
    setServerError('');
    if (waPhone.trim().length < 8) {
      setServerError('Enter a valid WhatsApp number.');
      return;
    }
    setWaOtpSending(true);
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: waPhone }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error ?? 'Could not send code.');
        return;
      }
      setWaOtpSent(true);
    } catch {
      setServerError('Network error. Try again.');
    } finally {
      setWaOtpSending(false);
    }
  }, [waPhone]);

  const handleWaLogin = useCallback(async () => {
    setServerError('');
    if (waCode.length !== 6) {
      setServerError('Enter the 6-digit code.');
      return;
    }
    setWaLoggingIn(true);
    try {
      const res = await fetch('/api/auth/wa-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: waPhone, code: waCode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error ?? 'Login failed.');
        return;
      }
      if (json.needsSignup) {
        // No partner account for this phone — push them to signup
        try {
          sessionStorage.setItem('dc-signup-prefill', JSON.stringify({ whatsapp_phone: waPhone }));
        } catch {}
        router.push('/signup');
        return;
      }
      if (json.user) {
        setUser(json.user);
        router.replace('/dashboard');
      }
    } catch {
      setServerError('Network error. Try again.');
    } finally {
      setWaLoggingIn(false);
    }
  }, [waPhone, waCode, router, setUser]);

  const onPartnerSubmit = async (data: LoginInput) => {
    setServerError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error ?? 'Login failed.');
        return;
      }
      setUser(json.user);
      router.replace('/dashboard');
    } catch {
      setServerError('Network error. Please try again.');
    }
  };

  const onReferenceSubmit = async (data: ReferenceLoginInput) => {
    setServerError('');
    try {
      const res = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error ?? 'Reference number not found.');
        return;
      }
      setGuestSession(json.session);
      router.push(`/track/${data.referenceNumber.trim()}`);
    } catch {
      setServerError('Network error. Please try again.');
    }
  };

  // ── OAuth: Google ─────────────────────────────
  const handleGoogleCredential = useCallback(async (credential: string) => {
    if (!credential) return;
    setOauthProcessing(true);
    setServerError('');
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error ?? 'Google sign-in failed.');
        return;
      }
      if (json.user) {
        setUser(json.user);
        router.replace('/dashboard');
        return;
      }
      if (json.needsSignup && json.prefill) {
        // Store prefill for signup wizard
        try {
          sessionStorage.setItem('dc-signup-prefill', JSON.stringify(json.prefill));
        } catch {}
        router.push('/signup');
      }
    } catch {
      setServerError('Network error. Please try again.');
    } finally {
      setOauthProcessing(false);
    }
  }, [router, setUser]);

  // Attach credential handler to window for the declarative g_id_onload div.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    (window as unknown as {
      handleGoogleCredential?: (r: { credential: string }) => void;
    }).handleGoogleCredential = (r) => handleGoogleCredential(r.credential);
  }, [handleGoogleCredential]);

  // ── OAuth: Apple ─────────────────────────────
  const handleAppleClick = useCallback(() => {
    if (!APPLE_SERVICES_ID) return;
    if (!window.AppleID) {
      setServerError('Apple sign-in is still loading. Please wait a moment and try again.');
      return;
    }
    window.AppleID.auth.init({
      clientId: APPLE_SERVICES_ID,
      scope: 'name email',
      redirectURI: `${window.location.origin}/api/auth/apple/callback`,
      usePopup: true,
    });
    window.AppleID.auth.signIn().then(async (res: {
      authorization: { id_token: string };
      user?: { name?: { firstName?: string; lastName?: string }; email?: string };
    }) => {
      setOauthProcessing(true);
      setServerError('');
      try {
        const apiRes = await fetch('/api/auth/apple', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identityToken: res.authorization.id_token, user: res.user }),
        });
        const json = await apiRes.json();
        if (!apiRes.ok) {
          setServerError(json.error ?? 'Apple sign-in failed.');
          return;
        }
        if (json.user) {
          setUser(json.user);
          router.replace('/dashboard');
          return;
        }
        if (json.needsSignup && json.prefill) {
          try {
            sessionStorage.setItem('dc-signup-prefill', JSON.stringify(json.prefill));
          } catch {}
          router.push('/signup');
        }
      } catch {
        setServerError('Network error. Please try again.');
      } finally {
        setOauthProcessing(false);
      }
    }).catch(() => {
      // user cancelled or popup blocked — silent
    });
  }, [router, setUser]);

  return (
    <>
      <style>{CSS}</style>
      {GOOGLE_CLIENT_ID && (
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      )}
      {APPLE_SERVICES_ID && (
        <Script
          src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"
          strategy="afterInteractive"
        />
      )}

      <div className="dc-login">
        <svg
          className="dc-ribbon"
          viewBox="0 0 900 700"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path d="M0,140 C260,180 520,440 900,690 L900,700 L0,700 Z" fill="#0eae8b" />
          <path d="M0,340 C230,380 520,560 900,700 L0,700 Z" fill="#e7f8f3" />
        </svg>

        <div className="dc-login__container">
          {/* ── LEFT — branding + artwork ─────────────────────────── */}
          <aside className="dc-left">
            <div className="dc-left__content">
              <h1 className="dc-left__heading">
                <span className="dc-left__heading--primary">Spotless Spaces,</span>
                <br />
                <span className="dc-left__heading--accent">Smiling Faces</span>
              </h1>

              <p className="dc-left__desc">
                Doctor Clean Partner Portal helps you manage jobs, track service requests
                and grow your business with our team.
              </p>

              <div className="dc-features">
                {FEATURES.map(({ Icon, title, desc }) => (
                  <div key={title} className="dc-feature">
                    <div className="dc-feature__icon">
                      <Icon size={22} strokeWidth={2} />
                    </div>
                    <div>
                      <p className="dc-feature__title">{title}</p>
                      <p className="dc-feature__desc">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="dc-visual" aria-hidden>
              <img src={MERLION_URL} alt="" className="dc-visual__merlion" />
              {!teamPhotoError && (
                <img
                  src={TEAM_URL}
                  alt=""
                  className="dc-visual__team"
                  onError={() => setTeamPhotoError(true)}
                />
              )}
            </div>
          </aside>

          {/* ── RIGHT — login card + footer ───────────────────────── */}
          <section className="dc-right">
            <div className="dc-mobile-brand">
              <img src={LOGO_URL} alt="Doctor Clean" />
            </div>

            <div className="dc-card">
              <div className="dc-card__logo">
                <img src={LOGO_URL} alt="Doctor Clean" />
              </div>

              <h2 className="dc-card__title">Partner Portal</h2>
              <p className="dc-card__subtitle">
                Sign in as a partner or track an existing job.
              </p>

              {/* Tabs */}
              <div className="dc-tabs" role="tablist" aria-label="Login mode">
                <button
                  role="tab"
                  type="button"
                  aria-selected={activeTab === 'partner'}
                  className={`dc-tab${activeTab === 'partner' ? ' dc-tab--active' : ''}`}
                  onClick={() => {
                    setActiveTab('partner');
                    setServerError('');
                  }}
                >
                  Partner Login
                </button>
                <button
                  role="tab"
                  type="button"
                  aria-selected={activeTab === 'reference'}
                  className={`dc-tab${activeTab === 'reference' ? ' dc-tab--active' : ''}`}
                  onClick={() => {
                    setActiveTab('reference');
                    setServerError('');
                  }}
                >
                  Track Job
                </button>
              </div>

              {serverError && <div className="dc-error">{serverError}</div>}

              {activeTab === 'partner' ? (
                <form onSubmit={partnerForm.handleSubmit(onPartnerSubmit)} className="dc-form">
                  {/* Username */}
                  <div className="dc-field">
                    <label htmlFor="tp-username" className="dc-label">Username</label>
                    <div className="dc-input-wrap">
                      <User className="dc-input-icon" size={18} />
                      <input
                        id="tp-username"
                        {...partnerForm.register('username')}
                        type="text"
                        placeholder="Enter your username"
                        autoComplete="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        className={`dc-input${partnerForm.formState.errors.username ? ' dc-input--error' : ''}`}
                      />
                    </div>
                    {partnerForm.formState.errors.username && (
                      <p className="dc-field__error">
                        {partnerForm.formState.errors.username.message}
                      </p>
                    )}
                  </div>

                  {/* Password */}
                  <div className="dc-field">
                    <label htmlFor="tp-password" className="dc-label">Password</label>
                    <div className="dc-input-wrap">
                      <Lock className="dc-input-icon" size={18} />
                      <input
                        id="tp-password"
                        {...partnerForm.register('password')}
                        type={showPwd ? 'text' : 'password'}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        className={`dc-input dc-input--password${partnerForm.formState.errors.password ? ' dc-input--error' : ''}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd((v) => !v)}
                        className="dc-eye"
                        aria-label={showPwd ? 'Hide password' : 'Show password'}
                      >
                        {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {partnerForm.formState.errors.password && (
                      <p className="dc-field__error">
                        {partnerForm.formState.errors.password.message}
                      </p>
                    )}
                  </div>

                  {/* Forgot link */}
                  <div className="dc-form__row dc-form__row--end">
                    <a
                      href="https://wa.me/6588656751?text=Hello%2C%20I%20forgot%20my%20Doctor%20Clean%20Partner%20password.%20Please%20help%20me%20reset%20it."
                      target="_blank"
                      rel="noopener noreferrer"
                      className="dc-link"
                    >
                      Forgot password?
                    </a>
                  </div>

                  {/* Sign in */}
                  <button
                    type="submit"
                    disabled={partnerForm.formState.isSubmitting}
                    className="dc-btn-primary"
                  >
                    {partnerForm.formState.isSubmitting ? (
                      <>
                        <Loader2 size={16} className="dc-spin" />
                        Signing In…
                      </>
                    ) : (
                      <>
                        <LogIn size={18} />
                        SIGN IN
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form
                  onSubmit={referenceForm.handleSubmit(onReferenceSubmit)}
                  className="dc-form"
                >
                  <div className="dc-field">
                    <label htmlFor="tp-ref" className="dc-label">
                      Job Reference Number
                    </label>
                    <p className="dc-field__hint">
                      Enter your booking reference from your confirmation email.
                    </p>
                    <div className="dc-input-wrap">
                      <Hash className="dc-input-icon" size={18} />
                      <input
                        id="tp-ref"
                        {...referenceForm.register('referenceNumber')}
                        type="text"
                        placeholder="e.g. 1042"
                        autoCapitalize="characters"
                        className={`dc-input${referenceForm.formState.errors.referenceNumber ? ' dc-input--error' : ''}`}
                      />
                    </div>
                    {referenceForm.formState.errors.referenceNumber && (
                      <p className="dc-field__error">
                        {referenceForm.formState.errors.referenceNumber.message}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={referenceForm.formState.isSubmitting}
                    className="dc-btn-primary"
                  >
                    {referenceForm.formState.isSubmitting ? (
                      <>
                        <Loader2 size={16} className="dc-spin" />
                        Tracking…
                      </>
                    ) : (
                      <>
                        <Search size={18} />
                        TRACK MY JOB
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* OAuth block (Google + Apple + WhatsApp) */}
              {activeTab === 'partner' && (
                <>
                  <div className="dc-divider"><span>or</span></div>
                  <div ref={oauthRef} className="dc-oauth-login" style={{ ['--oauth-w' as string]: `${oauthWidth}px` }}>
                    {GOOGLE_CLIENT_ID && waStage === 'idle' && (
                      <>
                        <div
                          id="g_id_onload"
                          data-client_id={GOOGLE_CLIENT_ID}
                          data-context="signin"
                          data-callback="handleGoogleCredential"
                          data-auto_prompt="false"
                        />
                        <div
                          key={`gbtn-${oauthWidth}`}
                          className="g_id_signin dc-oauth-login__google"
                          data-type="standard"
                          data-shape="rectangular"
                          data-theme="outline"
                          data-text="signin_with"
                          data-size="large"
                          data-logo_alignment="left"
                          data-width={String(oauthWidth)}
                        />
                      </>
                    )}
                    {APPLE_SERVICES_ID && !appleLoadFailed && waStage === 'idle' && (
                      <button
                        type="button"
                        onClick={handleAppleClick}
                        disabled={oauthProcessing || !appleReady}
                        className="dc-btn-apple"
                      >
                        <svg width="16" height="16" viewBox="0 0 384 512" fill="currentColor" aria-hidden>
                          <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
                        </svg>
                        {appleReady ? 'Continue with Apple' : 'Loading Apple…'}
                      </button>
                    )}

                    {waStage === 'idle' && (
                      <button
                        type="button"
                        onClick={() => { setWaStage('phone'); setServerError(''); }}
                        className="dc-btn-wa"
                      >
                        <MessageCircle size={16} />
                        Continue with WhatsApp
                      </button>
                    )}

                    {/* Inline WA flow — same width as the OAuth buttons */}
                    {waStage === 'phone' && (
                      <div className="dc-wa-panel">
                        <div className="dc-wa-panel__head">
                          <button
                            type="button"
                            onClick={() => { setWaStage('idle'); setWaPhone(''); setServerError(''); }}
                            className="dc-wa-back"
                            aria-label="Back"
                          >
                            <ArrowLeft size={14} />
                          </button>
                          <span>Sign in with WhatsApp</span>
                        </div>
                        <input
                          type="tel"
                          placeholder="+65 8888 8888"
                          autoComplete="tel"
                          autoFocus
                          value={waPhone}
                          onChange={e => setWaPhone(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleWaSendOtp(); } }}
                          className="dc-wa-input"
                        />
                        <button
                          type="button"
                          onClick={async () => { await handleWaSendOtp(); if (!serverError) setWaStage('code'); }}
                          disabled={waOtpSending || waPhone.trim().length < 8}
                          className="dc-btn-wa dc-btn-wa--filled"
                        >
                          {waOtpSending ? (
                            <><Loader2 size={14} className="dc-spin" />Sending code…</>
                          ) : (
                            <>Send code</>
                          )}
                        </button>
                      </div>
                    )}

                    {waStage === 'code' && (
                      <div className="dc-wa-panel">
                        <div className="dc-wa-panel__head">
                          <button
                            type="button"
                            onClick={() => { setWaStage('phone'); setWaCode(''); setWaOtpSent(false); setServerError(''); }}
                            className="dc-wa-back"
                            aria-label="Back"
                          >
                            <ArrowLeft size={14} />
                          </button>
                          <span>Enter the 6-digit code</span>
                        </div>
                        <p className="dc-wa-hint">Sent to <strong>{waPhone}</strong></p>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="123456"
                          autoFocus
                          value={waCode}
                          onChange={e => setWaCode(e.target.value.replace(/\D/g, ''))}
                          onKeyDown={e => { if (e.key === 'Enter' && waCode.length === 6) { e.preventDefault(); handleWaLogin(); } }}
                          className="dc-wa-input dc-wa-input--code"
                        />
                        <button
                          type="button"
                          onClick={handleWaLogin}
                          disabled={waLoggingIn || waCode.length !== 6}
                          className="dc-btn-wa dc-btn-wa--filled"
                        >
                          {waLoggingIn ? (
                            <><Loader2 size={14} className="dc-spin" />Verifying…</>
                          ) : (
                            <><Check size={14} />Verify &amp; Sign in</>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              <p className="dc-help">
                New partner?{' '}
                <a href="/signup" className="dc-link">Create an account</a>
              </p>

              <div className="dc-footer dc-footer--inside">
                <span>© {year} · All rights reserved.</span>
                <span className="dc-footer__pipe">|</span>
                <Shield size={13} />
                <span>Secure</span>
                <span className="dc-footer__dot">•</span>
                <span>Reliable</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Styles — ported from main-web/app/login/page.tsx (do not touch main-web).
   Added: tab bar, hint text, spinner variant.
   ───────────────────────────────────────────────────────────────────── */
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
}

.dc-login {
  position: relative;
  width: 100%;
  min-height: 100vh;
  min-height: 100svh;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 25% 40%, rgba(22,180,145,0.08), transparent 45%),
    linear-gradient(135deg, #f4fff9 0%, #ffffff 48%, #ffffff 100%);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--dc-text);
}
.dc-login * { box-sizing: border-box; }

/* Extend the ribbon's light teal color down to the very bottom of the viewport
   so it engulfs the gap below the s-curve. */
.dc-login::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 5%;
  background: #e7f8f3;
  z-index: 2;
  pointer-events: none;
}

/* Desktop: lock to viewport height (footer is inside the card now, so we
   don't need scrolling). Mobile/tablet still allows scroll. */
@media (min-width: 901px) {
  .dc-login {
    height: 100vh;
    height: 100svh;
    min-height: 0;
    overflow: hidden;
  }
}

.dc-login__container {
  position: relative;
  z-index: 5;
  max-width: 1500px;
  margin: 0 auto;
  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(480px, 0.85fr);
  padding: 24px 56px;
  gap: 32px;
}
@media (min-width: 1600px) {
  .dc-login__container { padding: 32px 80px; }
}

/* ── LEFT ─────────────────────────────────────────────────────── */
.dc-left { position: relative; overflow: visible; height: 100%; }
.dc-left__content { position: relative; z-index: 20; max-width: 560px; padding-top: 5vh; }
.dc-left__heading {
  margin: 0;
  font-size: clamp(38px, 3.4vw, 56px);
  line-height: 1.05;
  font-weight: 800;
  letter-spacing: -0.035em;
}
.dc-left__heading--primary { color: var(--dc-navy); }
.dc-left__heading--accent  { color: var(--dc-green); }

.dc-left__desc {
  max-width: 500px;
  margin: 22px 0 34px;
  font-size: 16px;
  line-height: 1.65;
  color: var(--dc-muted);
}

.dc-features { display: flex; flex-direction: column; gap: 18px; max-width: 460px; }
.dc-feature { display: flex; align-items: flex-start; gap: 16px; }
.dc-feature__icon {
  flex: 0 0 auto;
  width: 46px; height: 46px;
  border-radius: 50%;
  background: var(--dc-green-soft);
  color: var(--dc-green-dark);
  display: flex; align-items: center; justify-content: center;
}
.dc-feature__title { margin: 0; font-size: 15px; font-weight: 700; color: var(--dc-navy); }
.dc-feature__desc {
  margin: 4px 0 0;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--dc-muted);
  max-width: 300px;
}

.dc-visual { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
.dc-visual__merlion {
  position: absolute;
  top: -140px;
  right: -10%;
  width: min(520px, 52vw);
  opacity: 0.42;
  object-fit: contain;
  pointer-events: none;
  z-index: 3;
  user-select: none;
}
.dc-visual__team {
  position: absolute;
  bottom: 8%;
  right: -27%;
  left: auto;
  width: min(484px, 37vw);
  height: auto;
  object-fit: contain;
  object-position: right bottom;
  z-index: 10;
  pointer-events: none;
  user-select: none;
  animation: dc-team-in 700ms ease-out both;
}

.dc-ribbon {
  position: absolute;
  left: 0;
  bottom: 2%;
  width: 60%;
  height: 22vh;
  pointer-events: none;
  z-index: 4;
  display: block;
}

/* ── RIGHT ────────────────────────────────────────────────────── */
.dc-right {
  position: relative;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 0 64px;
  min-height: 0;
}
.dc-mobile-brand { display: none; margin-bottom: 22px; text-align: center; }
.dc-mobile-brand img { width: 125px; height: auto; }

.dc-card {
  position: relative;
  z-index: 50;
  width: 100%;
  max-width: 420px;
  padding: 22px 28px;
  background: rgba(255,255,255,0.94);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(226,232,240,0.8);
  border-radius: 18px;
  box-shadow:
    0 25px 60px rgba(15,23,42,0.08),
    0 5px 15px rgba(15,23,42,0.04);
  animation: dc-card-in 500ms ease-out both;
}

.dc-card__logo { margin: 0 auto; display: flex; align-items: center; justify-content: center; }
.dc-card__logo img { height: 56px; width: auto; max-width: 100%; user-select: none; }
.dc-card__title {
  margin: 10px 0 0;
  font-size: 22px;
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: -0.025em;
  color: var(--dc-navy);
  text-align: center;
}
.dc-card__subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--dc-muted);
  text-align: center;
}

/* Tabs */
.dc-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin: 14px 0 2px;
  padding: 3px;
  background: #f1f5f9;
  border-radius: 10px;
}
.dc-tab {
  height: 34px;
  border: none;
  background: transparent;
  color: #64748b;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border-radius: 9px;
  transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
}
.dc-tab:hover:not(.dc-tab--active) { color: #334155; }
.dc-tab--active {
  background: #ffffff;
  color: var(--dc-navy);
  box-shadow: 0 1px 3px rgba(15,23,42,0.08);
}


.dc-error {
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #fff5f5;
  color: #c53030;
  border: 1px solid #fecaca;
  font-size: 13px;
}

.dc-form { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.dc-field { display: flex; flex-direction: column; gap: 4px; }
.dc-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #008d72;
}
.dc-field__hint {
  margin: 0 0 4px;
  font-size: 11.5px;
  color: var(--dc-muted);
  line-height: 1.4;
}
.dc-input-wrap { position: relative; }
.dc-input {
  width: 100%;
  height: 40px;
  padding: 0 14px 0 40px;
  border: 1.5px solid var(--dc-border);
  border-radius: 10px;
  background: #ffffff;
  color: var(--dc-navy);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.dc-input--password { padding-right: 42px; }
.dc-input::placeholder { color: #a0aec0; }
.dc-input:focus {
  border-color: var(--dc-green);
  box-shadow: 0 0 0 4px rgba(19,170,137,0.10);
}
.dc-input--error { border-color: #ef4444; }
.dc-input-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  pointer-events: none;
}
.dc-eye {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  padding: 5px;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  border-radius: 6px;
  transition: color 150ms ease, background 150ms ease;
}
.dc-eye:hover { color: #64748b; background: #f1f5f9; }
.dc-field__error { margin: 2px 0 0 4px; font-size: 11.5px; color: #ef4444; }

.dc-form__row { display: flex; justify-content: space-between; align-items: center; }
.dc-form__row--end { justify-content: flex-end; }
.dc-link {
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--dc-green);
  font-weight: 600;
  font-size: 12.5px;
  text-decoration: none;
  font-family: inherit;
  transition: color 150ms ease;
}
.dc-link:hover { color: var(--dc-green-dark); }

.dc-btn-primary {
  width: 100%;
  height: 40px;
  margin-top: 4px;
  border: none;
  border-radius: 10px;
  background: var(--dc-green);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  box-shadow: 0 10px 20px rgba(14,174,139,0.22);
  transition: background 150ms ease, transform 150ms ease, box-shadow 150ms ease;
}
.dc-btn-primary:hover:not(:disabled) {
  background: var(--dc-green-dark);
  transform: translateY(-1px);
  box-shadow: 0 14px 25px rgba(14,174,139,0.28);
}
.dc-btn-primary:active { transform: translateY(0); }
.dc-btn-primary:disabled { opacity: 0.75; cursor: not-allowed; }

.dc-divider { display: flex; align-items: center; gap: 14px; color: #7c8799; font-size: 13px; margin-top: 6px; }
.dc-divider::before,
.dc-divider::after { content: ""; flex: 1; height: 1px; background: #e5e9ef; }

.dc-btn-secondary {
  width: 100%;
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--dc-border);
  background: #ffffff;
  color: #43526a;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  text-decoration: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 150ms ease, border-color 150ms ease;
}
.dc-btn-secondary:hover { background: #f8fafc; border-color: #b8c4d3; }
.dc-btn-secondary svg { color: var(--dc-green); }

.dc-oauth-login {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  margin-bottom: 4px;
}
.dc-oauth-login__google {
  display: flex; justify-content: center; min-height: 38px;
  width: var(--oauth-w, 320px); max-width: 100%;
}
.dc-btn-apple {
  width: var(--oauth-w, 320px); max-width: 100%; height: 38px;
  border-radius: 10px;
  border: none; background: #000; color: #fff;
  font-family: inherit; font-size: 13px; font-weight: 600;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  cursor: pointer;
  transition: background 150ms ease;
}
.dc-btn-apple:hover:not(:disabled) { background: #1a1a1a; }
.dc-btn-apple:disabled { opacity: 0.7; cursor: not-allowed; }

/* WhatsApp option — same width as Apple/Google */
.dc-btn-wa {
  width: var(--oauth-w, 320px); max-width: 100%; height: 38px;
  border-radius: 10px;
  border: 1px solid #cbd5e1; background: #fff; color: #0f172a;
  font-family: inherit; font-size: 13px; font-weight: 600;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease;
}
.dc-btn-wa svg { color: #25D366; }
.dc-btn-wa:hover:not(:disabled) { background: #f8fafc; border-color: #94a3b8; }
.dc-btn-wa:disabled { opacity: 0.6; cursor: not-allowed; }
.dc-btn-wa--filled {
  background: #25D366; color: #fff; border-color: #25D366;
}
.dc-btn-wa--filled svg { color: #fff; }
.dc-btn-wa--filled:hover:not(:disabled) { background: #20BC5B; border-color: #20BC5B; }

.dc-wa-panel {
  width: var(--oauth-w, 320px); max-width: 100%;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  display: flex; flex-direction: column; gap: 8px;
  animation: dc-card-in 200ms ease-out both;
}
.dc-wa-panel__head {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 700; color: var(--dc-navy);
  margin-bottom: 2px;
}
.dc-wa-back {
  width: 22px; height: 22px;
  background: transparent; border: none;
  color: #64748b; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px;
  transition: background 120ms ease;
}
.dc-wa-back:hover { background: #e2e8f0; color: var(--dc-navy); }
.dc-wa-hint {
  margin: -2px 0 4px; font-size: 11.5px; color: #64748b;
}
.dc-wa-hint strong { color: var(--dc-navy); }
.dc-wa-input {
  width: 100%; height: 38px;
  padding: 0 12px;
  border: 1px solid var(--dc-border); border-radius: 8px;
  background: #fff; color: var(--dc-navy);
  font-family: inherit; font-size: 14px;
  outline: none;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.dc-wa-input:focus {
  border-color: #25D366;
  box-shadow: 0 0 0 3px rgba(37,211,102,0.15);
}
.dc-wa-input--code {
  letter-spacing: 0.35em;
  font-family: ui-monospace, monospace;
  font-size: 18px;
  text-align: center;
  padding-left: 20px;
}

.dc-spin { animation: dc-spin 700ms linear infinite; }

.dc-help { margin: 10px 0 0; text-align: center; font-size: 12px; color: var(--dc-muted); }

.dc-footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 18px;
  z-index: 41;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 500;
  color: #64748b;
  padding: 0 20px;
}
.dc-footer svg { color: var(--dc-green); }
.dc-footer__dot  { color: #cbd5e1; }
.dc-footer__pipe { color: #cbd5e1; margin: 0 2px; }

/* Footer variant — sits inside the login card, not absolute at page bottom. */
.dc-footer--inside {
  position: static;
  margin-top: 16px;
  padding: 12px 0 0;
  border-top: 1px solid #eef2f7;
  font-size: 11.5px;
  color: #94a3b8;
}

/* Animations */
@keyframes dc-card-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes dc-team-in { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
@keyframes dc-spin    { to { transform: rotate(360deg); } }

/* Medium desktop */
@media (max-width: 1439px) {
  .dc-login__container { padding: 36px 44px; gap: 32px; }
  .dc-card { max-width: 480px; padding: 36px 38px; }
}
@media (max-width: 1200px) {
  .dc-login__container { grid-template-columns: minmax(0, 1fr) minmax(430px, 0.9fr); }
  .dc-visual__team    { width: 42vw; right: -17%; }
  .dc-visual__merlion { width: 38vw; }
}

/* ────────────────────────────────────────────────────────────────
   MOBILE + TABLET LAYOUT (≤900px)
   Matches main-app LoginScreen layout: hero (logo + heading + 4
   features horizontal) at top → visual section (merlion fade +
   team photo + green V-curve) → form card overlapping the bottom
   of the visual by negative margin.
   ──────────────────────────────────────────────────────────────── */
@media (max-width: 900px) {
  .dc-login {
    background: #f4fff9;
    padding: 0;
  }

  /* Flatten the grid so we can order the pieces linearly. */
  .dc-login__container {
    display: flex;
    flex-direction: column;
    max-width: 480px;
    padding: 12px 20px 28px;
    gap: 0;
    min-height: auto;
    height: auto;
  }
  .dc-left, .dc-right { display: contents; }

  /* 1. Logo — top of hero, centered */
  .dc-mobile-brand {
    display: block;
    order: 1;
    text-align: center;
    margin: 0 0 -6px;
  }
  .dc-mobile-brand img { width: 160px; height: 62px; object-fit: contain; }

  /* 2. Hero content: heading + description + 4-across features */
  .dc-left__content {
    order: 2;
    max-width: 100%;
    padding: 0;
    margin: 0;
    text-align: center;
  }
  .dc-left__heading {
    font-size: 22px;
    line-height: 28px;
    letter-spacing: -0.4px;
    margin: 0;
  }
  .dc-left__heading--primary,
  .dc-left__heading--accent { display: inline; }
  .dc-left__heading--primary::after { content: " "; }
  .dc-left__desc {
    margin: 4px 0 0;
    font-size: 13.5px;
    line-height: 19px;
    padding: 0 4px;
    max-width: 100%;
  }
  /* 4 features in a single row */
  .dc-features {
    margin-top: 22px;
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0;
    max-width: 100%;
  }
  .dc-feature {
    flex: 1 1 23%;
    max-width: 23%;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0;
  }
  .dc-feature__icon {
    width: 44px; height: 44px;
    background: rgba(20,174,143,0.10);
    color: #059b7b;
    margin: 0 0 8px;
  }
  .dc-feature__title {
    font-size: 12px;
    line-height: 15px;
    text-align: center;
  }
  .dc-feature__desc {
    margin-top: 4px;
    font-size: 10.5px;
    line-height: 14px;
    text-align: center;
    max-width: 100%;
  }

  /* 3. Visual — merlion (faded background) + team + green V-curve */
  .dc-visual {
    order: 3;
    position: relative;
    width: 100vw;
    margin-left: calc(50% - 50vw);
    margin-right: calc(50% - 50vw);
    margin-top: 4px;
    height: 360px;
    inset: auto;
    overflow: hidden;
  }
  .dc-visual__merlion {
    display: block;
    position: absolute;
    top: -254px; left: 0; right: 0; bottom: 264px;
    width: 100%;
    height: auto;
    opacity: 0.4;
    object-fit: cover;
  }
  .dc-visual__team {
    display: block;
    position: absolute;
    top: -20px; left: 0; right: 0; bottom: 0;
    width: 100%; height: auto;
    object-fit: contain;
    object-position: center bottom;
    transform: none;
    max-width: none;
  }
  /* Solid green V-shape ribbon at the bottom of the visual.
     We hide the desktop SVG paths and use the SVG element itself as a
     div with background + clip-path for a clean V. */
  .dc-ribbon {
    display: block;
    position: absolute;
    left: 0; right: 0; bottom: 196px;
    width: 100%; height: 110px;
    background: #10b981;
    clip-path: polygon(0 40%, 50% 100%, 100% 40%, 100% 100%, 0 100%);
    z-index: 4;
    opacity: 0.95;
  }
  .dc-ribbon path { display: none; }
  /* Also fill the area below the V-curve down to the top of the card so
     the green flows visually into the card region. */
  .dc-visual::after {
    content: "";
    position: absolute;
    left: 0; right: 0;
    bottom: 0;
    height: 196px;
    background: #10b981;
    opacity: 0.95;
    z-index: 3;
    pointer-events: none;
  }

  /* 4. Card overlaps the visual — pulls up over the bottom of the ribbon */
  .dc-right {
    display: contents;
  }
  .dc-card {
    order: 4;
    margin: -236px 0 0;
    padding: 22px;
    border-radius: 22px;
    border: 1px solid rgba(226,232,240,0.9);
    background: #fff;
    box-shadow: 0 12px 24px rgba(15,23,42,0.06);
    max-width: 100%;
    position: relative;
    z-index: 20;
  }
  /* Logo inside card is redundant when the mobile-brand logo is above hero */
  .dc-card__logo { display: none; }
  .dc-card__title { margin-top: 0; font-size: 20px; }
  .dc-card__subtitle { font-size: 13px; }

  .dc-tabs { margin: 14px 0 4px; }
  .dc-tab  { height: 40px; font-size: 13px; }
  .dc-form { margin-top: 12px; gap: 12px; }
  .dc-label { font-size: 11px; letter-spacing: 1.2px; }
  .dc-input { height: 48px; padding-left: 44px; font-size: 15px; }
  .dc-input-icon { left: 14px; }
  .dc-eye { right: 10px; padding: 8px; }
  .dc-btn-primary,
  .dc-btn-secondary { height: 48px; font-size: 14px; }
  /* Mobile: keep the OAuth trio locked to the measured wrapper width so
     Google, Apple and WhatsApp render at the same pixel size. */
  .dc-oauth-login__google { width: var(--oauth-w, 100%); }
  .dc-btn-apple, .dc-btn-wa { width: var(--oauth-w, 100%); }
  .dc-wa-panel { width: var(--oauth-w, 100%); }

  /* Outer footer is disabled on mobile — the inside-card footer covers it. */
  .dc-footer:not(.dc-footer--inside) { display: none; }
}

/* Mobile fine-tuning */
@media (max-width: 640px) {
  .dc-login__container { padding: 10px 16px 24px; }
  .dc-mobile-brand img { width: 140px; height: 54px; }
  .dc-left__heading    { font-size: 20px; line-height: 26px; }
  .dc-left__desc       { font-size: 13px; }
  .dc-visual           { height: 320px; }
  .dc-visual__merlion  { top: -220px; bottom: 240px; }
  .dc-visual__team     { top: -12px; }
  .dc-ribbon           { bottom: 176px; height: 96px; }
  .dc-card             { margin-top: -216px; padding: 20px; }
}

/* Very small phones (iPhone SE, 360-wide Androids) */
@media (max-width: 380px) {
  .dc-login__container { padding: 8px 14px 20px; }
  .dc-mobile-brand img { width: 125px; height: 48px; }
  .dc-left__heading    { font-size: 18px; line-height: 24px; }
  .dc-feature__desc    { display: none; }
  .dc-feature__icon    { width: 40px; height: 40px; }
  .dc-visual           { height: 280px; }
  .dc-visual__merlion  { top: -200px; bottom: 210px; }
  .dc-ribbon           { bottom: 156px; height: 84px; }
  .dc-card             { margin-top: -188px; padding: 18px 16px; border-radius: 20px; }
  .dc-card__title      { font-size: 19px; }
}

/* Landscape phones — hide the visual, keep only hero + form */
@media (max-width: 900px) and (max-height: 500px) and (orientation: landscape) {
  .dc-visual           { display: none; }
  .dc-ribbon           { display: none; }
  .dc-card             { margin-top: 16px; }
  .dc-feature__desc    { display: none; }
  .dc-features         { gap: 10px; }
}
`;
