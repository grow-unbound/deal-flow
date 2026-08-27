import bundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Seller layouts (app/(seller)/<entity>/layout.tsx) call headers() via
    // requireSellerServerTenantId(), making them dynamic. Next's default
    // dynamic staleTime is 0, so every client navigation between /<entity>
    // and /<entity>/[id] refetches+remounts the whole layout subtree —
    // including the list component — wiping its local search/filter state
    // even though the URL only changed a leaf segment. Middleware already
    // gates auth on every request (see middleware.ts x-verified-* headers),
    // so caching this dynamic render client-side for a short window doesn't
    // weaken the auth check — it only avoids remounting on same-layout nav.
    staleTimes: {
      dynamic: 30,
    },
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-tooltip',
    ],
  },
  // Required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: 'assets.yukti.so',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID: process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID,
    NEXT_PUBLIC_ZOHO_DOMAIN: process.env.NEXT_PUBLIC_ZOHO_DOMAIN,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
  // Static header list — evaluated once by Next/Vercel's edge, not per-request app
  // code, so this adds no runtime auth/DB cost. CSP is intentionally permissive on
  // script/style (Next.js hydration + Tailwind/shadcn inline styles need
  // 'unsafe-inline'; 'unsafe-eval' only matters in dev) rather than risk breaking
  // the app — connect-src allowlists Supabase, PostHog (proxied via /ingest, plus
  // the direct ingest hosts as a fallback), Google Maps, and Cloudflare R2.
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://assets.yukti.so https://maps.gstatic.com https://maps.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://us.i.posthog.com https://us-assets.i.posthog.com https://maps.googleapis.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
      "frame-src 'self' https://www.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: '/orders', destination: '/sales-orders', permanent: true },
      { source: '/orders/:id', destination: '/sales-orders/:id', permanent: true },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/array/:path*',
        destination: 'https://us-assets.i.posthog.com/array/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
    ];
  },
};

// A copy-pasted-but-unfilled .env.local (still holding the literal
// placeholder from .env.example) must not attempt a source map upload or
// release creation — the Sentry CLI would hit the API with a bogus token
// and fail loudly (401) on every local build. `sourcemaps.disable` and
// `release.create: false` are the plugin's own documented switches for
// this — more reliable than trying to unset SENTRY_AUTH_TOKEN from within
// next.config.js, since Next spawns separate workers per build target
// (Node.js/Edge/Client) and each independently re-reads the OS env rather
// than inheriting this module's in-memory mutations.
if (process.env.SENTRY_AUTH_TOKEN === 'your_sentry_auth_token_here') {
  delete process.env.SENTRY_AUTH_TOKEN;
}
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN || undefined;

export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: sentryAuthToken,
  // Only upload source maps / create a release when a real token is present
  // (Vercel prod/preview) — keeps local `npm run build` unaffected.
  silent: !sentryAuthToken,
  sourcemaps: { disable: !sentryAuthToken },
  release: { create: !!sentryAuthToken, finalize: !!sentryAuthToken },
  // Default (false) — only uploads source maps for chunks actually referenced
  // by build output, not every emitted file. `true` widens the scan to catch
  // dynamically-loaded chunks Sentry's plugin might otherwise miss, at the
  // cost of scanning/uploading far more files. This app has no such edge
  // case, so leave it narrow — it's the difference between uploading dozens
  // of chunks vs. every .js.map in the output tree.
  widenClientFileUpload: false,
  // No Vercel Cron routes in this repo — automaticVercelMonitors would just
  // be an unused Sentry API call at build time for zero benefit.
  webpack: {
    treeshake: { removeDebugLogging: true },
  },
});
