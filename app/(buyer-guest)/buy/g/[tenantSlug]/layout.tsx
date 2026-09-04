import { ReactNode, Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { BuyerShell } from '@/components/layout/BuyerShell';
import { BuyerServiceWorkerRegistration } from '@/components/buyer/layout/BuyerServiceWorkerRegistration';
import { BuyerCartProvider } from '@/contexts/BuyerCartContext';
import { BuyerDeliveryProvider } from '@/contexts/BuyerDeliveryContext';
import { StorefrontLoginProvider } from '@/contexts/StorefrontLoginContext';
import {
  buildStorefrontLayoutMetadata,
  buildStorefrontLayoutViewport,
  loadStorefrontBrandingContextForSlug,
} from '@/lib/server/storefront-metadata';

const BASE_VIEWPORT: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-visual',
};

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ tenantSlug: string }>;
};

// Required for ISR on a dynamic segment: without a generateStaticParams
// export (even an empty list), Next.js never registers this segment as
// ISR-eligible at all — `revalidate`/`dynamicParams` alone are a no-op and
// the route silently falls back to full per-request dynamic rendering.
export async function generateStaticParams() {
  return [];
}
export const dynamicParams = true;

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const ctx = await loadStorefrontBrandingContextForSlug(tenantSlug);
  return buildStorefrontLayoutMetadata(ctx);
}

export async function generateViewport({ params }: LayoutProps): Promise<Viewport> {
  const { tenantSlug } = await params;
  const ctx = await loadStorefrontBrandingContextForSlug(tenantSlug);
  return { ...BASE_VIEWPORT, ...buildStorefrontLayoutViewport(ctx) };
}

/**
 * Guest-only ISR tree (plan #4). No `cookies()`/`headers()` anywhere in this
 * subtree, by design — that's what makes it eligible for Next's Full Route
 * Cache / ISR instead of the per-request dynamic rendering the authenticated
 * `app/(buyer)` tree uses. `tenantSlug` always equals the Host-resolved
 * tenant slug — captured by the `has: [{ type: 'host', ... }]` rewrite rules
 * in next.config.js's `rewrites().afterFiles`, which is the only way this
 * internal path is ever reached (middleware passes guest-ISR-eligible
 * requests through unmodified — see middleware.ts's guest-ISR branch — and a
 * direct hit on this internal path 301s back to the public URL instead of
 * rendering, see toPublicStorefrontPath in storefront-paths.ts). Delivery-location personalization is resolved
 * client-side by BuyerDeliveryProvider from its own cookie/localStorage read
 * on mount, not server-side here — it's the one piece of client-only state
 * this shell doesn't try to pre-hydrate.
 *
 * BuyerShell itself calls useSearchParams() internally — harmless on the
 * always-dynamic app/(buyer) layout (useSearchParams()'s static-render
 * bailout only triggers during an actual static/ISR render attempt, which
 * never happened there), but fatal here without a Suspense boundary, since
 * this layout is the first place in the app that statically/ISR-renders
 * anything wrapping it.
 */
export default async function BuyerGuestLayout({ children }: LayoutProps) {
  return (
    <ThemeProvider surface="buyer">
      <BuyerServiceWorkerRegistration />
      <BuyerCartProvider>
        <BuyerDeliveryProvider initialPayload={null}>
          <StorefrontLoginProvider>
            <Suspense fallback={null}>
              <BuyerShell>{children}</BuyerShell>
            </Suspense>
          </StorefrontLoginProvider>
        </BuyerDeliveryProvider>
      </BuyerCartProvider>
    </ThemeProvider>
  );
}
