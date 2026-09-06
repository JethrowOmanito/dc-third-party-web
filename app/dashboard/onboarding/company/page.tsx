'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, FileText, ShieldCheck, Loader2, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// Company onboarding — Phase 2 of the ID RBAC revamp.
// Boss / admin fills in company name + UEN + address, then uploads
// ACRA + UEN documents. Docs auto-approve on upload; when the last
// piece lands the API flips company_status → 'approved' and this
// page bounces the user into /dashboard.

interface DocState {
  file: File | null;
  uploading: boolean;
  uploaded: boolean;
  error: string | null;
}

const initialDoc = (): DocState => ({ file: null, uploading: false, uploaded: false, error: null });

export default function CompanyOnboardingPage() {
  const router = useRouter();
  const { user, refresh } = useAuthStore();

  const [name, setName]     = useState('');
  const [uen, setUen]       = useState('');
  const [address, setAddr]  = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [detailsSaved, setDetailsSaved] = useState(false);

  const [acra, setAcra] = useState<DocState>(initialDoc());
  const [uenDoc, setUenDoc] = useState<DocState>(initialDoc());

  const acraInputRef = useRef<HTMLInputElement>(null);
  const uenInputRef  = useRef<HTMLInputElement>(null);

  // Hydrate the form from the server on mount so revisits show what
  // the admin already saved (UEN, address, and whether docs are on
  // file). Falls back to the session's company_name if the fetch
  // hasn't returned yet.
  useEffect(() => {
    if (user?.company_name) setName((prev) => prev || user.company_name || '');
  }, [user?.company_name]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/onboarding/company', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.name)    setName(data.name);
        if (data.uen)     setUen(data.uen);
        if (data.address) setAddr(data.address);
        if (data.acra_uploaded) setAcra((s) => ({ ...s, uploaded: true }));
        if (data.uen_uploaded)  setUenDoc((s) => ({ ...s, uploaded: true }));
      } catch { /* silent — form is still usable blank */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Employees hit this page in error — bounce them to the dashboard.
  useEffect(() => {
    if (user?.partner_role === 'employee') router.replace('/dashboard');
  }, [user?.partner_role, router]);

  // Already approved? Nothing to do here.
  useEffect(() => {
    if (user?.company_status === 'approved') router.replace('/dashboard');
  }, [user?.company_status, router]);

  // Any 401 → session expired mid-flow. Bounce to login instead of
  // leaving the user staring at a cryptic error on this page.
  const bounceIfExpired = useCallback((status: number) => {
    if (status === 401) {
      router.replace('/login?redirect=/dashboard/onboarding/company');
      return true;
    }
    return false;
  }, [router]);

  const saveDetails = useCallback(async () => {
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch('/api/onboarding/company', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), uen: uen.trim(), address: address.trim() }),
      });
      if (bounceIfExpired(res.status)) return;
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed to save');
      setDetailsSaved(true);
      if (json.approved) {
        await refresh?.();
        router.replace('/dashboard');
      }
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [name, uen, address, refresh, router, bounceIfExpired]);

  const uploadDoc = useCallback(async (docType: 'acra' | 'uen', file: File) => {
    const setter = docType === 'acra' ? setAcra : setUenDoc;
    setter((s) => ({ ...s, file, uploading: true, error: null }));
    try {
      const form = new FormData();
      form.append('doc_type', docType);
      form.append('file', file);
      const res = await fetch('/api/onboarding/company/upload', {
        method: 'POST',
        body: form,
      });
      if (bounceIfExpired(res.status)) return;
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Upload failed');
      setter((s) => ({ ...s, uploading: false, uploaded: true }));
      if (json.approved) {
        await refresh?.();
        router.replace('/dashboard');
      }
    } catch (e) {
      setter((s) => ({ ...s, uploading: false, error: (e as Error).message }));
    }
  }, [refresh, router, bounceIfExpired]);

  const detailsValid = name.trim().length >= 2 && uen.trim().length >= 6 && address.trim().length >= 4;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
          <Building2 className="w-7 h-7" strokeWidth={1.75} />
        </div>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Complete Your Company Account</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
          Add your company details and upload ACRA + UEN docs. Access unlocks automatically once both are on file.
        </p>
      </div>

      {/* Details */}
      <section className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-[11px] font-black">1</div>
            <h2 className="text-sm font-bold text-slate-900">Company Details</h2>
          </div>
          {detailsSaved && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Registered Company Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Example Interior Pte Ltd" className="mt-1" />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">UEN</label>
            <Input value={uen} onChange={(e) => setUen(e.target.value.toUpperCase())} placeholder="201812345K" className="mt-1 uppercase" />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Registered Address</label>
            <Input value={address} onChange={(e) => setAddr(e.target.value)} placeholder="1 Raffles Place, #10-01, Singapore 048616" className="mt-1" />
          </div>
        </div>

        {formError && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 ring-1 ring-red-100">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{formError}</p>
          </div>
        )}

        <Button
          onClick={saveDetails}
          disabled={!detailsValid || saving}
          className={cn(
            'w-full h-11 rounded-xl font-bold text-sm',
            !detailsValid || saving ? 'bg-slate-100 text-slate-500' : 'bg-emerald-600 text-white hover:bg-emerald-700',
          )}
        >
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : 'Save Company Details'}
        </Button>
      </section>

      {/* Docs */}
      <section className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-[11px] font-black">2</div>
          <h2 className="text-sm font-bold text-slate-900">Upload Documents</h2>
        </div>

        <DocPicker
          label="ACRA BizFile"
          hint="Business profile from ACRA (PDF, PNG or JPG, max 8 MB)"
          state={acra}
          onPick={() => acraInputRef.current?.click()}
          Icon={FileText}
        />
        <input
          ref={acraInputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadDoc('acra', f);
            e.target.value = '';
          }}
        />

        <DocPicker
          label="UEN Certificate"
          hint="UEN registration document (PDF, PNG or JPG, max 8 MB)"
          state={uenDoc}
          onPick={() => uenInputRef.current?.click()}
          Icon={ShieldCheck}
        />
        <input
          ref={uenInputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadDoc('uen', f);
            e.target.value = '';
          }}
        />
      </section>

      <p className="text-[11px] text-slate-400 text-center">
        Docs are stored securely and never shared. You&apos;ll be dropped into the dashboard the moment both docs are on file.
      </p>
    </div>
  );
}

