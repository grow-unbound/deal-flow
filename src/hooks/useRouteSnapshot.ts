'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useBuyerScrollRoot } from '@/contexts/BuyerScrollContext';

type StorageMode = 'session' | 'local';

type SnapshotEnvelope<T> = {
  version: number;
  savedAt: number;
  pathname: string;
  payload: T;
};

type SnapshotMeta = {
  restored: boolean;
  savedAt: number | null;
};

type StateUpdater<T> = T | ((previous: T) => T);

const ROUTE_SNAPSHOT_PREFIX = 'yukti_route_snapshot:';
const ROUTE_SCROLL_PREFIX = 'yukti_route_scroll:';
const DEFAULT_VERSION = 1;

function getStorage(mode: StorageMode): Storage | null {
  if (typeof window === 'undefined') return null;
  return mode === 'local' ? window.localStorage : window.sessionStorage;
}

function buildStorageKey(prefix: string, key: string, pathname: string, scopeKey?: string) {
  return `${prefix}${key}:${pathname}${scopeKey ? `:${scopeKey}` : ''}`;
}

function readSnapshot<T>(
  storageKey: string,
  initialState: T,
  version: number,
  mode: StorageMode,
): { value: T; meta: SnapshotMeta } {
  const storage = getStorage(mode);
  if (!storage) {
    return { value: initialState, meta: { restored: false, savedAt: null } };
  }

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return { value: initialState, meta: { restored: false, savedAt: null } };
    }

    const parsed = JSON.parse(raw) as SnapshotEnvelope<T>;
    if (parsed.version !== version) {
      storage.removeItem(storageKey);
      return { value: initialState, meta: { restored: false, savedAt: null } };
    }

    return {
      value: parsed.payload,
      meta: { restored: true, savedAt: parsed.savedAt ?? null },
    };
  } catch {
    storage?.removeItem(storageKey);
    return { value: initialState, meta: { restored: false, savedAt: null } };
  }
}

function writeSnapshot<T>(storageKey: string, pathname: string, value: T, version: number, mode: StorageMode) {
  const storage = getStorage(mode);
  if (!storage) return;

  const payload: SnapshotEnvelope<T> = {
    version,
    savedAt: Date.now(),
    pathname,
    payload: value,
  };

  try {
    storage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Ignore storage quota and availability issues.
  }
}

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function useRouteSnapshot<T>({
  storageKey,
  initialState,
  version = DEFAULT_VERSION,
  enabled = true,
  mode = 'session',
  scopeKey,
  pathnameOverride,
}: {
  storageKey: string;
  initialState: T;
  version?: number;
  enabled?: boolean;
  mode?: StorageMode;
  scopeKey?: string;
  /** Use this instead of the live `usePathname()` for the storage key. For
   * components that stay mounted across a parent/child route pair (e.g. a
   * seller split-pane list view mounted across `/entity` <-> `/entity/[id]`
   * — see `EntitySplitShell`), the live pathname changes on that navigation
   * even though the component itself never remounts. Without this override,
   * the "route changed" re-hydrate effect below fires anyway and resets the
   * in-memory state (search/filters/sort) back to whatever (usually nothing)
   * is stored under the new URL's key. Pass a stable base path (e.g.
   * `/brands`) to opt out of that per-URL reset. */
  pathnameOverride?: string;
}) {
  const livePathname = usePathname();
  const pathname = pathnameOverride ?? livePathname;
  const resolvedStorageKey = useMemo(
    () => buildStorageKey(ROUTE_SNAPSHOT_PREFIX, storageKey, pathname, scopeKey),
    [pathname, scopeKey, storageKey],
  );

  const initialRead = useMemo(
    () => (enabled ? readSnapshot(resolvedStorageKey, initialState, version, mode) : { value: initialState, meta: { restored: false, savedAt: null } }),
    [enabled, initialState, mode, resolvedStorageKey, version],
  );

  const [state, setState] = useState<T>(initialRead.value);
  const [restoreMeta, setRestoreMeta] = useState<SnapshotMeta>(initialRead.meta);
  const previousKeyRef = useRef(resolvedStorageKey);
  const initialStateRef = useRef(initialState);

  initialStateRef.current = initialState;

  useEffect(() => {
    if (!enabled) return;
    writeSnapshot(resolvedStorageKey, pathname, state, version, mode);
  }, [enabled, mode, pathname, resolvedStorageKey, state, version]);

  useClientLayoutEffect(() => {
    if (!enabled) return;
    if (previousKeyRef.current === resolvedStorageKey) return;
    previousKeyRef.current = resolvedStorageKey;
    const next = readSnapshot(resolvedStorageKey, initialState, version, mode);
    setState(next.value);
    setRestoreMeta(next.meta);
  }, [enabled, initialState, mode, resolvedStorageKey, version]);

  const clearState = useCallback(() => {
    const storage = getStorage(mode);
    storage?.removeItem(resolvedStorageKey);
    setState(initialStateRef.current);
    setRestoreMeta({ restored: false, savedAt: null });
  }, [mode, resolvedStorageKey]);

  const updateState = useCallback((next: StateUpdater<T>) => {
    setState((previous) =>
      typeof next === 'function' ? (next as (current: T) => T)(previous) : next,
    );
  }, []);

  return {
    state,
    setState: updateState,
    clearState,
    restoreMeta,
  };
}

