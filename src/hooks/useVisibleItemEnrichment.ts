import { useCallback, useEffect, useRef } from 'react';

interface UseVisibleItemEnrichmentOptions {
  /** Ids already enriched — skip re-observing/re-firing for these. */
  enrichedIds: Set<string>;
  onBatchVisible: (ids: string[]) => void;
  rootMargin?: string;
  debounceMs?: number;
}

/**
 * Watches per-item elements (registered via `registerRef(id)`) and batches
 * ids that scroll into view, debounced, into a single `onBatchVisible` call —
 * the phase-2 price/stock enrichment trigger for buyer-PWA search results.
 */
export function useVisibleItemEnrichment({
  enrichedIds,
  onBatchVisible,
  rootMargin = '200px',
  debounceMs = 200,
}: UseVisibleItemEnrichmentOptions) {
  const elementsRef = useRef(new Map<string, HTMLElement>());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const pendingRef = useRef(new Set<string>());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onBatchVisibleRef = useRef(onBatchVisible);
  onBatchVisibleRef.current = onBatchVisible;
  const enrichedIdsRef = useRef(enrichedIds);
  enrichedIdsRef.current = enrichedIds;

  const flush = useCallback(() => {
    if (pendingRef.current.size === 0) return;
    const batch = Array.from(pendingRef.current);
    pendingRef.current.clear();
    onBatchVisibleRef.current(batch);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      let scheduled = false;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = (entry.target as HTMLElement).dataset.enrichId;
        if (!id || enrichedIdsRef.current.has(id)) continue;
        pendingRef.current.add(id);
        scheduled = true;
      }
      if (scheduled) {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(flush, debounceMs);
      }
    }, { rootMargin });
    observerRef.current = observer;
    for (const el of elementsRef.current.values()) observer.observe(el);
    return () => {
      observer.disconnect();
      observerRef.current = null;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [flush, rootMargin]);

  const registerRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    const prev = elementsRef.current.get(id);
    if (prev && prev !== el) {
      observerRef.current?.unobserve(prev);
      elementsRef.current.delete(id);
    }
    if (el) {
      el.dataset.enrichId = id;
      elementsRef.current.set(id, el);
      if (!enrichedIdsRef.current.has(id)) observerRef.current?.observe(el);
    }
  }, []);

  return { registerRef };
}
