'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, Home, Search, Loader2, Mail, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import { getSupabaseClient } from '@/lib/supabase/client';

export default function BookingSuccessPage() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('id');
  const refFromUrl = searchParams.get('ref');
  const supabase = getSupabaseClient();
  const router = useRouter();
  const intentId = searchParams.get('payment_intent');

  const [mounted, setMounted] = useState(false);
  const [bookingData, setBookingData] = useState<{ id?: string, Ref_ID: string; status: string; webhook_processed: boolean } | null>(null);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'triggered' | 'failed'>('idle');
  const [errorCount, setErrorCount] = useState(0);
  const [recoveredId, setRecoveredId] = useState<string | null>(null);
  const [waitingForRecovery, setWaitingForRecovery] = useState(true);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const [isAlphaTab, setIsAlphaTab] = useState(false);

  const activeId = bookingId || recoveredId;

  useEffect(() => {
    setMounted(true);
    
    // HOME-FIRST PROTOCOL: Check if this is the original tab where the session marker was set.
    // sessionStorage is unique per tab, so the new Stripe-opened tab will NOT have this.
    const alphaMarker = sessionStorage.getItem('is_alpha_tab');
    if (alphaMarker === 'true') {
      setIsAlphaTab(true);
      console.log('[Home-First] Original tab identified. This screen will survive.');
      // Keep the marker for a few seconds to handle potential reloads, then clean up
      setTimeout(() => sessionStorage.removeItem('is_alpha_tab'), 5000);
    } else {
      console.log('[Home-First] Secondary tab identified. This is a redundant Ghost tab.');
    }

    // Grace period: Wait 10 seconds before giving up and redirecting to dashboard
    const timer = setTimeout(() => {
      setWaitingForRecovery(false);
    }, 10000);
    return () => clearTimeout(timer);
  }, [router]);

  // Sync across tabs. Use intentId as the universal handshake key
  useEffect(() => {
    if (!mounted || !intentId) return;
    const channel = new BroadcastChannel(`sync_${intentId}`);
    
    channel.onmessage = (event) => {
      if (event.data.type === 'SUCCESS_CONFIRMED') {
        console.log('[GhostTab] Syncing success from alpha tab.');
        
        setBookingData(prev => ({
          ...(prev || { Ref_ID: refFromUrl || '', webhook_processed: false }),
          status: 'confirmed'
        }));
        
        setRedirectCountdown(prev => prev === null ? (isAlphaTab ? 15 : 3) : prev);
      }
    };

    return () => channel.close();
  }, [mounted, intentId, refFromUrl, isAlphaTab]);

  useEffect(() => {
    if (!mounted) return;

    if (!waitingForRecovery && !bookingId && !intentId) {
      console.log('[Recovery] Grace period over. Redirecting to dashboard.');
      router.replace('/dashboard');
      return;
    }

    let isSubscribed = true;
    let timer: ReturnType<typeof setTimeout>;
    let currentErrorCount = 0;

    const triggerEmailFallback = async (targetId: string) => {
      try {
        const res = await fetch('/api/bookings/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: targetId }),
        });
        if (res.ok && isSubscribed) setEmailStatus('triggered');
      } catch (err) {
        console.error('Fallback email trigger failed:', err);
        if (isSubscribed) setEmailStatus('failed');
      }
    };

    const pollStatus = async () => {
      if (!isSubscribed) return;
      
      try {
        const intentParam = intentId ? `&payment_intent=${intentId}` : '';
        const idParam = bookingId ? `id=${bookingId}` : '';
        
        const res = await fetch(`/api/bookings/status?${idParam}${intentParam}`);
        const data = await res.json();

        if (!isSubscribed) return;

        if (data.error) {
          currentErrorCount++;
          setErrorCount(currentErrorCount);
          if (currentErrorCount < 100) {
             timer = setTimeout(pollStatus, 2000);
          }
          return;
        }
        
        if (data) {
          setBookingData(data);
          
          if (!bookingId && data.id) {
            setRecoveredId(data.id);
          }

          if (data.status === 'confirmed') {
            // Mark as seen to prevent dashboard infinite redirect loop
            try {
              const seenStr = localStorage.getItem('seen_success_bookings') || '[]';
              const seen = JSON.parse(seenStr);
              if (!seen.includes(data.id)) {
                seen.push(data.id);
                if (seen.length > 10) seen.shift(); // Keep list bounded
                localStorage.setItem('seen_success_bookings', JSON.stringify(seen));
              }
            } catch (e) {
              localStorage.setItem('seen_success_bookings', JSON.stringify([data.id]));
            }

            const channel = new BroadcastChannel(`sync_${intentId}`);
            channel.postMessage({ type: 'SUCCESS_CONFIRMED', id: data.id, intentId });
            channel.close();
            triggerEmailFallback(data.id);
            return; // Stop polling since we are confirmed
          } else {
            if (currentErrorCount < 100) {
               timer = setTimeout(pollStatus, 2000);
            }
          }
        }
      } catch (err) {
        if (!isSubscribed) return;
        console.error('Status check error:', err);
        currentErrorCount++;
        setErrorCount(currentErrorCount);
        if (currentErrorCount < 100) {
          timer = setTimeout(pollStatus, 2000);
        }
      }
    };

    pollStatus();

    return () => {
      isSubscribed = false;
      clearTimeout(timer);
    };
  }, [bookingId, intentId, mounted, waitingForRecovery, router]);

  // Handle auto-redirect countdown
  useEffect(() => {
    if (redirectCountdown === null) return;
    if (redirectCountdown <= 0) {
      // CLEANUP: We are leaving the success bubble, clear recovery flags
      localStorage.removeItem('last_pushed_booking');
      localStorage.removeItem('last_pushed_ref');
      router.push('/dashboard');
      return;
    }

    const timer = setTimeout(() => {
      setRedirectCountdown(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [redirectCountdown, router]);

  // Start countdown when confirmed - TIERED SPEED
  useEffect(() => {
    if (bookingData?.status === 'confirmed' && redirectCountdown === null) {
      setRedirectCountdown(isAlphaTab ? 15 : 3);
    }
  }, [bookingData?.status, redirectCountdown, isAlphaTab]);


  if (!mounted) return null;

  const isConfirmed = bookingData?.status === 'confirmed' || bookingData?.webhook_processed;

  return (
    <div className="max-w-lg mx-auto py-12 px-4 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Success Header - Instant Visibility for All Tabs */}
      <div className="text-center space-y-4">
        <div className="relative inline-block">
          <div className="absolute inset-0 bg-emerald-100 rounded-full blur-2xl opacity-50 scale-150 animate-pulse" />
          <div className="relative bg-emerald-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto shadow-inner ring-4 ring-white">
            <CheckCircle2 className="w-12 h-12 text-emerald-600" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Booking Secured!</h1>
          <p className="text-gray-500 font-medium">Your schedule is now reserved in our system.</p>
        </div>
      </div>

      {!isAlphaTab ? (
        /* GHOST TAB UI: Professional Exit */
        <div className="space-y-6 animate-in zoom-in-95 duration-500">
          <Card className="border-dashed border-emerald-200 bg-emerald-50/30">
            <CardContent className="p-8 text-center space-y-4">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-sm ring-1 ring-emerald-100">
                    <ShieldAlert className="w-6 h-6 text-emerald-600" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-lg font-black text-emerald-900">Transaction Successful</h2>
                    <p className="text-sm text-emerald-600/70 font-medium leading-relaxed">
                        Your payment has been verified. You can safely close this window to return to your dashboard.
                    </p>
                    {redirectCountdown !== null && (
                      <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mt-2 animate-pulse">
                        Auto-redirecting to dashboard in {redirectCountdown}s...
                      </p>
                    )}
                </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-3">
             <Button 
                onClick={() => {
                  window.close();
                  // Fallback for browsers that block window.close
                  router.replace('/dashboard');
                }}
                className="w-full h-14 text-lg font-bold bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all active:scale-[0.98]"
             >
                Close This Window
             </Button>
             <Link href="/dashboard" className="w-full">
                <Button variant="outline" className="w-full h-12 text-sm font-bold border-emerald-100 text-emerald-700 hover:bg-emerald-50">
                    Return to Dashboard
                </Button>
             </Link>
          </div>
        </div>
      ) : (
        /* ALPHA TAB UI: Full Receipt Experience */
        <>
          <Card className="border-emerald-100 bg-white/60 backdrop-blur-md shadow-xl shadow-emerald-900/5 overflow-hidden">
            <div className={`h-2 bg-gradient-to-r ${isConfirmed ? 'from-emerald-400 to-emerald-600' : 'from-emerald-400/30 to-emerald-600/30 animate-pulse'}`} />
            <CardContent className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-50">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Reference ID</span>
                  {(bookingData?.Ref_ID || refFromUrl) ? (
                    <span className="text-sm font-mono font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 animate-in fade-in zoom-in-95">
                      {bookingData?.Ref_ID || refFromUrl}
                    </span>
                  ) : (
                    <div className="h-6 w-24 bg-gray-100 rounded-full animate-pulse" />
                  )}
                </div>
                
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-800">Status Updates</h3>
                  <ul className="space-y-3">
                    <li className="flex gap-3 text-sm text-gray-600">
                      <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${isConfirmed ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
                      <div>
                        <p className="font-bold">{isConfirmed ? 'Payment Confirmed' : 'Syncing Records...'}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-tighter">
                          {isConfirmed ? 'Transaction complete' : 'Waiting for bank signal'}
                        </p>
                      </div>
                    </li>
                    <li className="flex gap-3 text-sm text-gray-600">
                      <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${emailStatus === 'triggered' ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                      <div>
                        <p className="font-bold">Confirmation Email</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-tighter">
                          {emailStatus === 'triggered' ? 'Sent to your inbox' : 'Queued for delivery'}
                        </p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>

              {(redirectCountdown !== null && isConfirmed) && (
                <div className="mt-8 pt-6 border-t border-emerald-50 flex flex-col items-center space-y-3 animate-in fade-in zoom-in-95 duration-500">
                  <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-full border border-emerald-100">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                    <p className="text-sm font-bold text-emerald-700 tracking-tight">
                      Redirecting to dashboard in {redirectCountdown}s...
                    </p>
                  </div>
                  <button 
                    onClick={() => setRedirectCountdown(null)}
                    className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-widest hover:text-emerald-800 underline decoration-2 underline-offset-4 transition-colors"
                    title="Keep this page open"
                  >
                    Cancel Auto-Redirect
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-3">
            {activeId && (
              <Link href={`/track/${activeId}`}>
                <Button className="w-full h-14 text-lg font-bold bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all active:scale-[0.98] group">
                  <Search className="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform" />
                  Track Status
                </Button>
              </Link>
            )}
            
            <Link href="/dashboard">
              <Button variant="outline" className="w-full h-14 text-lg font-bold border-gray-200 text-gray-600 hover:bg-gray-50 transition-all active:scale-[0.98]">
                <Home className="w-5 h-5 mr-2" />
                Dashboard
              </Button>
            </Link>
          </div>

          <div className="p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <p className="text-center text-[11px] text-gray-400 font-medium leading-relaxed italic">
              Your receipt will be sent via email. For urgent matters, please contact support.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
