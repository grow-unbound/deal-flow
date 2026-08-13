'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

interface BuyerHorizontalScrollProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const CHEVRON_BUTTON_CLASS =
  'absolute top-1/2 z-[3] hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--border-1)] bg-[var(--bg-surface)] text-[var(--fg-1)] shadow-[var(--shadow-sm)] [@media(hover:hover)]:flex [@media(hover:hover)]:hover:bg-[var(--bg-recessed)]';

export function BuyerHorizontalScroll({
  children,
  className,
  ...props
}: BuyerHorizontalScrollProps): React.ReactNode {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);
  // Click-drag state — mouse/pen only, native touch scrolling is left untouched.
  const dragRef = React.useRef<{ startX: number; startScrollLeft: number; dragging: boolean; moved: boolean; pointerId: number } | null>(null);

  const updateScrollState = React.useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    setCanScrollLeft(node.scrollLeft > 1);
    setCanScrollRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 1);
  }, []);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;

    function handleScroll(): void {
      updateScrollState();
    }

    updateScrollState();
    node.addEventListener('scroll', handleScroll, { passive: true });

    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(node);
    Array.from(node.children).forEach((child) => resizeObserver.observe(child));

    // Desktop mouse wheels only emit deltaY, so a plain vertical wheel over the carousel
    // does nothing (the page just scrolls past it) — translate it to horizontal scroll.
    // Trackpad/touch gestures already send meaningful deltaX and pass through untouched.
    // Only preventDefault when the carousel actually has room to move, so page scroll still
    // takes over once the user reaches either end.
    function handleWheel(event: WheelEvent): void {
      if (!node) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const atStart = node.scrollLeft <= 0;
      const atEnd = node.scrollLeft + node.clientWidth >= node.scrollWidth - 1;
      if ((event.deltaY < 0 && atStart) || (event.deltaY > 0 && atEnd)) return;
      event.preventDefault();
      node.scrollLeft += event.deltaY;
    }

    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      node.removeEventListener('scroll', handleScroll);
      node.removeEventListener('wheel', handleWheel);
      resizeObserver.disconnect();
    };
  }, [updateScrollState]);

  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    // Left button only — right/middle-click (context menu, paste-scroll) should pass through.
    if (event.button !== 0) return;
    const node = scrollRef.current;
    if (!node) return;
    // Don't capture the pointer yet — capturing on a plain click (no movement) suppresses the
    // browser's native click-event synthesis on the inner <a>/<button>, breaking card navigation.
    // Capture is acquired lazily in handlePointerMove, once an actual drag is detected.
    dragRef.current = { startX: event.clientX, startScrollLeft: node.scrollLeft, dragging: true, moved: false, pointerId: event.pointerId };
  }, []);

  const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const node = scrollRef.current;
    if (!drag?.dragging || !node) return;
    const delta = event.clientX - drag.startX;
    if (Math.abs(delta) > 3) {
      if (!drag.moved) node.setPointerCapture(drag.pointerId);
      drag.moved = true;
    }
    if (!drag.moved) return;
    node.scrollLeft = drag.startScrollLeft - delta;
  }, []);

  const endDrag = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const node = scrollRef.current;
    if (dragRef.current?.dragging && node) {
      try {
        node.releasePointerCapture(event.pointerId);
      } catch {
        // pointer capture already released — nothing to clean up
      }
    }
    if (dragRef.current) dragRef.current.dragging = false;
  }, []);

  // A drag that actually moved the row shouldn't also fire the card's click-through
  // navigation — swallow just that one click, then reset for the next interaction.
  const handleClickCapture = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current?.moved) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (dragRef.current) dragRef.current.moved = false;
  }, []);

  function scrollByPage(direction: 1 | -1): void {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.8, behavior: 'smooth' });
  }

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className={cn('buyer-hscroll flex cursor-grab overflow-x-auto pb-1 active:cursor-grabbing', className)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={handleClickCapture}
        onDragStart={(event) => event.preventDefault()}
        {...props}
      >
        {children}
      </div>
      {canScrollLeft ? (
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => scrollByPage(-1)}
          className={cn(CHEVRON_BUTTON_CLASS, 'left-1')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      ) : null}
      {canScrollRight ? (
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => scrollByPage(1)}
          className={cn(CHEVRON_BUTTON_CLASS, 'right-1')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
