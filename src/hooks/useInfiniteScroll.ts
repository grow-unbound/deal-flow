import { useEffect, useRef, type RefObject } from 'react';

interface UseInfiniteScrollOptions {
  hasMore: boolean;
  isLoading?: boolean;
  rootMargin?: string;
  threshold?: number;
  rootRef?: RefObject<Element | null>;
  onLoadMore: () => void;
}

/** Index after which to place the prefetch sentinel (0-based). */
export function getSentinelInsertIndex(itemCount: number, prefetchAtRatio = 0.75): number {
  if (itemCount <= 0) return -1;
  if (itemCount < 4) return itemCount - 1;
  return Math.max(0, Math.floor(itemCount * prefetchAtRatio) - 1);
}

export function useInfiniteScroll({
  hasMore,
  isLoading = false,
  rootMargin = '480px',
  threshold = 0,
  rootRef,
  onLoadMore,
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          onLoadMoreRef.current();
        }
      },
      { root: rootRef?.current ?? null, rootMargin, threshold },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, rootMargin, threshold, rootRef]);

  return { sentinelRef };
}