export function useSeedRouteSearch<T extends { search: string }>({
  initialSearch,
  setState,
}: {
  initialSearch?: string;
  setState: (next: T | ((previous: T) => T)) => void;
}) {
  useEffect(() => {
    if (typeof initialSearch !== 'string') return;

    setState((current) => (
      current.search === initialSearch
        ? current
        : { ...current, search: initialSearch }
    ));
  }, [initialSearch, setState]);
}

export function useRouteScrollRestoration({
  storageKey,
  enabled = true,
  ready = true,
  scopeKey,
  pathnameOverride,
}: {
  storageKey: string;
  enabled?: boolean;
  ready?: boolean;
  scopeKey?: string;
  /** See `useRouteSnapshot`'s `pathnameOverride` — same fix, same reason:
   * without it, scroll position resets whenever a still-mounted list's
   * pathname changes (e.g. opening the split-pane detail view). */
  pathnameOverride?: string;
}) {
  const livePathname = usePathname();
  const pathname = pathnameOverride ?? livePathname;
  const scrollContext = useBuyerScrollRoot();
  const scrollRoot = scrollContext?.scrollRoot ?? null;
  const resolvedStorageKey = useMemo(
    () => buildStorageKey(ROUTE_SCROLL_PREFIX, storageKey, pathname, scopeKey),
    [pathname, scopeKey, storageKey],
  );
  const restoredRef = useRef(false);

  const readScrollY = useCallback((): number => {
    return scrollRoot?.scrollTop ?? window.scrollY;
  }, [scrollRoot]);

  const writeScrollY = useCallback(
    (scrollY: number) => {
      if (scrollRoot) {
        scrollRoot.scrollTo({ top: scrollY, behavior: 'auto' });
        return;
      }
      window.scrollTo({ top: scrollY, behavior: 'auto' });
    },
    [scrollRoot],
  );

  useClientLayoutEffect(() => {
    if (!enabled || !ready || restoredRef.current) return;
    const storage = getStorage('session');
    if (!storage) return;

    try {
      const raw = storage.getItem(resolvedStorageKey);
      if (!raw) {
        restoredRef.current = true;
        return;
      }

      const parsed = JSON.parse(raw) as { scrollY?: number };
      restoredRef.current = true;
      requestAnimationFrame(() => {
        writeScrollY(parsed.scrollY ?? 0);
      });
    } catch {
      restoredRef.current = true;
    }
  }, [enabled, ready, resolvedStorageKey, writeScrollY]);

  useEffect(() => {
    if (!enabled) return;
    const storage = getStorage('session');
    if (!storage) return;

    let frame = 0;
    const persist = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        try {
          storage.setItem(resolvedStorageKey, JSON.stringify({ scrollY: readScrollY() }));
        } catch {
          // Ignore storage availability issues.
        }
      });
    };

    const flush = () => {
      try {
        storage.setItem(resolvedStorageKey, JSON.stringify({ scrollY: readScrollY() }));
      } catch {
        // Ignore storage availability issues.
      }
    };

    const scrollTarget: HTMLElement | Window = scrollRoot ?? window;
    scrollTarget.addEventListener('scroll', persist, { passive: true });
    window.addEventListener('pagehide', flush);

    return () => {
      scrollTarget.removeEventListener('scroll', persist);
      window.removeEventListener('pagehide', flush);
      flush();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [enabled, resolvedStorageKey, readScrollY, scrollRoot]);
}

export function usePersistedDraftState<T>({
  storageKey,
  initialState,
  version = DEFAULT_VERSION,
}: {
  storageKey: string;
  initialState: T;
  version?: number;
}) {
  return useRouteSnapshot({
    storageKey,
    initialState,
    version,
    mode: 'session',
  });
}
