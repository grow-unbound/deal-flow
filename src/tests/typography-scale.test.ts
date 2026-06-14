import { describe, expect, it } from 'vitest';

import { fontSize } from '@/lib/theme/tokens';

describe('typography variable scale', () => {
  it('maps core sizes to the yk text scale variables', () => {
    expect(fontSize.xs[0]).toBe('var(--yk-text-xs)');
    expect(fontSize.sm[0]).toBe('var(--yk-text-sm)');
    expect(fontSize.base[0]).toBe('var(--yk-text-base)');
    expect(fontSize.md[0]).toBe('var(--yk-text-md)');
    expect(fontSize.lg[0]).toBe('var(--yk-text-lg)');
    expect(fontSize.xl[0]).toBe('var(--yk-text-xl)');
    expect(fontSize['2xl'][0]).toBe('var(--yk-text-2xl)');
    expect(fontSize['3xl'][0]).toBe('var(--yk-text-3xl)');
  });

  it('keeps semantic aliases wired to the same variable scale', () => {
    expect(fontSize.body[0]).toBe('var(--yk-text-md)');
    expect(fontSize['body-sm'][0]).toBe('var(--yk-text-base)');
    expect(fontSize.caption[0]).toBe('var(--yk-text-sm)');
    expect(fontSize.eyebrow[0]).toBe('var(--yk-text-xs)');
    expect(fontSize['display-md'][0]).toBe('var(--yk-text-3xl)');
    expect(fontSize['display-sm'][0]).toBe('var(--yk-text-2xl)');
  });
});
