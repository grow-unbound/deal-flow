/** Client-only: whether this browser has completed a Yukti login at least once. */
export const DEVICE_HAS_LOGGED_IN_KEY = 'yukti_device_has_logged_in';

export function hasLoggedInOnDevice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DEVICE_HAS_LOGGED_IN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markLoggedInOnDevice(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEVICE_HAS_LOGGED_IN_KEY, '1');
  } catch {
    // localStorage may be unavailable (private mode / blocked storage)
  }
}
