'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0 w-full',
        month: 'space-y-4 w-full',
        month_caption: 'flex justify-center pt-1 relative items-center mb-4',
        caption_label: 'text-sm font-semibold',
        nav: 'space-x-1 flex items-center',
        button_previous: cn(
          buttonVariants({ variant: 'outline' }),
          'h-8 w-8 bg-transparent p-0 opacity-50 hover:opacity-100 absolute left-2'
        ),
        button_next: cn(
          buttonVariants({ variant: 'outline' }),
          'h-8 w-8 bg-transparent p-0 opacity-50 hover:opacity-100 absolute right-2'
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex justify-between',
        weekday: 'text-gray-500 rounded-md w-11 font-normal text-[0.8rem] text-center',
        week: 'flex w-full mt-2 justify-between',
        day: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-11 w-11 p-0 font-normal aria-selected:opacity-100'
        ),
        range_end: 'day-range-end',
        selected:
          'bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white focus:bg-emerald-600 focus:text-white rounded-xl',
        today: 'bg-emerald-50 text-emerald-700 font-bold rounded-xl',
        outside:
          'day-outside text-gray-300 opacity-50 aria-selected:bg-emerald-50/50 aria-selected:text-gray-400 aria-selected:opacity-30',
        disabled: 'text-gray-200 opacity-50',
        range_middle: 'aria-selected:bg-emerald-100 aria-selected:text-emerald-900',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ ...props }) => {
          if (props.orientation === 'left') {
            return <ChevronLeft className="h-4 w-4" />;
          }
          return <ChevronRight className="h-4 w-4" />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
