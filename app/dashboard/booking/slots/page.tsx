'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { ChevronRight, Clock, Loader2, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getSupabaseClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useBookingStore } from '@/store/bookingStore';
import type { BookingSlot } from '@/types';

const SLOTS: BookingSlot[] = [
  { label: '9:00–9:30 AM Arrival', start: '9:00 AM', end: '9:30 AM', additionalFee: 0 },
  { label: '2:00–4:00 PM Arrival', start: '2:00 PM', end: '4:00 PM', additionalFee: 0 },
  { label: '6:00–8:00 PM Arrival (+$50)', start: '6:00 PM', end: '8:00 PM', additionalFee: 50 },
];

export default function AvailableSlotsPage() {
  const router = useRouter();
  const supabase = getSupabaseClient();
  const { setDate, setSlot, setStep } = useBookingStore();

  const [selected, setSelected] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);
  const [availability, setAvailability] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const checkAvailability = useCallback(async (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    setLoading(true);
    try {
      const { data } = await supabase
        .from('events')
        .select('id, Start_Time')
        .eq('Start_Date', dateStr);

      const counts: Record<string, number> = {};
      (data || []).forEach((ev: any) => {
        const key = ev.Start_Time?.split(':').slice(0, 2).join(':') || '';
        counts[key] = (counts[key] || 0) + 1;
      });
      setAvailability(counts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) checkAvailability(selected);
  }, [selected, checkAvailability]);

  const handleProceed = () => {
    if (!selected || !selectedSlot) return;
    setDate(selected.toISOString().split('T')[0]);
    setSlot(selectedSlot);
    setStep('service');
    router.push('/dashboard/booking/new');
  };

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Calendar */}
      <Card>
        <CardContent className="p-3 flex justify-center">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={setSelected}
            disabled={{ before: new Date() }}
            className="text-sm"
            classNames={{
              day_selected: 'bg-emerald-600 text-white rounded-full',
              day_today: 'font-bold text-emerald-600',
            }}
          />
        </CardContent>
      </Card>

      {/* Slots */}
      {selected && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700">
            Available Slots — {selected.toLocaleDateString('en-SG', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            </div>
          ) : (
            SLOTS.map((slot) => {
              const isSelected = selectedSlot?.label === slot.label;
              return (
                <button
                  key={slot.label}
                  onClick={() => setSelectedSlot(slot)}
                  className={cn(
                    'w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left',
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Clock className={cn('w-4 h-4', isSelected ? 'text-emerald-600' : 'text-gray-400')} />
                    <div>
                      <p className={cn('text-sm font-medium', isSelected ? 'text-emerald-700' : 'text-gray-800')}>
                        {slot.label}
                      </p>
                      {(slot.additionalFee ?? 0) > 0 && (
                        <Badge variant="warning" className="mt-1 text-xs">
                          +${slot.additionalFee} surcharge
                        </Badge>
                      )}
                    </div>
                  </div>
                  {isSelected && <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}

      <Button
        onClick={handleProceed}
        disabled={!selected || !selectedSlot}
        className="w-full h-12 text-base"
      >
        Continue to Booking
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
