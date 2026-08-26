'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { DayPicker, useNavigation, formatMonthCaption } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function CustomDropdown(props: any) {
  return (
    <div className="relative group min-w-[80px]">
      <select
        className={cn(
          "bg-white text-emerald-900 text-[10px] font-black focus:outline-none cursor-pointer hover:bg-emerald-50 appearance-none px-3 py-2 rounded-xl border-2 border-emerald-100 shadow-sm transition-all pr-7 w-full",
          props.className
        )}
        value={props.value}
        onChange={props.onChange}
        disabled={props.disabled}
      >
        {props.options?.map((opt: any) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="w-3 h-3 text-emerald-600 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none transition-transform group-hover:scale-110" />
    </div>
  );
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <div className="w-full max-w-[280px] mx-auto flex justify-center">
      <DayPicker
        showOutsideDays={showOutsideDays}
        captionLayout="dropdown"
        fromYear={2024}
        toYear={2030}
        className={cn('p-0', className)}
        classNames={{
          months: 'w-full',
          month: 'space-y-4 w-full flex flex-col items-center',
          month_caption: 'flex items-center justify-center gap-2 mb-6 w-full',
          caption_label: 'hidden',
          dropdowns: 'flex items-center gap-3',
          dropdown_month: 'relative',
          dropdown_year: 'relative',
          month_grid: 'w-full border-collapse mt-2',
          weekdays: 'flex justify-between mb-2 w-full',
          weekday: 'text-emerald-400 rounded-md w-9 font-medium text-[0.7rem] text-center uppercase tracking-tighter',
          week: 'flex w-full mt-1.5 justify-between',
          day: cn(
            buttonVariants({ variant: 'ghost' }),
            'h-9 w-9 p-0 font-normal aria-selected:opacity-100 transition-all rounded-xl hover:bg-emerald-50 hover:text-emerald-700'
          ),
          selected:
            'bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white focus:bg-emerald-600 focus:text-white rounded-xl shadow-md shadow-emerald-500/20',
          today: 'bg-emerald-50 text-emerald-700 font-bold rounded-xl border border-emerald-200',
          outside: 'day-outside text-gray-200 opacity-50',
          disabled: 'text-gray-100 opacity-20',
          hidden: 'invisible',
          ...classNames,
        }}
        components={{
          Nav: () => <></>,
          Dropdown: CustomDropdown,
        }}
        {...props}
      />
    </div>
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
