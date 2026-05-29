import { useEffect, useRef } from 'react';

interface UseInfiniteScrollOptions {
  hasMore: boolean;
  isLoading?: boolean;
  rootMargin?: string;
  threshold?: number;
  onLoadMore: () => void;
}

export function useInfiniteScroll({
  hasMore,
  isLoading = false,
  rootMargin = '260px',
  threshold = 0,
  onLoadMore,
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          onLoadMore();
        }
      },
      { root: null, rootMargin, threshold }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, onLoadMore, rootMargin, threshold]);

  return { sentinelRef };
}

