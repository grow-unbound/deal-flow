export type HapticStyle = 'light' | 'medium' | 'heavy';

const DURATION_MS: Record<HapticStyle, number> = {
  light: 10,
  medium: 20,
  heavy: 40,
};

let hasUserGesture = false;
let listenersInstalled = false;

function markUserGesture(event: Event): void {
  if (process.env.NODE_ENV !== 'test' && 'isTrusted' in event && event.isTrusted === false) return;
  hasUserGesture = true;
}

function installGestureListeners(): void {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;

  window.addEventListener('pointerdown', markUserGesture, { capture: true, passive: true });
  window.addEventListener('touchstart', markUserGesture, { capture: true, passive: true });
  window.addEventListener('keydown', markUserGesture, { capture: true, passive: true });
}

/**
 * Best-effort tactile feedback on supported mobile browsers.
 * No-op on desktop / unsupported environments.
 */
export function triggerHaptic(style: HapticStyle = 'light'): void {
  installGestureListeners();
  if (!hasUserGesture) return;

  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return;
  }
  try {
    navigator.vibrate(DURATION_MS[style]);
  } catch {
    // ignore — some browsers throw if vibrate is disabled
  }
}

installGestureListeners();
