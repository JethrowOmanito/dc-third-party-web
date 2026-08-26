'use client';
import { useState, useRef, useEffect } from 'react';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Loader2, Lock, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CheckoutFormProps {
  bookingId: string;
  refId: string;
  amount: number;
}

export default function CheckoutForm({ bookingId, refId, amount }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [elementReady, setElementReady] = useState(false);
  const [elementError, setElementError] = useState<string | null>(null);
  const isProcessing = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (elementTimeoutRef.current) clearTimeout(elementTimeoutRef.current);
    };
  }, []);

  // If the PaymentElement doesn't become ready within 20s, show a diagnostic error
  useEffect(() => {
    elementTimeoutRef.current = setTimeout(() => {
      if (!elementReady) {
        setElementError(
          stripe
            ? 'Payment form timed out loading. This usually means the Stripe publishable key (test/live) does not match the payment intent. Please refresh or contact admin.'
            : 'Stripe did not initialize. Check that NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is set.'
        );
      }
    }, 20_000);
    return () => {
      if (elementTimeoutRef.current) clearTimeout(elementTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetLoading = () => {
    isProcessing.current = false;
    setIsLoading(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || isProcessing.current) return;

    isProcessing.current = true;
    setIsLoading(true);
    setMessage(null);

    // Safety net: if confirmPayment never resolves (e.g. PayNow QR dismissed without
    // Stripe calling back), reset after 2 minutes so the button doesn't stay frozen.
    timeoutRef.current = setTimeout(() => {
      resetLoading();
      setMessage('Payment confirmation timed out. Please try again.');
    }, 120_000);

    // Pre-commit: track this booking so the dashboard handshake can pick it up on redirect
    try {
      localStorage.setItem('last_pushed_booking', bookingId);
      localStorage.setItem('last_pushed_ref', refId);
      sessionStorage.setItem('is_alpha_tab', 'true');
    } catch {}

    const appUrl = window.location.origin;

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${appUrl}/dashboard/booking/success?id=${bookingId}&ref=${refId}`,
      },
      redirect: 'if_required',
    });

    if (error) {
      setMessage(error.message || 'An unexpected error occurred.');
      resetLoading();
    } else if (paymentIntent?.status === 'succeeded') {
      resetLoading();
      window.location.href = `${appUrl}/dashboard/booking/success?id=${bookingId}&ref=${refId}&redirect_status=succeeded`;
    } else {
      // requires_action / processing — reset so user can retry or switch method
      resetLoading();
      if (paymentIntent?.status === 'processing') {
        setMessage('Your payment is being processed. You will receive a confirmation shortly.');
      } else if (paymentIntent?.status === 'requires_action') {
        setMessage('Additional action required. Please complete the payment step or try a different method.');
      }
    }
  };

  const disabled = isLoading || !stripe || !elements || !elementReady || !!elementError;

  const PaymentBadges = () => (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className="h-5 px-1.5 rounded bg-[#1A1F71] flex items-center">
        <span className="text-white font-black italic text-[9px] tracking-tight">VISA</span>
      </div>
      <div className="relative flex items-center w-6 h-4 flex-shrink-0">
        <div className="absolute left-0 w-4 h-4 rounded-full bg-[#EB001B]" />
        <div className="absolute left-2 w-4 h-4 rounded-full bg-[#F79E1B] opacity-90" />
      </div>
      <div className="h-5 px-1.5 rounded bg-[#000000] flex items-center">
        <span className="text-white font-black text-[8px] tracking-tight">Pay</span>
      </div>
      <div className="h-5 px-1.5 rounded bg-white border border-slate-200 flex items-center">
        <span className="text-slate-700 font-black text-[8px] tracking-tight">G Pay</span>
      </div>
      <div className="h-5 px-1.5 rounded bg-[#9B1FE0] flex items-center">
        <span className="text-white font-black text-[8px] tracking-tight">PayNow</span>
      </div>
      <div className="h-5 px-1.5 rounded bg-[#00B14F] flex items-center">
        <span className="text-white font-black text-[8px] tracking-tight">GrabPay</span>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-800">Secure Payment</p>
              <p className="text-[10px] text-slate-400 font-medium">256-bit SSL · Data never stored</p>
            </div>
          </div>
          <div className="hidden sm:flex">
            <PaymentBadges />
          </div>
        </div>
        <div className="flex sm:hidden items-center gap-2 mt-3 pt-3 border-t border-slate-100">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex-shrink-0">Accepted:</span>
          <PaymentBadges />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Payment Method</p>

          {/* Loading skeleton — shown until Stripe renders the form */}
          {!elementReady && !elementError && (
            <div className="space-y-2 animate-pulse">
              <div className="h-11 bg-slate-100 rounded-xl" />
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="h-14 bg-slate-100 rounded-xl" />
                <div className="h-14 bg-slate-100 rounded-xl" />
                <div className="h-14 bg-slate-100 rounded-xl" />
              </div>
              <div className="h-12 bg-slate-100 rounded-xl mt-2" />
            </div>
          )}

          {/* Stripe PaymentElement — hidden while loading so it can still initialize */}
          <div className={elementReady ? undefined : 'absolute opacity-0 pointer-events-none -z-10'}>
            <PaymentElement
              options={{ layout: 'tabs' }}
              onReady={() => {
                setElementReady(true);
                if (elementTimeoutRef.current) {
                  clearTimeout(elementTimeoutRef.current);
                  elementTimeoutRef.current = null;
                }
              }}
              onLoadError={(event) => {
                const msg = (event as any)?.error?.message || 'Unknown error';
                setElementError(`Payment form failed to load: ${msg}. Please refresh and try again, or contact admin.`);
                if (elementTimeoutRef.current) {
                  clearTimeout(elementTimeoutRef.current);
                  elementTimeoutRef.current = null;
                }
              }}
            />
          </div>

          {elementError && (
            <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-black text-red-700 mb-1">Payment form could not load</p>
                <p className="text-[11px] text-red-600 leading-relaxed">{elementError}</p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-2 text-[11px] font-black text-red-700 underline hover:no-underline"
                >
                  Refresh page
                </button>
              </div>
            </div>
          )}
        </div>

        {message && (
          <div className="flex items-start gap-2.5 p-3 sm:p-3.5 bg-red-50 border border-red-100 rounded-xl">
            <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-white text-[9px] font-black leading-none">!</span>
            </div>
            <p className="text-xs text-red-700 font-medium leading-relaxed">{message}</p>
          </div>
        )}

        <Button
          type="submit"
          disabled={disabled}
          className="w-full h-14 rounded-xl font-black text-base transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2.5"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing payment...
            </>
          ) : (
            <>
              <ShieldCheck className="w-5 h-5" />
              Pay S${amount.toFixed(2)} &amp; Confirm
            </>
          )}
        </Button>

        <p className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
          Secured by Stripe · Singapore · SGD
        </p>
      </form>
    </div>
  );
}
