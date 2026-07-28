import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('triggerHaptic', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('does not vibrate before a trusted user gesture', async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vibrate,
    });

    const { triggerHaptic } = await import('@/lib/haptics');

    triggerHaptic('light');

    expect(vibrate).not.toHaveBeenCalled();
  });

  it('vibrates after a user gesture', async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vibrate,
    });

    const { triggerHaptic } = await import('@/lib/haptics');

    window.dispatchEvent(new PointerEvent('pointerdown'));
    triggerHaptic('medium');

    expect(vibrate).toHaveBeenCalledWith(20);
  });
});
