import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { PageWrap } from '@/components/seller/layout';
import { getFlag, FLAGS } from '@/lib/flags';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.exports);

export default async function ExportsPage() {
  const tenantId = await requireSellerServerTenantId();

  if (!(await getFlag(FLAGS.TALLY_EXPORT, tenantId))) return <FeatureForbiddenPage />;

  return (
    <PageWrap>
      <SellerTopbar
        title="Exports"
        subtitle="Prepare accounting-friendly exports for downstream ERP and Tally workflows."
      />
      <p className="text-cream-600">Tally CSV export module coming soon.</p>
    </PageWrap>
  );
}
