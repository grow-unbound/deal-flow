import { ReactNode } from 'react';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { BuyerShell } from '@/components/layout/BuyerShell';
import { BuyerServiceWorkerRegistration } from '@/components/buyer/layout/BuyerServiceWorkerRegistration';
import { BuyerCartProvider } from '@/contexts/BuyerCartContext';
import { BuyerDeliveryProvider } from '@/contexts/BuyerDeliveryContext';
import { StorefrontLoginProvider } from '@/contexts/StorefrontLoginContext';
import { DELIVERY_COOKIE_NAME } from '@/lib/buyer-delivery-location';
import {
  buildStorefrontLayoutMetadata,
  buildStorefrontLayoutViewport,
  loadStorefrontBrandingContext,
} from '@/lib/server/storefront-metadata';

import type { Viewport } from 'next';

const BASE_VIEWPORT: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-visual',
};

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await loadStorefrontBrandingContext();
  return buildStorefrontLayoutMetadata(ctx);
}

export async function generateViewport(): Promise<Viewport> {
  const ctx = await loadStorefrontBrandingContext();
  return { ...BASE_VIEWPORT, ...buildStorefrontLayoutViewport(ctx) };
}

export default async function BuyerLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const initialDeliveryCookie = cookieStore.get(DELIVERY_COOKIE_NAME)?.value ?? null;

  return (
    <ThemeProvider surface="buyer">
      <BuyerServiceWorkerRegistration />
      <BuyerCartProvider>
        <BuyerDeliveryProvider initialPayload={initialDeliveryCookie}>
          <StorefrontLoginProvider>
            <BuyerShell>{children}</BuyerShell>
          </StorefrontLoginProvider>
        </BuyerDeliveryProvider>
      </BuyerCartProvider>
    </ThemeProvider>
  );
}