// Reusable per-doc uploader — shows idle, selecting, uploading, done,
// or error state based on the passed `state`.
function DocPicker({
  label, hint, state, onPick, Icon,
}: {
  label: string;
  hint: string;
  state: DocState;
  onPick: () => void;
  Icon: typeof FileText;
}) {
  return (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-xl ring-1 transition-colors',
      state.uploaded ? 'bg-emerald-50 ring-emerald-100'
        : state.error ? 'bg-red-50 ring-red-100'
        : 'bg-slate-50 ring-slate-100',
    )}>
      <div className={cn(
        'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
        state.uploaded ? 'bg-emerald-100 text-emerald-600'
          : state.error ? 'bg-red-100 text-red-600'
          : 'bg-white text-slate-500 ring-1 ring-slate-200',
      )}>
        {state.uploading ? <Loader2 className="w-5 h-5 animate-spin" />
          : state.uploaded ? <CheckCircle2 className="w-5 h-5" />
          : <Icon className="w-5 h-5" strokeWidth={1.75} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900 truncate">{label}</p>
        <p className="text-[11px] text-slate-500 truncate">
          {state.error ? state.error
            : state.uploaded ? (state.file?.name ?? 'Uploaded')
            : state.file?.name ?? hint}
        </p>
      </div>
      <button
        type="button"
        onClick={onPick}
        disabled={state.uploading}
        className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold flex-shrink-0',
          state.uploaded ? 'bg-white text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50'
            : 'bg-emerald-600 text-white hover:bg-emerald-700',
        )}
      >
        <Upload className="w-3.5 h-3.5" />
        {state.uploaded ? 'Replace' : 'Choose file'}
      </button>
    </div>
  );
}
