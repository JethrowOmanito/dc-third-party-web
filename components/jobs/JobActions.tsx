'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, XCircle, Loader2, AlertTriangle, Info } from 'lucide-react';

type JobLite = {
  id: string;
  Ref_ID: number | string | null;
  Start_Date: string | null;
  Start_Time_Display: string | null;
  Price: number | null;
  lifecycle_state: string | null;
  payment_status: string | null;
};

type FeePreview = {
  amount: number;
  gst_amount: number;
  amount_with_gst: number;
  tier_hit: number | null;
  reason: 'admin_waived' | 'no_matching_tier' | 'tier_match';
  waived?: boolean;
  paid?: boolean;
};

type PreviewResp = {
  fee: FeePreview;
  payment_terms: 'upfront' | 'end_of_month';
};

type ActionKind = 'reschedule' | 'cancel' | null;

const TERMINAL = new Set(['cancelled', 'completed', 'deleted', 'rescheduled', 'cancelling']);

export function JobActions({ job, onChange }: { job: JobLite; onChange: () => void }) {
  const [open, setOpen] = useState<ActionKind>(null);
  const disabled = Boolean(job.lifecycle_state && TERMINAL.has(job.lifecycle_state));

  return (
    <>
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Manage Booking
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen('reschedule')}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <CalendarClock className="w-4 h-4" />
            Reschedule
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen('cancel')}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <XCircle className="w-4 h-4" />
            Cancel
          </button>
        </div>
        {disabled && (
          <p className="text-[11px] text-gray-400 mt-2 italic">
            This booking is {job.lifecycle_state}. Contact admin for further changes.
          </p>
        )}
      </div>

      {open === 'cancel' && (
        <CancelModal
          job={job}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            onChange();
          }}
        />
      )}
      {open === 'reschedule' && (
        <RescheduleModal
          job={job}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            onChange();
          }}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Cancel Modal
