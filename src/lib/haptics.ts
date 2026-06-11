export type HapticStyle = 'light' | 'medium' | 'heavy';

const DURATION_MS: Record<HapticStyle, number> = {
  light: 10,
  medium: 20,
  heavy: 40,
};

/**
 * Best-effort tactile feedback on supported mobile browsers.
 * No-op on desktop / unsupported environments.
 */
export function triggerHaptic(style: HapticStyle = 'light'): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return;
  }
  try {
    navigator.vibrate(DURATION_MS[style]);
  } catch {
    // ignore — some browsers throw if vibrate is disabled
  }
}
