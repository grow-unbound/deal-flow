'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { parseRequestHost } from '@/lib/storefront-host';

function detectCatalogHost(): boolean {
  if (typeof window === 'undefined') return false;
  const hostKind = parseRequestHost(window.location.hostname);
  return hostKind.kind === 'reserved' && hostKind.label === 'catalog';
}

export interface CatalogTenantContext {
  businessName: string;
  logoUrl: string | null;
}

export interface UseCatalogTenantContextResult {
  isCatalogHost: boolean;
  returnTo: string | null;
  tenant: CatalogTenantContext | null;
  /** True when `return_to` resolved to tenant branding (redirected-from-tenant state). */
  hasTenantContext: boolean;
  tenantLoading: boolean;
}

export function useCatalogTenantContext(): UseCatalogTenantContextResult {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('return_to');
  const [isCatalogHost] = useState(detectCatalogHost);
  const [tenant, setTenant] = useState<CatalogTenantContext | null>(null);
  const [tenantLoading, setTenantLoading] = useState(Boolean(returnTo));

  useEffect(() => {
    if (!returnTo) {
      setTenant(null);
      setTenantLoading(false);
      return;
    }

    let cancelled = false;
    setTenantLoading(true);

    try {
      const slug = new URL(returnTo).hostname.split('.')[0];
      if (!slug) {
        setTenant(null);
        setTenantLoading(false);
        return;
      }

      fetch(`/api/public/tenant-branding?slug=${encodeURIComponent(slug)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled) return;
          if (data?.business_name) {
            setTenant({
              businessName: data.business_name as string,
              logoUrl: (data.logo_url as string | null) ?? null,
            });
          } else {
            setTenant(null);
          }
        })
        .catch(() => {
          if (!cancelled) setTenant(null);
        })
        .finally(() => {
          if (!cancelled) setTenantLoading(false);
        });
    } catch {
      setTenant(null);
      setTenantLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [returnTo]);

  return {
    isCatalogHost,
    returnTo,
    tenant,
    hasTenantContext: Boolean(tenant),
    tenantLoading,
  };
}
