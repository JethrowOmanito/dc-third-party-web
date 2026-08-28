'use client';

import { signupSchema, type SignupInput } from '@/lib/validations/auth.schema';
import { useAuthStore } from '@/store/authStore';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  Phone,
  Send,
  Shield,
  User,
} from 'lucide-react';
import Link from 'next/link';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

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
    handleGoogleCredential?: (response: { credential: string }) => void;
  }
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const APPLE_SERVICES_ID = process.env.NEXT_PUBLIC_APPLE_SERVICES_ID ?? '';
// (2026-08-28) Meta template partner_signup_otp is APPROVED and enabled.
// Only set to '1' for local dev to skip OTP verification during testing.
// When set, the OTP verification step is hidden and considered auto-passed on the client.
// Backend enforces via PARTNER_SIGNUP_BYPASS_OTP (must match).
const BYPASS_OTP = process.env.NEXT_PUBLIC_PARTNER_SIGNUP_BYPASS_OTP === '1';

const LOGO_URL =
  'https://agyzvknaqnamaoczxgsb.supabase.co/storage/v1/object/public/doctor-clean-files/uploads/doctor_clean_logo.542c4621e2b4379e4d95.png';

const TYPE_LABELS: Record<string, string> = {
  interior_design: 'Interior Design',
  property_manager: 'Property Manager',
  corporate: 'Corporate',
  agent: 'Real Estate Agent',
  other: 'Other',
};

interface PartnerCompany {
  id: string;
  name: string;
  description: string | null;
  company_code: string | null;
  company_type: string | null;
}

const STEP_LABELS = ['Account', 'Company', 'Terms'] as const;

