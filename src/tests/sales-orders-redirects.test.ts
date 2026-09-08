import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config.js';

describe('sales orders redirects', () => {
  it('does not configure global /orders redirects because tenant storefront owns /orders', async () => {
    expect(typeof nextConfig.redirects).toBe('function');
    const redirects = await nextConfig.redirects();
    expect(redirects).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: '/orders' }),
        expect.objectContaining({ source: '/orders/:id' }),
      ]),
    );
  });
});
