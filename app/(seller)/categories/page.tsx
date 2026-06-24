import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { CategoriesLandingClient } from '@/components/seller/categories/CategoriesLandingClient';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';
import { resolveSellerLandingPeriod } from '@/lib/server/seller-period';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import type { CategoriesLandingResponse } from '@/hooks/useCategories';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSellerServerTenantId();
  const period = await resolveSellerLandingPeriod(searchParams);
  const { data: initialData, status } = await fetchSellerPageBootstrap<CategoriesLandingResponse>(
    `/api/tenant/categories/landing?period=${period}`,
  );
  if (status === 403) return <FeatureForbiddenPage />;
  return <CategoriesLandingClient initialData={initialData} initialPeriod={period} />;
}
