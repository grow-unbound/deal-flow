'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { triggerHaptic, type HapticStyle } from '@/lib/haptics';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[9px] font-sans font-medium touch-manipulation transition-all duration-base ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 select-none active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary:     'bg-teal-500 text-cream-50 shadow-sm hover:bg-teal-600 active:bg-teal-700',
        secondary:   'bg-white text-teal-700 border border-cream-400 hover:bg-cream-100 active:bg-cream-200',
        ghost:       'text-cream-800 hover:bg-cream-200 active:bg-cream-300',
        accent:      'bg-ember-400 text-cream-50 border border-ember-500 hover:bg-ember-500 active:bg-ember-600',
        destructive: 'bg-danger-500 text-cream-50 hover:bg-danger-700 active:bg-danger-700',
        outline:     'border border-teal-500 text-teal-500 hover:bg-teal-50 active:bg-teal-100',
        link:        'text-teal-500 underline-offset-4 hover:underline p-0 h-auto active:scale-100 active:opacity-70',
      },
      size: {
        sm:   'h-8 px-3 text-body-sm',
        md:   'h-10 px-4 text-[13px]',
        lg:   'h-11 px-6 text-[14px]',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  haptic?: boolean | HapticStyle;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, haptic, onPointerDown, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
      onPointerDown?.(e);
      if (e.defaultPrevented || haptic === undefined || haptic === false) return;
      triggerHaptic(haptic === true ? 'light' : haptic);
    };
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onPointerDown={handlePointerDown}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
