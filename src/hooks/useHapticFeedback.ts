'use client';

import { useCallback, useEffect, useState } from 'react';
import { triggerHaptic, type HapticStyle } from '@/lib/haptics';

/**
 * Returns a stable trigger that respects reduced-motion preference.
 */
export function useHapticFeedback(): (style?: HapticStyle) => void {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return useCallback(
    (style: HapticStyle = 'light') => {
      if (reducedMotion) return;
      triggerHaptic(style);
    },
    [reducedMotion],
  );
}
