'use client';

import { useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export function useIdleRoutePrefetch(paths: string[], enabled = true) {
  const router = useRouter();
  const pathname = usePathname();
  const prefetchedKeyRef = useRef<string | null>(null);
  const normalizedPaths = useMemo(() => {
    const uniquePaths = Array.from(
      new Set(
        paths
          .filter(Boolean)
          .filter((path) => path !== pathname),
      ),
    );

    return uniquePaths;
  }, [pathname, paths]);
  const pathsKey = normalizedPaths.join('\n');

  useEffect(() => {
    if (!enabled || normalizedPaths.length === 0) return;
    if (prefetchedKeyRef.current === pathsKey) return;

    const run = () => {
      prefetchedKeyRef.current = pathsKey;
      normalizedPaths.forEach((path) => router.prefetch(path));
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(run, { timeout: 1500 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = globalThis.setTimeout(run, 300);
    return () => globalThis.clearTimeout(timeoutId);
  }, [enabled, normalizedPaths, pathsKey, router]);
}
