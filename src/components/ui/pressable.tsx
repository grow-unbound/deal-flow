'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { triggerHaptic, type HapticStyle } from '@/lib/haptics';
import { cn } from '@/lib/utils';

export interface PressableProps extends React.HTMLAttributes<HTMLElement> {
  asChild?: boolean;
  /** Fire short vibration on pointer down (mobile) */
  haptic?: boolean | HapticStyle;
}

const pressClasses =
  'touch-manipulation transition-transform duration-fast ease-standard active:scale-[0.98] select-none';

export const Pressable = React.forwardRef<HTMLElement, PressableProps>(
  ({ asChild = false, className, haptic = false, onPointerDown, ...props }, ref) => {
    const Comp = asChild ? Slot : 'div';

    const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
      onPointerDown?.(e);
      if (e.defaultPrevented || !haptic) return;
      const style = haptic === true ? 'light' : haptic;
      triggerHaptic(style);
    };

    return (
      <Comp
        ref={ref as never}
        className={cn(pressClasses, className)}
        onPointerDown={handlePointerDown}
        {...props}
      />
    );
  },
);
Pressable.displayName = 'Pressable';
