import type { MetadataRoute } from 'next';

// Buyer PWA only — seller cockpit is desktop-first and doesn't need installability.
// `scope`/`start_url` restrict this manifest to the buyer surface even though the
// manifest file itself is served from the app root (Next.js only resolves one
// manifest.ts per app).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Yukti',
    short_name: 'Yukti',
    description: 'Order from your distributor — browse catalogs, place orders, track invoices.',
    start_url: '/buy/catalog',
    scope: '/buy',
    display: 'standalone',
    background_color: '#F3EEE6',
    theme_color: '#B5642F',
    icons: [
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
    ],
  };
}
