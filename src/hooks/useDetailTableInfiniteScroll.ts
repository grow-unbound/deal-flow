import { useCallback, useMemo } from 'react';

import { getSentinelInsertIndex, useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { SELLER_INFINITE_SCROLL_RATIO } from '@/lib/seller-ui';

export function useDetailTableInfiniteScroll(options: {
  itemCount: number;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage: () => void;
}) {
  const hasMore = Boolean(options.hasNextPage);
  const isLoading = Boolean(options.isFetchingNextPage);

  const onLoadMore = useCallback(() => {
    options.fetchNextPage();
  }, [options.fetchNextPage]);

  const sentinelIndex = useMemo(
    () => getSentinelInsertIndex(options.itemCount, SELLER_INFINITE_SCROLL_RATIO),
    [options.itemCount],
  );

  const { sentinelRef } = useInfiniteScroll({
    hasMore,
    isLoading,
    onLoadMore,
  });

  return { sentinelIndex, sentinelRef };
}
