'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { triggerHaptic, type HapticStyle } from '@/lib/haptics';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-sans font-medium touch-manipulation border border-transparent transition-all duration-base ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 select-none active:scale-[var(--yk-press-scale)]',
  {
    variants: {
      variant: {
        primary:     'bg-teal-500 text-cream-50 shadow-sm hover:bg-teal-600 hover:shadow-md active:bg-teal-700',
        secondary:   'border-cream-400 bg-white text-cream-900 hover:bg-cream-100 hover:border-cream-500 active:bg-cream-200',
        ghost:       'text-cream-800 hover:bg-[var(--yk-hover-tint)] active:bg-[var(--yk-active-tint)]',
        accent:      'border-ember-500 bg-ember-400 text-cream-50 shadow-sm hover:bg-ember-500 hover:shadow-md active:bg-ember-600',
        destructive: 'bg-danger-500 text-cream-50 hover:bg-danger-700 active:bg-danger-700',
        outline:     'border-cream-400 text-cream-900 hover:bg-cream-100 active:bg-cream-200',
        link:        'text-ember-700 underline-offset-4 hover:underline p-0 h-auto border-transparent active:scale-100 active:opacity-70',
      },
      size: {
        sm:   'h-[var(--ctl-h-sm)] px-3 text-[length:var(--ctl-text-sm)]',
        md:   'h-[var(--ctl-h-md)] px-4 text-[length:var(--ctl-text-md)]',
        lg:   'h-[var(--ctl-h-lg)] px-6 text-[length:var(--ctl-text-md)]',
        icon: 'h-[var(--ctl-h-md)] w-[var(--ctl-h-md)]',
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
