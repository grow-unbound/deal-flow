import { describe, expect, it } from 'vitest';
import { buildStorefrontManifest } from '@/lib/server/storefront-manifest';

describe('buildStorefrontManifest', () => {
  it('returns installable tenant manifest with tenant name and Yukti icons', () => {
    const manifest = buildStorefrontManifest(
      { businessName: 'WineYard Technologies', tagline: 'CCTV for every retailer' },
      { installable: true },
    );

    expect(manifest.name).toBe('WineYard Technologies');
    expect(manifest.short_name).toBe('WineYard Te…');
    expect(manifest.description).toBe('CCTV for every retailer');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons?.every((icon) => icon.src.startsWith('/brand/'))).toBe(true);
    expect(manifest.icons?.some((icon) => icon.src.includes('logo'))).toBe(false);
  });

  it('falls back to default description when tagline is empty', () => {
    const manifest = buildStorefrontManifest(
      { businessName: 'Acme', tagline: null },
      { installable: true },
    );
    expect(manifest.description).toContain('Order from your distributor');
  });

  it('returns non-installable Yukti stub for seller hosts', () => {
    const manifest = buildStorefrontManifest(null, { installable: false });
    expect(manifest.name).toBe('Yukti');
    expect(manifest.display).toBe('browser');
  });
});
