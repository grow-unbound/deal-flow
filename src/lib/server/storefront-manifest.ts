import type { MetadataRoute } from 'next';

export const YUKTI_PWA_THEME_COLOR = '#B5642F';
export const YUKTI_PWA_BACKGROUND_COLOR = '#F3EEE6';
export const YUKTI_PWA_DESCRIPTION =
  'Order from your distributor — browse catalogs, place orders, track invoices.';

export const YUKTI_MANIFEST_ICONS: MetadataRoute.Manifest['icons'] = [
  {
    src: '/brand/app-icon-copper.svg',
    sizes: 'any',
    type: 'image/svg+xml',
    purpose: 'any',
  },
  {
    src: '/brand/app-icon-copper.svg',
    sizes: 'any',
    type: 'image/svg+xml',
    purpose: 'maskable',
  },
];

export interface StorefrontManifestBranding {
  businessName: string;
  tagline: string | null;
}

function truncateShortName(name: string, max = 12): string {
  const trimmed = name.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/** Tenant storefront hosts get installable PWAs; seller/catalog hosts get a non-installable Yukti stub. */
export function buildStorefrontManifest(
  branding: StorefrontManifestBranding | null,
  options: { installable: boolean },
): MetadataRoute.Manifest {
  if (!branding || !options.installable) {
    return {
      name: 'Yukti',
      short_name: 'Yukti',
      description: YUKTI_PWA_DESCRIPTION,
      start_url: '/',
      scope: '/',
      display: 'browser',
      background_color: YUKTI_PWA_BACKGROUND_COLOR,
      theme_color: YUKTI_PWA_THEME_COLOR,
      icons: YUKTI_MANIFEST_ICONS,
    };
  }

  const description = branding.tagline?.trim() || YUKTI_PWA_DESCRIPTION;

  return {
    name: branding.businessName,
    short_name: truncateShortName(branding.businessName),
    description,
    start_url: '/',
    scope: '/',
    id: '/',
    display: 'standalone',
    background_color: YUKTI_PWA_BACKGROUND_COLOR,
    theme_color: YUKTI_PWA_THEME_COLOR,
    icons: YUKTI_MANIFEST_ICONS,
  };
}
