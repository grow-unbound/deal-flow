'use client';

import type { CSSProperties, ReactNode, Ref, TouchEvent as ReactTouchEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const PULL_THRESHOLD_PX = 72;
const MAX_PULL_PX = 112;
const DRAG_DAMPING = 0.48;
const NESTED_SCROLL_SELECTOR = '[data-buyer-nested-scroll="true"]';

type PullState = 'idle' | 'pulling' | 'armed' | 'refreshing';

function assignRef<T>(ref: Ref<T> | undefined, value: T) {
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  if (ref && 'current' in ref) {
    (ref as { current: T }).current = value;
  }
}

function isTouchInsideNestedScrollTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest(NESTED_SCROLL_SELECTOR) != null;
}

export function BuyerPullToRefresh({
  children,
  className,
  contentClassName,
  onRefresh,
  pullEnabled = true,
  style,
  viewportRef,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  onRefresh: () => Promise<void> | void;
  pullEnabled?: boolean;
  style?: CSSProperties;
  viewportRef?: Ref<HTMLDivElement>;
}) {
  const localViewportRef = useRef<HTMLDivElement | null>(null);
  const startYRef = useRef<number | null>(null);
  const startXRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const refreshingRef = useRef(false);
  const mountedRef = useRef(true);

  const [pullDistance, setPullDistance] = useState(0);
  const [pullState, setPullState] = useState<PullState>('idle');

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setViewportRef = useCallback((node: HTMLDivElement | null) => {
    localViewportRef.current = node;
    assignRef(viewportRef, node);
  }, [viewportRef]);

  const resetGesture = useCallback(() => {
    startYRef.current = null;
    startXRef.current = null;
    draggingRef.current = false;
    if (!refreshingRef.current) {
      setPullDistance(0);
      setPullState('idle');
    }
  }, []);

  const beginRefresh = useCallback(async () => {
    refreshingRef.current = true;
    setPullState('refreshing');
    setPullDistance(PULL_THRESHOLD_PX * 0.72);

    try {
      await onRefresh();
    } finally {
      refreshingRef.current = false;
      if (!mountedRef.current) return;
      setPullDistance(0);
      setPullState('idle');
    }
  }, [onRefresh]);

  const handleTouchStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    if (!pullEnabled || refreshingRef.current) return;
    if (isTouchInsideNestedScrollTarget(event.target)) {
      resetGesture();
      return;
    }
    if (event.touches.length !== 1) {
      resetGesture();
      return;
    }
    const viewport = localViewportRef.current;
    if (!viewport || viewport.scrollTop > 0) {
      resetGesture();
      return;
    }
    const touch = event.touches[0];
    startYRef.current = touch.clientY;
    startXRef.current = touch.clientX;
    draggingRef.current = false;
  }, [pullEnabled, resetGesture]);

  const handleTouchMove = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    if (!pullEnabled || refreshingRef.current) return;
    if (isTouchInsideNestedScrollTarget(event.target)) {
      resetGesture();
      return;
    }
    if (event.touches.length !== 1) {
      resetGesture();
      return;
    }

    const viewport = localViewportRef.current;
    const startY = startYRef.current;
    const startX = startXRef.current;
    if (!viewport || startY == null || startX == null) return;

    if (viewport.scrollTop > 0) {
      resetGesture();
      return;
    }

    const touch = event.touches[0];
    const deltaY = touch.clientY - startY;
    const deltaX = Math.abs(touch.clientX - startX);

    if (deltaY <= 0) {
      resetGesture();
      return;
    }
    if (deltaX > deltaY) return;

    draggingRef.current = true;
    event.preventDefault();

    const nextPull = Math.min(MAX_PULL_PX, Math.round(deltaY * DRAG_DAMPING));
    setPullDistance(nextPull);
    setPullState(nextPull >= PULL_THRESHOLD_PX ? 'armed' : 'pulling');
  }, [pullEnabled, resetGesture]);

  const handleTouchEnd = useCallback(() => {
    if (!draggingRef.current) {
      resetGesture();
      return;
    }
    const shouldRefresh = pullDistance >= PULL_THRESHOLD_PX;
    startYRef.current = null;
    startXRef.current = null;
    draggingRef.current = false;

    if (!shouldRefresh) {
      setPullDistance(0);
      setPullState('idle');
      return;
    }

    void beginRefresh();
  }, [beginRefresh, pullDistance, resetGesture]);

  const indicatorLabel = useMemo(() => {
    switch (pullState) {
      case 'refreshing':
        return 'Refreshing';
      case 'armed':
        return 'Release to refresh';
      case 'pulling':
        return 'Pull to refresh';
      default:
        return 'Pull to refresh';
    }
  }, [pullState]);

  const contentStyle = useMemo<CSSProperties>(() => ({
    transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
    transition: pullState === 'refreshing' || pullState === 'idle'
      ? 'transform 180ms cubic-bezier(.22,1,.36,1)'
      : 'none',
    willChange: pullDistance > 0 ? 'transform' : undefined,
  }), [pullDistance, pullState]);

  return (
    <div
      ref={setViewportRef}
      className={cn('relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain', className)}
      style={style}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div
        aria-hidden={pullState === 'idle'}
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center"
        style={{
          opacity: pullState === 'idle' ? 0 : 1,
          transform: `translateY(${Math.max(8, Math.min(28, pullDistance * 0.4))}px)`,
          transition: 'opacity 140ms ease, transform 140ms ease',
        }}
      >
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-full border border-cream-300 bg-white/95 px-3 py-2 text-[var(--b-text-sub)] font-medium text-[var(--cream-700)] shadow-[var(--shadow-sm)]"
        >
          {pullState === 'refreshing' ? (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--ember-500)]" />
          ) : (
            <ArrowDown
              className={cn(
                'h-4 w-4 text-[var(--ember-500)] transition-transform duration-150',
                pullState === 'armed' ? 'rotate-180' : '',
              )}
            />
          )}
          <span>{indicatorLabel}</span>
        </div>
      </div>

      <div className={contentClassName} style={contentStyle}>
        {children}
      </div>
    </div>
  );
}
