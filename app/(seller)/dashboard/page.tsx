import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { DashboardOnboardingBanner } from '@/components/seller/dashboard/DashboardOnboardingBanner';
import { SellerDashboardClient } from '@/components/seller/dashboard/SellerDashboardClient';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import type { SellerDashboardResponse } from '@/types/seller-dashboard';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  const period = await resolveSellerLandingPeriod(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<SellerDashboardResponse>(
    `/api/tenant/dashboard?period=${period}`,
  );

  if (status === 403) {
    return <FeatureForbiddenPage />;
  }

  return (
    <>
      <DashboardOnboardingBanner tenantId={tenantId} />
      <SellerDashboardClient initialData={initialData} initialPeriod={period} />
    </>
  );
}
