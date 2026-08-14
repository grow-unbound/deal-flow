import { useSyncExternalStore } from 'react';

/**
 * Bridges CatalogFilteredBrowse's left-rail category/brand switch (which updates the URL via
 * raw `history.replaceState` to avoid a full Next router round-trip) to `usePathname()`
 * consumers like BuyerDesktopBreadcrumbs, which otherwise never see the change.
 */
let overridePath: string | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function setBuyerRailPathname(path: string | null): void {
  overridePath = path;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): string | null {
  return overridePath;
}

function getServerSnapshot(): string | null {
  return null;
}

/** Returns the rail's overridden pathname if one is active, else the real routed pathname. */
export function useBuyerEffectivePathname(routedPathname: string): string {
  const override = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return override ?? routedPathname;
}
