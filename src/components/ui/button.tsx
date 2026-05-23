'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-sans font-medium transition-all duration-base ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 select-none',
  {
    variants: {
      variant: {
        primary:     'bg-teal-500 text-cream-50 shadow-sm hover:bg-teal-400 active:bg-teal-600',
        secondary:   'bg-cream-200 text-cream-900 border border-cream-300 hover:bg-cream-300 active:bg-cream-400',
        ghost:       'text-cream-800 hover:bg-cream-200 active:bg-cream-300',
        destructive: 'bg-danger-500 text-cream-50 hover:bg-danger-700 active:bg-danger-700',
        outline:     'border border-teal-500 text-teal-500 hover:bg-teal-50 active:bg-teal-100',
        link:        'text-teal-500 underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        sm:   'h-8 px-3 text-body-sm',
        md:   'h-10 px-4 text-body',
        lg:   'h-11 px-6 text-body',
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
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
