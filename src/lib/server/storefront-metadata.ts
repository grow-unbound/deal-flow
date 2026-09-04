import { cache } from 'react';
import { headers } from 'next/headers';
import type { Metadata, Viewport } from 'next';
import { parseRequestHost } from '@/lib/storefront-host';
import { getCachedTenantBrandingBySlug } from '@/lib/server/tenant-branding';
import {
  YUKTI_MANIFEST_ICONS,
  YUKTI_PWA_BACKGROUND_COLOR,
  YUKTI_PWA_THEME_COLOR,
} from '@/lib/server/storefront-manifest';
import {
  storefrontDefaultTitle,
  type StorefrontBrandingContext,
} from '@/lib/storefront-title';

export type { StorefrontBrandingContext };
export { storefrontDefaultTitle };

const YUKTI_FAVICON = '/brand/favicon.svg';
const YUKTI_APPLE_ICON = '/brand/app-icon-light.svg';

export const loadStorefrontBrandingContext = cache(async (): Promise<StorefrontBrandingContext> => {
  const headerStore = await headers();
  const host = headerStore.get('host') ?? '';
  const hostKind = parseRequestHost(host);
  const slug = headerStore.get('x-verified-tenant-slug')
    ?? (hostKind.kind === 'tenant' ? hostKind.slug : null);

  if (!slug) {
    return {
      isTenantHost: false,
      businessName: null,
      tagline: null,
      logoUrl: null,
    };
  }

  const branding = await getCachedTenantBrandingBySlug(slug);
  if (!branding) {
    return {
      isTenantHost: hostKind.kind === 'tenant',
      businessName: null,
      tagline: null,
      logoUrl: null,
    };
  }

  return {
    isTenantHost: hostKind.kind === 'tenant',
    businessName: branding.businessName,
    tagline: branding.tagline,
    logoUrl: branding.logoUrl,
  };
});

export function buildStorefrontLayoutMetadata(ctx: StorefrontBrandingContext): Metadata {
  const title = storefrontDefaultTitle(ctx);
  const tabIcon = ctx.logoUrl ?? YUKTI_FAVICON;

  if (!ctx.isTenantHost) {
    return {
      title: { absolute: title },
      manifest: '/manifest.webmanifest',
    };
  }

  return {
    title: { absolute: title },
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [{ url: tabIcon, type: 'image/svg+xml' }],
      shortcut: tabIcon,
      apple: YUKTI_APPLE_ICON,
    },
    appleWebApp: {
      capable: true,
      title: ctx.businessName ?? 'Yukti',
      statusBarStyle: 'default',
    },
    other: {
      'mobile-web-app-capable': 'yes',
    },
  };
}

/** themeColor lives on the viewport export, not metadata — see generateViewport in app/(buyer)/layout.tsx. */
export function buildStorefrontLayoutViewport(ctx: StorefrontBrandingContext): Pick<Viewport, 'themeColor'> {
  return ctx.isTenantHost ? { themeColor: YUKTI_PWA_THEME_COLOR } : {};
}

export function storefrontPageTitle(pageTitle: string): Metadata {
  return { title: { absolute: pageTitle } };
}

export { YUKTI_FAVICON, YUKTI_APPLE_ICON, YUKTI_MANIFEST_ICONS, YUKTI_PWA_BACKGROUND_COLOR, YUKTI_PWA_THEME_COLOR };
