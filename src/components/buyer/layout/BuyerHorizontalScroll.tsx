'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

interface BuyerHorizontalScrollProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function BuyerHorizontalScroll({
  children,
  className,
  ...props
}: BuyerHorizontalScrollProps): React.ReactNode {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = React.useState(false);
  const scrollTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;

    function handleScroll(): void {
      setIsScrolling(true);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 700);
    }

    node.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      node.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  return (
    <div
      ref={scrollRef}
      className={cn('buyer-hscroll flex overflow-x-auto pb-1', isScrolling && 'buyer-hscroll--active', className)}
      {...props}
    >
      {children}
    </div>
  );
}
