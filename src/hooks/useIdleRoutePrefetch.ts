'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function useIdleRoutePrefetch(paths: string[], enabled = true) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || paths.length === 0) return;

    const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
    if (uniquePaths.length === 0) return;

    const run = () => {
      uniquePaths.forEach((path) => router.prefetch(path));
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(run, { timeout: 1500 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = globalThis.setTimeout(run, 300);
    return () => globalThis.clearTimeout(timeoutId);
  }, [enabled, paths, router]);
}
