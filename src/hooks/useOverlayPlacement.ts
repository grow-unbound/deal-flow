'use client';

import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';

export type OverlayVerticalPlacement = 'below' | 'above';

const DEFAULT_FLIP_THRESHOLD = 280;

/**
 * Flip inline combobox overlays above the anchor when there is not enough
 * space below (DealFlow DS: SOPickerFlipUp — &lt; 280px below anchor).
 */
export function useOverlayPlacement(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  flipThresholdPx = DEFAULT_FLIP_THRESHOLD,
): OverlayVerticalPlacement {
  const [placement, setPlacement] = useState<OverlayVerticalPlacement>('below');

  const measure = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setPlacement(spaceBelow < flipThresholdPx ? 'above' : 'below');
  }, [anchorRef, flipThresholdPx]);

  useLayoutEffect(() => {
    if (!open) {
      setPlacement('below');
      return;
    }
    measure();
    const onScroll = () => measure();
    const onResize = () => measure();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, measure]);

  return placement;
}
