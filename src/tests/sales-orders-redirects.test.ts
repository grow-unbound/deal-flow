import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config.js';

describe('sales orders redirects', () => {
  it('configures 301 redirects from /orders to /sales-orders', async () => {
    expect(typeof nextConfig.redirects).toBe('function');
    const redirects = await nextConfig.redirects();
    expect(redirects).toEqual(
      expect.arrayContaining([
        { source: '/orders', destination: '/sales-orders', permanent: true },
        { source: '/orders/:id', destination: '/sales-orders/:id', permanent: true },
      ])
    );
  });
});
