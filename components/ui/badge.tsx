import * as React from 'react';
import { cn } from '@/lib/utils';

const Badge = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement> & { variant?: 'default' | 'success' | 'warning' | 'destructive' | 'outline' }>(
  ({ className, variant = 'default', ...props }, ref) => {
    const variants = {
      default: 'bg-emerald-100 text-emerald-700',
      success: 'bg-green-100 text-green-700',
      warning: 'bg-yellow-100 text-yellow-800',
      destructive: 'bg-red-100 text-red-700',
      outline: 'border border-gray-300 text-gray-700',
    };
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';

export { Badge };
