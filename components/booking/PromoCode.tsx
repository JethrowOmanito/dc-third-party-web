'use client';
import { useState } from 'react';
import { Tag, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { PromoCode } from '@/types';

interface PromoCodeProps {
  totalPrice: number;
  onApply: (promo: PromoCode, discountedTotal: number) => void;
  onRemove: () => void;
  appliedPromo: PromoCode | null;
}

export default function PromoCodeInput({ totalPrice, onApply, onRemove, appliedPromo }: PromoCodeProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApply = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase(), totalPrice }),
      });
      // Defensive parse — endpoint may return empty body on 5xx or middleware failure.
      const raw = await res.text();
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; }
      catch { setError(`Server error (${res.status}). Please try again.`); return; }
      if (!res.ok || !data.valid) {
        setError(data.error || 'Invalid or expired promo code.');
      } else {
        onApply(data.promo as PromoCode, data.discountedTotal as number);
        setCode('');
      }
    } catch {
      setError('Failed to validate code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (appliedPromo) {
    const discount =
      appliedPromo.discount_type === 'percentage'
        ? (totalPrice * appliedPromo.discount_value) / 100
        : appliedPromo.discount_value;

    return (
      <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-200">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <div>
            <p className="text-xs font-black text-emerald-800">{appliedPromo.code}</p>
            <p className="text-[10px] text-emerald-600">
              {appliedPromo.discount_type === 'percentage'
                ? `${appliedPromo.discount_value}% off`
                : `S$${appliedPromo.discount_value} off`}
              {' '}— saves S${discount.toFixed(2)}
            </p>
          </div>
        </div>
        <button onClick={onRemove} className="text-slate-400 hover:text-red-500 transition-colors">
          <XCircle className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <Input
            placeholder="Promo / voucher code"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && handleApply()}
            className="pl-8 h-10 text-xs font-bold uppercase tracking-wider"
          />
        </div>
        <Button
          type="button"
          onClick={handleApply}
          disabled={loading || !code.trim()}
          size="sm"
          variant="outline"
          className="h-10 px-4 text-xs font-black"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Apply'}
        </Button>
      </div>
      {error && <p className="text-[10px] text-red-500 font-bold ml-1">{error}</p>}
    </div>
  );
}
