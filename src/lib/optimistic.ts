import type { QueryClient, QueryKey } from '@tanstack/react-query';

export interface OptimisticSnapshot<T = unknown> {
  key: QueryKey;
  previous: T | undefined;
}

export async function takeSnapshots(
  queryClient: QueryClient,
  keys: QueryKey[],
): Promise<OptimisticSnapshot[]> {
  await Promise.all(keys.map((key) => queryClient.cancelQueries({ queryKey: key })));
  return keys.map((key) => ({
    key,
    previous: queryClient.getQueryData(key),
  }));
}

export function rollbackSnapshots(
  queryClient: QueryClient,
  snapshots?: OptimisticSnapshot[],
) {
  snapshots?.forEach((snapshot) => {
    queryClient.setQueryData(snapshot.key, snapshot.previous);
  });
}
