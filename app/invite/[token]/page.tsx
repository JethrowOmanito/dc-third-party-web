'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// Public invite-acceptance page. Renders the company the user was
// invited to, collects the minimum signup fields, and creates an
// auto-approved partner_user account under that company.

interface InviteInfo {
  company_name: string;
  role: 'admin' | 'employee';
  email_hint: string | null;
}

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { setUser } = useAuthStore();

  const token = params?.token ?? '';

  const [loadingInvite, setLoadingInvite] = useState(true);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail]       = useState('');
  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoadingInvite(true);
      try {
        const res = await fetch(`/api/invite/${token}`, { cache: 'no-store' });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLookupError(json?.error ?? 'Invite could not be verified.');
        } else {
          setInvite(json);
          if (json.email_hint) setEmail(json.email_hint);
        }
      } catch {
        if (!cancelled) setLookupError('Network error — please try again.');
      } finally {
        if (!cancelled) setLoadingInvite(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const submit = useCallback(async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/invite/${token}/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          username: username.trim(),
          password,
          email: email.trim() || null,
          whatsapp_phone: phone.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed to create account');
      setUser(json.user);
      router.replace('/dashboard');
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [token, fullName, username, password, email, phone, setUser, router]);

  const canSubmit =
    fullName.trim().length >= 2 &&
    /^[a-zA-Z0-9._-]{3,64}$/.test(username.trim()) &&
    password.length >= 8;

  if (loadingInvite) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (lookupError || !invite) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl ring-1 ring-red-100 shadow-sm p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h1 className="text-base font-bold text-slate-900">This invite can&apos;t be used</h1>
          <p className="text-sm text-slate-500 mt-2">{lookupError ?? 'Invite is invalid.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-6">
      <div className="max-w-md w-full space-y-4">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-7 h-7" strokeWidth={1.75} />
          </div>
          <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">
            You&apos;re invited to <span className="text-emerald-600">{invite.company_name}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Set up your account to join as an <span className="font-semibold capitalize">{invite.role}</span>.
          </p>
        </div>

        <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-5 space-y-3">
          <Field label="Full Name">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
          </Field>
          <Field label="Username">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value.trim())}
              placeholder="janedoe"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </Field>
          <Field label="Email (optional)">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
          </Field>
          <Field label="WhatsApp Number (optional)">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+65 8123 4567" />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </Field>

          {submitError && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 ring-1 ring-red-100">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{submitError}</p>
            </div>
          )}

          <Button
            onClick={submit}
            disabled={!canSubmit || submitting}
            className={cn(
              'w-full h-11 rounded-xl font-bold text-sm mt-2',
              !canSubmit || submitting ? 'bg-slate-100 text-slate-500' : 'bg-emerald-600 text-white hover:bg-emerald-700',
            )}
          >
            {submitting
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating account…</>
              : <><CheckCircle2 className="w-4 h-4 mr-2" /> Accept &amp; Join</>}
          </Button>
        </div>

        <p className="text-[11px] text-slate-400 text-center">
          This invite link is single-use and expires after 7 days.
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
