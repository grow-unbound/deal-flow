const STORAGE_PREFIX = 'yukti_buy_as:';

export function buyAsStorageKey(tenantId: string): string {
  return `${STORAGE_PREFIX}${tenantId}`;
}

export function readStoredBuyAsBuyerId(tenantId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(buyAsStorageKey(tenantId));
  } catch {
    return null;
  }
}

export function writeStoredBuyAsBuyerId(tenantId: string, buyerId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(buyAsStorageKey(tenantId), buyerId);
  } catch {
    // ignore quota / private mode
  }
}