// ─────────────────────────────────────────────────────────────────────────
function CancelModal({
  job,
  onClose,
  onDone,
}: {
  job: JobLite;
  onClose: () => void;
  onDone: () => void;
}) {
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/jobs/${job.id}/cancel-info`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, body: d })))
      .then((res) => {
        if (!alive) return;
        if (!res.ok) setPreviewErr(res.body?.error ?? 'Could not load fee preview.');
        else setPreview(res.body as PreviewResp);
      })
      .catch(() => alive && setPreviewErr('Could not load fee preview.'));
    return () => {
      alive = false;
    };
  }, [job.id]);

  const confirm = async () => {
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/cancel`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setSubmitErr(body?.error ?? 'Cancel failed.');
      } else {
        const refund = body.refund ? ` Refund S$${Number(body.refund).toFixed(2)} will arrive in 5-10 business days.` : '';
        const feeNote =
          body.billing === 'eom_invoice' && body.fee_amount > 0
            ? ` A fee of S$${Number(body.fee_amount).toFixed(2)} (incl. GST) has been added to your end-of-month invoice.`
            : '';
        setSuccess(`Booking cancelled.${refund}${feeNote}`);
        setTimeout(onDone, 2200);
      }
    } catch {
      setSubmitErr('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const fee = preview?.fee;
  const feeAmount = fee?.amount_with_gst ?? 0;

  return (
    <Modal onClose={onClose} title="Cancel Booking" accent="rose">
      {success ? (
        <div className="text-center py-6 space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
            <XCircle className="w-6 h-6 text-emerald-600" />
          </div>
          <p className="text-sm text-gray-700">{success}</p>
        </div>
      ) : (
        <>
          <JobSummary job={job} />
          {previewErr && (
            <ErrorBlock message={previewErr} />
          )}
          {!preview && !previewErr && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          )}
          {preview && (
            <>
              <FeeBlock fee={fee!} paymentTerms={preview.payment_terms} kind="cancel" />
              {submitErr && <ErrorBlock message={submitErr} />}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="flex-1 h-10 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                >
                  Keep Booking
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={submitting}
                  className="flex-1 h-10 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {feeAmount > 0
                    ? `Confirm & charge S$${feeAmount.toFixed(2)}`
                    : 'Confirm Cancel'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Reschedule Modal
// ─────────────────────────────────────────────────────────────────────────
function RescheduleModal({
  job,
  onClose,
  onDone,
}: {
  job: JobLite;
  onClose: () => void;
  onDone: () => void;
}) {
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/jobs/${job.id}/reschedule-info`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, body: d })))
      .then((res) => {
        if (!alive) return;
        if (!res.ok) setPreviewErr(res.body?.error ?? 'Could not load fee preview.');
        else setPreview(res.body as PreviewResp);
      })
      .catch(() => alive && setPreviewErr('Could not load fee preview.'));
    return () => {
      alive = false;
    };
  }, [job.id]);

  const confirm = async () => {
    setSubmitErr(null);
    if (!newDate || !newTime) {
      setSubmitErr('Pick a new date and time.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_start_date: newDate,
          new_start_time: newTime,
          reason: reason || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSubmitErr(body?.error ?? 'Reschedule failed.');
      } else {
        const feeNote =
          body.fee_amount > 0
            ? ` A fee of S$${Number(body.fee_amount).toFixed(2)} (incl. GST)${body.billing === 'eom_invoice' ? ' will be added to your end-of-month invoice.' : ' will be collected.'}`
            : '';
        setSuccess(`Rescheduled to ${newDate} ${newTime}.${feeNote}`);
        setTimeout(onDone, 2500);
      }
    } catch {
      setSubmitErr('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const fee = preview?.fee;
  const minDate = new Date(Date.now() + 2 * 60 * 60_000).toISOString().split('T')[0];

  return (
    <Modal onClose={onClose} title="Reschedule Booking" accent="emerald">
      {success ? (
        <div className="text-center py-6 space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
            <CalendarClock className="w-6 h-6 text-emerald-600" />
          </div>
          <p className="text-sm text-gray-700">{success}</p>
        </div>
      ) : (
        <>
          <JobSummary job={job} />
          {previewErr && <ErrorBlock message={previewErr} />}
          {!preview && !previewErr && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          )}
          {preview && (
            <>
              <FeeBlock fee={fee!} paymentTerms={preview.payment_terms} kind="reschedule" />
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    New Date
                  </span>
                  <input
                    type="date"
                    value={newDate}
                    min={minDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="mt-1 w-full h-10 px-3 rounded-xl ring-1 ring-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    New Start Time
                  </span>
                  <input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="mt-1 w-full h-10 px-3 rounded-xl ring-1 ring-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Reason (optional)
                </span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="Why is this booking being rescheduled?"
                  className="mt-1 w-full px-3 py-2 rounded-xl ring-1 ring-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </label>
              <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2 flex items-start gap-1.5">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                Admin will confirm team availability for the new slot. If the new
                time can&apos;t be served, you&apos;ll be contacted on WhatsApp.
              </p>
              {submitErr && <ErrorBlock message={submitErr} />}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="flex-1 h-10 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={submitting}
                  className="flex-1 h-10 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Reschedule
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Shared pieces
// ─────────────────────────────────────────────────────────────────────────
function Modal({
  onClose,
  title,
  accent,
  children,
}: {
  onClose: () => void;
  title: string;
  accent: 'rose' | 'emerald';
  children: React.ReactNode;
}) {
  const barClass = accent === 'rose' ? 'bg-rose-500' : 'bg-emerald-500';
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-5 rounded-full ${barClass}`} />
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
        </div>
        {children}
      </div>
    </div>
  );
}

function JobSummary({ job }: { job: JobLite }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-xs">
      <p className="font-semibold text-gray-700">
        Ref #{job.Ref_ID ?? '—'} ·{' '}
        <span className="text-gray-500 font-normal">
          {job.Start_Date}
          {job.Start_Time_Display ? ` at ${job.Start_Time_Display}` : ''}
        </span>
      </p>
    </div>
  );
}

function FeeBlock({
  fee,
  paymentTerms,
  kind,
}: {
  fee: FeePreview;
  paymentTerms: 'upfront' | 'end_of_month';
  kind: 'cancel' | 'reschedule';
}) {
  if (fee.waived) {
    return (
      <div className="rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
        <p className="font-semibold">Fee waived by admin.</p>
      </div>
    );
  }
  if (fee.amount <= 0) {
    return (
      <div className="rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
        <p className="font-semibold">No {kind} fee.</p>
        <p className="text-emerald-600/80 mt-0.5">
          You&apos;re far enough ahead of the appointment time.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800 space-y-1">
      <div className="flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold">
            {kind === 'cancel' ? 'Cancellation' : 'Reschedule'} fee: S$
            {fee.amount_with_gst.toFixed(2)}
          </p>
          <p className="text-amber-700/80 mt-0.5">
            S${fee.amount.toFixed(2)} + S${fee.gst_amount.toFixed(2)} GST
            {fee.tier_hit ? ` · tier: <${fee.tier_hit}h before appointment` : ''}
          </p>
          <p className="text-amber-700 mt-1.5 font-medium">
            {paymentTerms === 'end_of_month'
              ? 'Added to your end-of-month invoice.'
              : kind === 'cancel'
                ? 'Deducted from your Stripe refund.'
                : 'Collected manually by admin.'}
          </p>
        </div>
      </div>
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 flex items-start gap-1.5">
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}