export default function SignupPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [showPwd, setShowPwd] = useState(false);
  const [serverError, setServerError] = useState('');
  const [companies, setCompanies] = useState<PartnerCompany[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [companiesSearch, setCompaniesSearch] = useState('');
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const year = new Date().getFullYear();

  // ── OTP verification state ─────────────────────────────
  const [otpSending, setOtpSending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpVerifying, setOtpVerifying] = useState(false);
  // When BYPASS is on, we skip the OTP step entirely (no send/verify UI, no gate),
  // but the phone input must still be editable — set otpVerified only for the gate
  // logic, not for the field's `disabled` attribute (see below).
  const [otpVerified, setOtpVerified] = useState(BYPASS_OTP);
  const [otpError, setOtpError] = useState('');
  const [signupToken, setSignupToken] = useState('');
  const [verifiedPhone, setVerifiedPhone] = useState('');

  // ── OAuth prefill state (set when Google/Apple returns needsSignup=true) ─
  const [oauthProvider, setOauthProvider] = useState<'google' | 'apple' | null>(null);
  const [oauthSubject, setOauthSubject] = useState('');
  const [oauthProcessing, setOauthProcessing] = useState(false);
  const [appleReady, setAppleReady] = useState(false);

  // Inline WhatsApp signup flow (mirrors login page)
  const [waStage, setWaStage] = useState<'idle' | 'phone' | 'code'>('idle');
  const [waPhone, setWaPhone] = useState('');
  const [waCode, setWaCode] = useState('');
  const [waOtpSending, setWaOtpSending] = useState(false);
  const [waVerifying, setWaVerifying] = useState(false);
  const [appleLoadFailed, setAppleLoadFailed] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  // Poll for Apple SDK — give up after 15s so we don't loop forever if the CDN
  // is blocked (CSP / Cloudflare / regional filtering).
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

  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    mode: 'onTouched',
    defaultValues: {
      username: '',
      password: '',
      full_name: '',
      email: '',
      whatsapp_phone: '',
      company_id: '',
      tnc_accepted: undefined,
    },
  });

  useEffect(() => {
    (async () => {
      setLoadingCompanies(true);
      try {
        const res = await fetch('/api/partners/companies');
        const json = await res.json();
        setCompanies(json.companies ?? []);
      } catch {
        setCompanies([]);
      } finally {
        setLoadingCompanies(false);
      }
    })();

    // If we arrived here from the login page via Google/Apple/WhatsApp with no existing
    // account, consume the prefill payload so the wizard pre-populates.
    try {
      const raw = sessionStorage.getItem('dc-signup-prefill');
      if (raw) {
        const prefill = JSON.parse(raw) as {
          email?: string;
          full_name?: string;
          whatsapp_phone?: string;
          oauth_provider?: 'google' | 'apple';
          oauth_subject?: string;
        };
        if (prefill.email) form.setValue('email', prefill.email);
        if (prefill.full_name) form.setValue('full_name', prefill.full_name);
        if (prefill.whatsapp_phone) form.setValue('whatsapp_phone', prefill.whatsapp_phone);
        if (prefill.oauth_provider) setOauthProvider(prefill.oauth_provider);
        if (prefill.oauth_subject) setOauthSubject(prefill.oauth_subject);
        sessionStorage.removeItem('dc-signup-prefill');
      }
    } catch {
      // sessionStorage unavailable or bad JSON — ignore
    }

    // Auto-redirect logged-in users away from the signup form.
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.user) router.replace('/dashboard');
        }
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCompanyId = form.watch('company_id');
  const selectedCompany = companies.find(c => c.id === selectedCompanyId) ?? null;

  const filteredCompanies = companiesSearch.trim()
    ? companies.filter(c =>
        c.name.toLowerCase().includes(companiesSearch.toLowerCase()) ||
        (c.company_code ?? '').toLowerCase().includes(companiesSearch.toLowerCase())
      )
    : companies;

  const phoneValue = form.watch('whatsapp_phone');
  // If the user changed the phone after verifying, invalidate the OTP.
  useEffect(() => {
    if (otpVerified && phoneValue && verifiedPhone && phoneValue.trim() !== verifiedPhone) {
      setOtpVerified(false);
      setSignupToken('');
      setOtpSent(false);
      setOtpCode('');
    }
  }, [phoneValue, otpVerified, verifiedPhone]);

  const handleSendOtp = useCallback(async () => {
    setOtpError('');
    const ok = await form.trigger(['whatsapp_phone']);
    if (!ok) return;
    const phone = form.getValues('whatsapp_phone');
    setOtpSending(true);
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const json = await res.json();
      if (!res.ok) {
        setOtpError(json.error ?? 'Could not send code. Try again.');
        return;
      }
      setOtpSent(true);
      setOtpError('');
    } catch {
      setOtpError('Network error. Try again.');
    } finally {
      setOtpSending(false);
    }
  }, [form]);

  const handleVerifyOtp = useCallback(async () => {
    setOtpError('');
    if (otpCode.length !== 6) {
      setOtpError('Enter the 6-digit code.');
      return;
    }
    const phone = form.getValues('whatsapp_phone');
    setOtpVerifying(true);
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: otpCode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setOtpError(json.error ?? 'Invalid code.');
        return;
      }
      setOtpVerified(true);
      setSignupToken(json.signupToken);
      setVerifiedPhone(phone.trim());
    } catch {
      setOtpError('Network error. Try again.');
    } finally {
      setOtpVerifying(false);
    }
  }, [form, otpCode]);

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
        form.setValue('email', json.prefill.email ?? '');
        form.setValue('full_name', json.prefill.full_name ?? '');
        setOauthProvider('google');
        setOauthSubject(json.prefill.oauth_subject ?? '');
      }
    } catch {
      setServerError('Network error. Try again.');
    } finally {
      setOauthProcessing(false);
    }
  }, [form, router, setUser]);

  // Attach credential handler to window for the declarative g_id_onload div.
  // Google's SDK auto-discovers the g_id_onload/g_id_signin markup and invokes
  // window[data-callback] with the credential.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    window.handleGoogleCredential = (r) => handleGoogleCredential(r.credential);
  }, [handleGoogleCredential]);

  // ── OAuth: Apple ─────────────────────────────
  const handleAppleResponse = useCallback(async (
    idToken: string,
    user?: { name?: { firstName?: string; lastName?: string }; email?: string }
  ) => {
    if (!idToken) return;
    setOauthProcessing(true);
    setServerError('');
    try {
      const res = await fetch('/api/auth/apple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityToken: idToken, user }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error ?? 'Apple sign-in failed.');
        return;
      }
      if (json.user) {
        setUser(json.user);
        router.replace('/dashboard');
        return;
      }
      if (json.needsSignup && json.prefill) {
        form.setValue('email', json.prefill.email ?? '');
        form.setValue('full_name', json.prefill.full_name ?? '');
        setOauthProvider('apple');
        setOauthSubject(json.prefill.oauth_subject ?? '');
      }
    } catch {
      setServerError('Network error. Try again.');
    } finally {
      setOauthProcessing(false);
    }
  }, [form, router, setUser]);

  // ── WhatsApp signup handlers ─────────────────────────────
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
      setWaStage('code');
    } catch {
      setServerError('Network error. Try again.');
    } finally {
      setWaOtpSending(false);
    }
  }, [waPhone]);

  const handleWaVerify = useCallback(async () => {
    setServerError('');
    if (waCode.length !== 6) {
      setServerError('Enter the 6-digit code.');
      return;
    }
    setWaVerifying(true);
    try {
      const res = await fetch('/api/auth/wa-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: waPhone, code: waCode }),
      });
      const json = await res.json();

      if (!res.ok) {
        setServerError(json.error ?? 'Verification failed.');
        return;
      }

      // Phone belongs to an existing partner → log them in.
      if (json.user) {
        setUser(json.user);
        router.replace('/dashboard');
        return;
      }

      // Phone verified, no account → prefill wizard + attach signup_token so
      // /api/auth/signup accepts it without asking for OTP again.
      if (json.needsSignup && json.signupToken) {
        form.setValue('whatsapp_phone', waPhone);
        setSignupToken(json.signupToken);
        setOtpVerified(true);
        setVerifiedPhone(waPhone);
        setWaStage('idle');
        setWaCode('');
        return;
      }

      setServerError(json.error ?? 'Verification failed.');
    } catch {
      setServerError('Network error. Try again.');
    } finally {
      setWaVerifying(false);
    }
  }, [waPhone, waCode, form, router, setUser]);

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
    window.AppleID.auth.signIn().then((res) => {
      handleAppleResponse(res.authorization.id_token, res.user);
    }).catch((err: unknown) => {
      console.warn('[apple signin]', err);
      const errObj = err as { error?: string } | undefined;
      if (errObj?.error && errObj.error !== 'popup_closed_by_user') {
        setServerError(`Apple sign-in error: ${errObj.error}`);
      }
    });
  }, [handleAppleResponse]);

  const goNext = async () => {
    setServerError('');
    if (step === 0) {
      const fieldsToCheck: Array<keyof SignupInput> = ['full_name', 'email', 'whatsapp_phone', 'username'];
      if (!oauthProvider) fieldsToCheck.push('password');
      const ok = await form.trigger(fieldsToCheck);
      if (!ok) return;
      if (!otpVerified) {
        setOtpError('Please verify your WhatsApp number to continue.');
        return;
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      const ok = await form.trigger(['company_id']);
      if (ok) setStep(2);
      return;
    }
  };

  const goPrev = () => {
    setServerError('');
    setStep(s => (s > 0 ? ((s - 1) as 0 | 1) : 0));
  };

  const onSubmit = async (data: SignupInput) => {
    setServerError('');
    if (!otpVerified) {
      setServerError('Please verify your WhatsApp number before submitting.');
      setStep(0);
      return;
    }
    try {
      const payload = {
        ...data,
        // Only send signup_token when we actually have one (otherwise the
        // .min(20) validation on the schema rejects an empty string).
        ...(signupToken ? { signup_token: signupToken } : {}),
        ...(oauthProvider ? { oauth_provider: oauthProvider, oauth_subject: oauthSubject } : {}),
      };
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error ?? 'Signup failed. Please try again.');
        return;
      }
      setUser(json.user);
      router.replace('/dashboard');
    } catch {
      setServerError('Network error. Please try again.');
    }
  };

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

      <div className="dc-signup">
        <svg className="dc-ribbon" viewBox="0 0 900 700" preserveAspectRatio="none" aria-hidden>
          <path d="M0,140 C260,180 520,440 900,690 L900,700 L0,700 Z" fill="#0eae8b" />
          <path d="M0,340 C230,380 520,560 900,700 L0,700 Z" fill="#e7f8f3" />
        </svg>

        <div className="dc-signup__container">
          <div className="dc-signup__brand">
            <img src={LOGO_URL} alt="Doctor Clean" />
          </div>

          <div className="dc-card">
            <div className="dc-card__header">
              <h1 className="dc-card__title">Create Your Partner Account</h1>
              <p className="dc-card__subtitle">
                Join the Doctor Clean partner network. Your account will be reviewed by admin.
              </p>
            </div>

            {/* Stepper */}
            <div className="dc-stepper">
              {STEP_LABELS.map((label, i) => (
                <div key={label} className="dc-step-wrap">
                  <div
                    className={`dc-step-dot${step >= i ? ' dc-step-dot--active' : ''}${step > i ? ' dc-step-dot--done' : ''}`}
                  >
                    {step > i ? <Check size={16} strokeWidth={3} /> : i + 1}
                  </div>
                  <span className={`dc-step-label${step >= i ? ' dc-step-label--active' : ''}`}>{label}</span>
                  {i < STEP_LABELS.length - 1 && (
                    <div className={`dc-step-line${step > i ? ' dc-step-line--done' : ''}`} />
                  )}
                </div>
              ))}
            </div>

            {serverError && <div className="dc-error">{serverError}</div>}

            <form onSubmit={form.handleSubmit(onSubmit)} className="dc-form">
              {/* STEP 1: ACCOUNT INFO */}
              {step === 0 && (
                <>
                  {!oauthProvider && (
                    <div className="dc-oauth">
                      {GOOGLE_CLIENT_ID && waStage === 'idle' && (
                        <>
                          <div
                            id="g_id_onload"
                            data-client_id={GOOGLE_CLIENT_ID}
                            data-context="signup"
                            data-callback="handleGoogleCredential"
                            data-auto_prompt="false"
                          />
                          <div
                            className="g_id_signin dc-oauth__google"
                            data-type="standard"
                            data-shape="rectangular"
                            data-theme="outline"
                            data-text="signup_with"
                            data-size="large"
                            data-logo_alignment="left"
                            data-width="380"
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
                            <span>Sign up with WhatsApp</span>
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
                            onClick={handleWaSendOtp}
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
                              onClick={() => { setWaStage('phone'); setWaCode(''); setServerError(''); }}
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
                            onKeyDown={e => { if (e.key === 'Enter' && waCode.length === 6) { e.preventDefault(); handleWaVerify(); } }}
                            className="dc-wa-input dc-wa-input--code"
                          />
                          <button
                            type="button"
                            onClick={handleWaVerify}
                            disabled={waVerifying || waCode.length !== 6}
                            className="dc-btn-wa dc-btn-wa--filled"
                          >
                            {waVerifying ? (
                              <><Loader2 size={14} className="dc-spin" />Verifying…</>
                            ) : (
                              <><Check size={14} />Verify &amp; continue</>
                            )}
                          </button>
                        </div>
                      )}
                      {waStage === 'idle' && (
                        <div className="dc-oauth__divider"><span>or continue with email</span></div>
                      )}
                    </div>
                  )}

                  {oauthProvider && (
                    <div className="dc-oauth-banner">
                      <CheckCircle2 size={16} />
                      <span>Continuing with {oauthProvider === 'google' ? 'Google' : 'Apple'}. Set a username to finish.</span>
                    </div>
                  )}

                  <div className="dc-field">
                    <label htmlFor="signup-name" className="dc-label">Full Name</label>
                    <div className="dc-input-wrap">
                      <User className="dc-input-icon" size={18} />
                      <input
                        id="signup-name"
                        {...form.register('full_name')}
                        type="text"
                        placeholder="e.g. Jane Tan"
                        className={`dc-input${form.formState.errors.full_name ? ' dc-input--error' : ''}`}
                      />
                    </div>
                    {form.formState.errors.full_name && (
                      <p className="dc-field__error">{form.formState.errors.full_name.message}</p>
                    )}
                  </div>

                  <div className="dc-field">
                    <label htmlFor="signup-email" className="dc-label">Email</label>
                    <div className="dc-input-wrap">
                      <Mail className="dc-input-icon" size={18} />
                      <input
                        id="signup-email"
                        {...form.register('email')}
                        type="email"
                        placeholder="you@company.com"
                        autoComplete="email"
                        className={`dc-input${form.formState.errors.email ? ' dc-input--error' : ''}`}
                      />
                    </div>
                    {form.formState.errors.email && (
                      <p className="dc-field__error">{form.formState.errors.email.message}</p>
                    )}
                  </div>

                  <div className="dc-field">
                    <label htmlFor="signup-phone" className="dc-label">WhatsApp Phone</label>
                    <div className="dc-otp-row">
                      <div className="dc-input-wrap dc-input-wrap--grow">
                        <Phone className="dc-input-icon" size={18} />
                        <input
                          id="signup-phone"
                          {...form.register('whatsapp_phone')}
                          type="tel"
                          placeholder="+65 8888 8888"
                          autoComplete="tel"
                          disabled={otpVerified && !BYPASS_OTP}
                          className={`dc-input${form.formState.errors.whatsapp_phone ? ' dc-input--error' : ''}${otpVerified && !BYPASS_OTP ? ' dc-input--verified' : ''}`}
                        />
                        {otpVerified && !BYPASS_OTP && (
                          <CheckCircle2 size={18} className="dc-input-check" />
                        )}
                      </div>
                      {!otpVerified && !BYPASS_OTP && (
                        <button
                          type="button"
                          onClick={handleSendOtp}
                          disabled={otpSending || (otpSent && !otpError)}
                          className="dc-otp-btn"
                        >
                          {otpSending ? (
                            <><Loader2 size={14} className="dc-spin" />Sending…</>
                          ) : otpSent ? (
                            <><Send size={14} />Sent</>
                          ) : (
                            <><MessageCircle size={14} />Send code</>
                          )}
                        </button>
                      )}
                    </div>
                    {form.formState.errors.whatsapp_phone && (
                      <p className="dc-field__error">{form.formState.errors.whatsapp_phone.message}</p>
                    )}
                    {otpSent && !otpVerified && !BYPASS_OTP && (
                      <div className="dc-otp-verify">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={otpCode}
                          onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="6-digit code"
                          className="dc-input dc-otp-code"
                        />
                        <button
                          type="button"
                          onClick={handleVerifyOtp}
                          disabled={otpVerifying || otpCode.length !== 6}
                          className="dc-otp-btn dc-otp-btn--primary"
                        >
                          {otpVerifying ? (
                            <><Loader2 size={14} className="dc-spin" />Verifying…</>
                          ) : (
                            <><Check size={14} />Verify</>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={handleSendOtp}
                          disabled={otpSending}
                          className="dc-otp-resend"
                        >
                          Resend
                        </button>
                      </div>
                    )}
                    {otpError && <p className="dc-field__error">{otpError}</p>}
                    <p className="dc-field__hint">
                      {BYPASS_OTP
                        ? 'Admin will use this number to send you approval updates via WhatsApp.'
                        : otpVerified
                          ? '✓ WhatsApp number verified.'
                          : 'We\'ll send a 6-digit code to your WhatsApp. Verification is required.'}
                    </p>
                  </div>

                  <div className="dc-field">
                    <label htmlFor="signup-username" className="dc-label">Username</label>
                    <div className="dc-input-wrap">
                      <User className="dc-input-icon" size={18} />
                      <input
                        id="signup-username"
                        {...form.register('username')}
                        type="text"
                        placeholder="Choose a username"
                        autoComplete="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        className={`dc-input${form.formState.errors.username ? ' dc-input--error' : ''}`}
                      />
                    </div>
                    {form.formState.errors.username && (
                      <p className="dc-field__error">{form.formState.errors.username.message}</p>
                    )}
                  </div>

                  {!oauthProvider && (
                    <div className="dc-field">
                      <label htmlFor="signup-password" className="dc-label">Password</label>
                      <div className="dc-input-wrap">
                        <Lock className="dc-input-icon" size={18} />
                        <input
                          id="signup-password"
                          {...form.register('password')}
                          type={showPwd ? 'text' : 'password'}
                          placeholder="At least 8 characters"
                          autoComplete="new-password"
                          className={`dc-input dc-input--password${form.formState.errors.password ? ' dc-input--error' : ''}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPwd(v => !v)}
                          className="dc-eye"
                          aria-label={showPwd ? 'Hide password' : 'Show password'}
                        >
                          {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                      {form.formState.errors.password && (
                        <p className="dc-field__error">{form.formState.errors.password.message}</p>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* STEP 2: PICK COMPANY */}
              {step === 1 && (
                <>
                  <div className="dc-field">
                    <label className="dc-label">Which company are you with?</label>
                    <p className="dc-field__hint" style={{ marginBottom: 10 }}>
                      Choose your company from the list. Admin will verify your employment before approving your account.
                    </p>

                    <Controller
                      control={form.control}
                      name="company_id"
                      render={({ field }) => (
                        <div className="dc-company-picker">
                          <button
                            type="button"
                            onClick={() => setCompanyDropdownOpen(v => !v)}
                            className={`dc-company-trigger${form.formState.errors.company_id ? ' dc-input--error' : ''}`}
                          >
                            <Building2 size={18} className="dc-input-icon dc-input-icon--static" />
                            <span className={selectedCompany ? 'dc-company-selected' : 'dc-company-placeholder'}>
                              {selectedCompany
                                ? `${selectedCompany.name}${selectedCompany.company_code ? ` (${selectedCompany.company_code})` : ''}`
                                : 'Select your company…'}
                            </span>
                            <ChevronDown size={18} className={`dc-chev${companyDropdownOpen ? ' dc-chev--open' : ''}`} />
                          </button>
                          {companyDropdownOpen && (
                            <div className="dc-company-dropdown">
                              <input
                                type="text"
                                value={companiesSearch}
                                onChange={e => setCompaniesSearch(e.target.value)}
                                placeholder="Search…"
                                className="dc-company-search"
                                autoFocus
                              />
                              <div className="dc-company-list">
                                {loadingCompanies && (
                                  <div className="dc-company-empty">Loading companies…</div>
                                )}
                                {!loadingCompanies && filteredCompanies.length === 0 && (
                                  <div className="dc-company-empty">No companies found.</div>
                                )}
                                {filteredCompanies.map(c => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => {
                                      field.onChange(c.id);
                                      setCompanyDropdownOpen(false);
                                      setCompaniesSearch('');
                                    }}
                                    className={`dc-company-option${field.value === c.id ? ' dc-company-option--selected' : ''}`}
                                  >
                                    <div className="dc-company-option__name">{c.name}</div>
                                    <div className="dc-company-option__meta">
                                      {c.company_type && (
                                        <span className="dc-company-option__type">
                                          {TYPE_LABELS[c.company_type] ?? c.company_type}
                                        </span>
                                      )}
                                      {c.company_code && (
                                        <span className="dc-company-option__code">{c.company_code}</span>
                                      )}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    />
                    {form.formState.errors.company_id && (
                      <p className="dc-field__error">{form.formState.errors.company_id.message}</p>
                    )}

                    {selectedCompany && (
                      <div className="dc-company-preview">
                        <Building2 size={16} />
                        <div>
                          <p className="dc-company-preview__name">{selectedCompany.name}</p>
                          {selectedCompany.description && (
                            <p className="dc-company-preview__desc">{selectedCompany.description}</p>
                          )}
                        </div>
                      </div>
                    )}

                    <p className="dc-field__hint" style={{ marginTop: 14 }}>
                      Can&apos;t find your company? Contact admin on WhatsApp to have it added.
                    </p>
                  </div>
                </>
              )}

              {/* STEP 3: TERMS */}
              {step === 2 && (
                <>
                  <div className="dc-summary">
                    <h3 className="dc-summary__title">Review Your Details</h3>
                    <dl className="dc-summary__list">
                      <div><dt>Full name</dt><dd>{form.getValues('full_name')}</dd></div>
                      <div><dt>Username</dt><dd>{form.getValues('username')}</dd></div>
                      <div><dt>Email</dt><dd>{form.getValues('email')}</dd></div>
                      <div><dt>WhatsApp</dt><dd>{form.getValues('whatsapp_phone')}</dd></div>
                      <div><dt>Company</dt><dd>{selectedCompany?.name ?? '—'}</dd></div>
                    </dl>
                  </div>

                  <div className="dc-tnc">
                    <div className="dc-tnc__head">
                      <FileText size={16} />
                      <span>Terms &amp; Privacy</span>
                    </div>
                    <div className="dc-tnc__body">
                      <p>
                        By continuing, you agree to Doctor Clean&apos;s Terms &amp; Conditions and
                        Privacy Policy, including how we handle your booking, cancellation,
                        rescheduling, payment, and personal data.
                      </p>
                      <p style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                        <a
                          href="https://doctorcleanpayment.sg/terms"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--dc-green)', fontWeight: 700, textDecoration: 'underline' }}
                        >
                          Terms &amp; Conditions →
                        </a>
                        <a
                          href="https://doctorcleanpayment.sg/privacy"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--dc-green)', fontWeight: 700, textDecoration: 'underline' }}
                        >
                          Privacy Policy →
                        </a>
                      </p>
                      <p>
                        <strong>Partner-specific:</strong> Access to booking is granted only after admin
                        approval. Any company-level discount is set by Doctor Clean and may change.
                        Sharing credentials or automated abuse will result in permanent termination.
                      </p>
                    </div>
                  </div>

                  <label className="dc-tnc-check">
                    <input
                      type="checkbox"
                      {...form.register('tnc_accepted')}
                    />
                    <span>I have read and accept the Terms &amp; Conditions and Privacy Policy.</span>
                  </label>
                  {form.formState.errors.tnc_accepted && (
                    <p className="dc-field__error">{form.formState.errors.tnc_accepted.message}</p>
                  )}
                </>
              )}

              {/* Nav buttons */}
              <div className="dc-nav">
                {step > 0 ? (
                  <button type="button" onClick={goPrev} className="dc-btn-secondary">
                    <ArrowLeft size={16} />
                    Back
                  </button>
                ) : (
                  <Link href="/login" className="dc-btn-secondary">
                    <ArrowLeft size={16} />
                    Back to login
                  </Link>
                )}
                {step < 2 ? (
                  <button type="button" onClick={goNext} className="dc-btn-primary">
                    Continue
                    <ArrowRight size={16} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={form.formState.isSubmitting}
                    className="dc-btn-primary"
                  >
                    {form.formState.isSubmitting ? (
                      <>
                        <Loader2 size={16} className="dc-spin" />
                        Creating…
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        Submit Application
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>

            <p className="dc-help">
              Already have an account? <Link href="/login" className="dc-link">Sign in</Link>
            </p>
          </div>

          <div className="dc-footer">
            <span>© {year} · All rights reserved.</span>
            <span className="dc-footer__pipe">|</span>
            <Shield size={13} />
            <span>Secure</span>
            <span className="dc-footer__dot">•</span>
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
.dc-signup {
  position: relative;
  width: 100%;
  min-height: 100vh;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 25% 40%, rgba(22,180,145,0.08), transparent 45%),
    linear-gradient(135deg, #f4fff9 0%, #ffffff 48%, #ffffff 100%);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--dc-text);
  padding: 32px 16px 80px;
}
.dc-signup * { box-sizing: border-box; }

.dc-ribbon {
  position: fixed; left: 0; bottom: 0; width: 60%; height: 22vh;
  pointer-events: none; z-index: 1;
}

.dc-signup__container {
  position: relative; z-index: 10;
  max-width: 640px; margin: 0 auto;
  display: flex; flex-direction: column; align-items: center;
}
.dc-signup__brand { margin-bottom: 24px; text-align: center; }
.dc-signup__brand img { width: 120px; height: auto; }

.dc-card {
  width: 100%;
  padding: 32px 40px 28px;
  background: rgba(255,255,255,0.96);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(226,232,240,0.8);
  border-radius: 22px;
  box-shadow: 0 25px 60px rgba(15,23,42,0.08), 0 5px 15px rgba(15,23,42,0.04);
}
.dc-card__header { text-align: center; margin-bottom: 22px; }
.dc-card__title {
  margin: 0; font-size: 24px; font-weight: 800; color: var(--dc-navy);
  letter-spacing: -0.025em;
}
.dc-card__subtitle {
  margin: 6px 0 0; font-size: 14px; color: var(--dc-muted); line-height: 1.5;
}

/* Stepper */
.dc-stepper {
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 22px; padding: 0 8px;
}
.dc-step-wrap {
  display: flex; align-items: center; flex: 1;
}
.dc-step-wrap:last-child { flex: 0 0 auto; }
.dc-step-dot {
  width: 34px; height: 34px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: #f1f5f9; color: #64748b;
  font-size: 13px; font-weight: 700;
  transition: background 200ms ease, color 200ms ease, transform 200ms ease;
  flex-shrink: 0;
}
.dc-step-dot--active { background: var(--dc-green); color: #fff; transform: scale(1.05); }
.dc-step-dot--done { background: var(--dc-green-dark); color: #fff; }
.dc-step-label {
  margin-left: 8px; font-size: 12.5px; color: #64748b; font-weight: 600;
  white-space: nowrap;
}
.dc-step-label--active { color: var(--dc-navy); }
.dc-step-line {
  flex: 1; height: 2px; background: #e5e9ef;
  margin: 0 12px; transition: background 200ms ease;
}
.dc-step-line--done { background: var(--dc-green); }

.dc-error {
  margin-bottom: 12px; padding: 12px 14px;
  border-radius: 10px; background: #fff5f5;
  color: #c53030; border: 1px solid #fecaca; font-size: 13px;
}

.dc-form { display: flex; flex-direction: column; gap: 14px; }

/* OAuth buttons */
.dc-oauth {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  margin-bottom: 6px;
}
.dc-oauth__google { display: flex; justify-content: center; min-height: 48px; width: 100%; max-width: 380px; }
.dc-btn-apple {
  width: 100%; max-width: 380px; height: 48px;
  border-radius: 12px;
  border: none; background: #000; color: #fff;
  font-family: inherit; font-size: 15px; font-weight: 600;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  cursor: pointer;
  transition: background 150ms ease;
}
.dc-btn-apple:hover:not(:disabled) { background: #1a1a1a; }
.dc-btn-apple:disabled { opacity: 0.7; cursor: not-allowed; }

/* WhatsApp option — same width as Apple/Google */
.dc-btn-wa {
  width: 100%; max-width: 380px; height: 48px;
  border-radius: 12px;
  border: 1px solid #cbd5e1; background: #fff; color: #0f172a;
  font-family: inherit; font-size: 15px; font-weight: 600;
  display: flex; align-items: center; justify-content: center; gap: 10px;
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
  width: 100%; max-width: 380px;
  padding: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  display: flex; flex-direction: column; gap: 10px;
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
  width: 100%; height: 48px;
  padding: 0 14px;
  border: 1.5px solid var(--dc-border); border-radius: 12px;
  background: #fff; color: var(--dc-navy);
  font-family: inherit; font-size: 15px;
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
.dc-oauth__divider {
  display: flex; align-items: center; gap: 10px;
  margin: 8px 0 2px;
  color: #7c8799; font-size: 12px;
}
.dc-oauth__divider::before,
.dc-oauth__divider::after { content: ""; flex: 1; height: 1px; background: #e5e9ef; }
.dc-oauth-banner {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 6px;
  padding: 10px 12px;
  background: var(--dc-green-soft); color: var(--dc-navy);
  border: 1px solid rgba(20,174,143,0.2);
  border-radius: 10px;
  font-size: 13px;
}
.dc-oauth-banner svg { color: var(--dc-green); flex-shrink: 0; }

/* OTP row */
.dc-otp-row {
  display: flex; gap: 8px; align-items: stretch;
}
.dc-input-wrap--grow { flex: 1; }
.dc-input--verified {
  border-color: var(--dc-green);
  background: rgba(20,174,143,0.05);
}
.dc-input-check {
  position: absolute; right: 12px; top: 50%;
  transform: translateY(-50%); color: var(--dc-green);
  pointer-events: none;
}
.dc-otp-btn {
  height: 46px; padding: 0 14px;
  border: 1.5px solid var(--dc-border); background: #fff;
  color: var(--dc-navy);
  font-family: inherit; font-size: 13px; font-weight: 600;
  border-radius: 12px;
  display: flex; align-items: center; gap: 6px;
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease;
  white-space: nowrap;
}
.dc-otp-btn:hover:not(:disabled) { background: #f8fafc; border-color: #b8c4d3; }
.dc-otp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.dc-otp-btn--primary {
  background: var(--dc-green); color: #fff; border-color: var(--dc-green);
}
.dc-otp-btn--primary:hover:not(:disabled) { background: var(--dc-green-dark); border-color: var(--dc-green-dark); }
.dc-otp-verify {
  display: flex; gap: 8px; align-items: center;
  margin-top: 8px;
}
.dc-otp-code {
  flex: 1; height: 46px;
  padding: 0 16px !important;
  font-family: ui-monospace, monospace; font-size: 18px;
  letter-spacing: 0.3em; text-align: center;
}
.dc-otp-resend {
  background: transparent; border: none;
  color: var(--dc-green); font-family: inherit;
  font-size: 12.5px; font-weight: 600;
  cursor: pointer; padding: 8px 4px;
  white-space: nowrap;
}
.dc-otp-resend:hover:not(:disabled) { color: var(--dc-green-dark); }
.dc-otp-resend:disabled { opacity: 0.5; cursor: not-allowed; }
.dc-field { display: flex; flex-direction: column; gap: 6px; }
.dc-label {
  font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: #008d72;
}
.dc-field__hint {
  margin: 0; font-size: 12.5px; color: var(--dc-muted); line-height: 1.45;
}
.dc-input-wrap { position: relative; }
.dc-input {
  width: 100%; height: 52px;
  padding: 0 16px 0 46px;
  border: 1.5px solid var(--dc-border); border-radius: 14px;
  background: #fff; color: var(--dc-navy);
  font-size: 15px; font-family: inherit; outline: none;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.dc-input--password { padding-right: 44px; }
.dc-input:focus {
  border-color: var(--dc-green);
  box-shadow: 0 0 0 4px rgba(19,170,137,0.10);
}
.dc-input--error { border-color: #ef4444; }
.dc-input::placeholder { color: #a0aec0; }
.dc-input-icon {
  position: absolute; left: 14px; top: 50%;
  transform: translateY(-50%); color: #94a3b8; pointer-events: none;
}
.dc-input-icon--static { position: static; transform: none; color: #94a3b8; margin-right: 8px; }
.dc-eye {
  position: absolute; right: 10px; top: 50%;
  transform: translateY(-50%); padding: 6px;
  background: transparent; border: none;
  color: #94a3b8; cursor: pointer;
  display: flex; align-items: center;
  border-radius: 8px;
}
.dc-eye:hover { color: #64748b; background: #f1f5f9; }
.dc-field__error { margin: 2px 0 0 4px; font-size: 12px; color: #ef4444; }

/* Company picker */
.dc-company-picker { position: relative; }
.dc-company-trigger {
  width: 100%; height: 46px;
  padding: 0 14px;
  border: 1.5px solid var(--dc-border); border-radius: 12px;
  background: #fff; color: var(--dc-navy);
  font-family: inherit; font-size: 15px;
  display: flex; align-items: center; gap: 10px;
  cursor: pointer; transition: border-color 160ms ease;
}
.dc-company-trigger:hover { border-color: #b8c4d3; }
.dc-company-placeholder { flex: 1; text-align: left; color: #a0aec0; }
.dc-company-selected { flex: 1; text-align: left; color: var(--dc-navy); font-weight: 500; }
.dc-chev { color: #94a3b8; transition: transform 200ms ease; }
.dc-chev--open { transform: rotate(180deg); }

.dc-company-dropdown {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0;
  z-index: 20;
  background: #fff; border: 1px solid var(--dc-border);
  border-radius: 12px; overflow: hidden;
  box-shadow: 0 12px 30px rgba(15,23,42,0.08);
}
.dc-company-search {
  width: 100%; height: 40px;
  padding: 0 14px;
  border: none; border-bottom: 1px solid #eef2f7;
  background: #f8fafc; font-family: inherit; font-size: 14px;
  outline: none; color: var(--dc-navy);
}
.dc-company-list {
  max-height: 260px; overflow-y: auto;
}
.dc-company-option {
  width: 100%; padding: 10px 14px;
  border: none; background: #fff;
  cursor: pointer; text-align: left;
  border-bottom: 1px solid #f1f5f9;
  transition: background 100ms ease;
}
.dc-company-option:hover { background: #f8fafc; }
.dc-company-option--selected { background: var(--dc-green-soft); }
.dc-company-option:last-child { border-bottom: none; }
.dc-company-option__name { font-size: 14px; font-weight: 600; color: var(--dc-navy); }
.dc-company-option__meta {
  display: flex; gap: 8px; margin-top: 2px;
  font-size: 11.5px; color: var(--dc-muted);
}
.dc-company-option__type {
  background: #ede9fe; color: #6d28d9;
  padding: 1px 6px; border-radius: 4px; font-weight: 500;
}
.dc-company-option__code { font-family: ui-monospace, monospace; }
.dc-company-empty { padding: 20px; text-align: center; font-size: 13px; color: #a0aec0; }

.dc-company-preview {
  display: flex; gap: 10px; align-items: flex-start;
  margin-top: 12px; padding: 12px 14px;
  background: #f0fdf4; border: 1px solid #bbf7d0;
  border-radius: 10px; color: #14532d;
}
.dc-company-preview svg { color: var(--dc-green); flex-shrink: 0; margin-top: 2px; }
.dc-company-preview__name { margin: 0; font-size: 14px; font-weight: 600; }
.dc-company-preview__desc {
  margin: 4px 0 0; font-size: 12.5px; color: #166534; line-height: 1.45;
}

/* Summary + TNC */
.dc-summary {
  background: #f8fafc; border: 1px solid #e5e9ef;
  border-radius: 12px; padding: 14px 16px;
}
.dc-summary__title { margin: 0 0 10px; font-size: 13px; font-weight: 700; color: var(--dc-navy); }
.dc-summary__list { margin: 0; display: flex; flex-direction: column; gap: 8px; }
.dc-summary__list > div {
  display: grid; grid-template-columns: 100px 1fr;
  gap: 12px; font-size: 13px;
}
.dc-summary__list dt { color: var(--dc-muted); }
.dc-summary__list dd { margin: 0; color: var(--dc-navy); font-weight: 500; word-break: break-word; }

.dc-tnc {
  border: 1px solid var(--dc-border); border-radius: 12px;
  overflow: hidden;
}
.dc-tnc__head {
  padding: 10px 14px; background: #f8fafc;
  border-bottom: 1px solid #eef2f7;
  display: flex; align-items: center; gap: 8px;
  font-size: 12.5px; font-weight: 700; color: var(--dc-navy);
}
.dc-tnc__head svg { color: var(--dc-green); }
.dc-tnc__body {
  padding: 14px 16px;
  max-height: 220px; overflow-y: auto;
  font-size: 12.5px; line-height: 1.65; color: var(--dc-muted);
}
.dc-tnc__body p { margin: 0 0 8px; }
.dc-tnc__body strong { color: var(--dc-navy); }

.dc-tnc-check {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 14px; background: var(--dc-green-soft);
  border-radius: 10px; cursor: pointer; user-select: none;
  font-size: 13.5px; color: var(--dc-navy); line-height: 1.4;
}
.dc-tnc-check input[type="checkbox"] {
  margin-top: 2px; width: 18px; height: 18px;
  accent-color: var(--dc-green); cursor: pointer;
}

/* Nav */
.dc-nav {
  display: flex; gap: 10px; margin-top: 10px;
}
.dc-btn-primary, .dc-btn-secondary {
  flex: 1; height: 52px;
  border-radius: 14px;
  font-size: 15px; font-weight: 800;
  font-family: inherit;
  display: flex; align-items: center; justify-content: center;
  gap: 10px; letter-spacing: 0.02em;
  cursor: pointer; text-decoration: none;
  transition: background 150ms ease, border-color 150ms ease, transform 150ms ease;
}
.dc-btn-primary {
  border: none; background: var(--dc-green); color: #fff;
  box-shadow: 0 10px 20px rgba(14,174,139,0.22);
}
.dc-btn-primary:hover:not(:disabled) { background: var(--dc-green-dark); transform: translateY(-1px); }
.dc-btn-primary:disabled { opacity: 0.75; cursor: not-allowed; }
.dc-btn-secondary {
  border: 1px solid var(--dc-border); background: #fff; color: #43526a;
}
.dc-btn-secondary:hover { background: #f8fafc; border-color: #b8c4d3; }
.dc-btn-secondary svg { color: var(--dc-green); }

.dc-spin { animation: dc-spin 700ms linear infinite; }
@keyframes dc-spin { to { transform: rotate(360deg); } }

.dc-help { margin: 18px 0 0; text-align: center; font-size: 13px; color: var(--dc-muted); }
.dc-link {
  color: var(--dc-green); font-weight: 600;
  text-decoration: none; cursor: pointer;
}
.dc-link:hover { color: var(--dc-green-dark); }

.dc-footer {
  margin-top: 22px; display: flex;
  align-items: center; justify-content: center; flex-wrap: wrap;
  gap: 8px; font-size: 12.5px; font-weight: 500; color: #64748b;
  padding: 0 20px;
}
.dc-footer svg { color: var(--dc-green); }
.dc-footer__dot  { color: #cbd5e1; }
.dc-footer__pipe { color: #cbd5e1; margin: 0 2px; }

@media (max-width: 640px) {
  .dc-signup { padding: 20px 12px 60px; }
  .dc-card { padding: 24px 20px 20px; border-radius: 20px; }
  .dc-card__title { font-size: 20px; }
  .dc-card__subtitle { font-size: 13px; }
  .dc-step-label { display: none; }
  .dc-step-line { margin: 0 8px; }
  .dc-summary__list > div { grid-template-columns: 80px 1fr; }
  .dc-nav { flex-direction: column-reverse; }
  .dc-btn-primary, .dc-btn-secondary { width: 100%; }
}
`;
