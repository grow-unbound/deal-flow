'use client';

import { createPortal } from 'react-dom';
import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface BuyerFixedFooterProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Deep-route action footers (cart, product, order detail). Portaled to body so
 * BuyerPullToRefresh's transform does not become the fixed containing block.
 */
export function BuyerFixedFooter({ children, className, style }: BuyerFixedFooterProps) {
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div className={cn('buyer-sticky-footer', className)} style={style}>
      {children}
    </div>,
    document.body,
  );
}
