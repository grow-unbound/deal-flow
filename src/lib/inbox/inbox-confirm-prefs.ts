function storageKey(tenantId: string, action: string): string {
  return `inbox-skip-confirm:${tenantId}:${action}`;
}

export function shouldSkipConfirm(tenantId: string, action: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(storageKey(tenantId, action)) === '1';
  } catch {
    return false;
  }
}

export function setSkipConfirm(tenantId: string, action: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(tenantId, action), '1');
  } catch {
    // Storage unavailable (private browsing, quota) — confirmation just keeps showing.
  }
}
