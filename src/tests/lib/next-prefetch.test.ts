import { describe, expect, it } from 'vitest';
import { isNextPrefetchRequest } from '@/lib/next-prefetch';

const h = (init: Record<string, string>) => new Headers(init);

describe('isNextPrefetchRequest', () => {
  it('detects Next router prefetches', () => {
    expect(isNextPrefetchRequest(h({ 'next-router-prefetch': '1' }))).toBe(true);
    expect(isNextPrefetchRequest(h({ purpose: 'prefetch' }))).toBe(true);
    expect(isNextPrefetchRequest(h({ 'sec-purpose': 'prefetch;anonymous-client-ip' }))).toBe(true);
  });

  it('does not treat real navigations or RSC page transitions as prefetch', () => {
    expect(isNextPrefetchRequest(h({}))).toBe(false);
    expect(isNextPrefetchRequest(h({ rsc: '1' }))).toBe(false);
    expect(isNextPrefetchRequest(h({ 'next-router-prefetch': '0' }))).toBe(false);
    expect(isNextPrefetchRequest(h({ 'sec-fetch-dest': 'document' }))).toBe(false);
  });
});
