'use client';

import { TenantLogo } from '@/components/brand/TenantLogo';
import { PoweredByYukti } from '@/components/brand/PoweredByYukti';
import type { CatalogTenantContext } from '@/hooks/useCatalogTenantContext';

const TENANT_LOGO_SIZE = 72;

export type CatalogBuyerAuthHeroVariant = 'login' | 'verify' | 'pending';

interface CatalogBuyerAuthHeroProps {
  variant: CatalogBuyerAuthHeroVariant;
  tenant: CatalogTenantContext | null;
  tenantLoading?: boolean;
}

function TenantHeroSkeleton() {
  return (
    <div className="mb-6 rounded-xl border border-cream-200 bg-cream-50 px-5 py-5">
      <div className="flex items-center gap-4">
        <div className="h-[72px] w-[72px] shrink-0 animate-pulse rounded-full bg-cream-100 border border-cream-200" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-6 w-40 animate-pulse rounded bg-cream-100 border border-cream-200" />
          <div className="h-3 w-28 animate-pulse rounded bg-cream-100 border border-cream-200" />
        </div>
      </div>
    </div>
  );
}

function TenantBrandingCard({ tenant }: { tenant: CatalogTenantContext }) {
  return (
    <div className="mb-6 rounded-xl border border-cream-200 bg-cream-50 px-5 py-5">
      <div className="flex items-center gap-4">
        <TenantLogo
          name={tenant.businessName}
          logoUrl={tenant.logoUrl}
          size={TENANT_LOGO_SIZE}
          className="shrink-0"
        />
        <div className="min-w-0 text-left">
          <p className="truncate font-display text-h3 text-cream-900">{tenant.businessName}</p>
          <PoweredByYukti className="mt-1 justify-start" />
        </div>
      </div>
    </div>
  );
}

export function CatalogBuyerAuthHero({
  variant,
  tenant,
  tenantLoading = false,
}: CatalogBuyerAuthHeroProps) {
  if (tenantLoading) {
    return <TenantHeroSkeleton />;
  }

  if (tenant) {
    return (
      <>
        <TenantBrandingCard tenant={tenant} />
        <h1 className="mb-2 font-display text-h2 text-cream-900">
          {variant === 'login'
            ? `Login to explore catalog`
            : variant === 'verify'
              ? 'Enter OTP to start shopping'
              : 'Request sent'}
        </h1>
        <p className="mb-6 text-body-sm text-cream-600">
          {variant === 'login'
            ? `Browse catalog, place orders, and track your invoices with ${tenant.businessName}`
            : variant === 'verify'
              ? 'We sent a 6-digit code to your WhatsApp.'
              : `${tenant.businessName} needs to approve your access before you can view pricing or place orders.`}
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-2 font-display text-h2 text-cream-900">
        {variant === 'login'
          ? 'Find your sellers on Yukti'
          : variant === 'verify'
            ? 'Enter OTP to start shopping'
            : 'Request sent'}
      </h1>
      <p className="mb-6 text-body-sm text-cream-600">
        {variant === 'login'
          ? 'Login to see your distributors and wholesalers hosted on Yukti, all in one place.'
          : variant === 'verify'
            ? 'We sent a 6-digit code to your WhatsApp.'
            : 'The seller needs to approve your access before you can view pricing or place orders.'}
      </p>
    </>
  );
}
