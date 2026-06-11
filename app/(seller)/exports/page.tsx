import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { PageWrap } from '@/components/seller/layout';
import { getFlag, FLAGS } from '@/lib/flags';

export default async function ExportsPage() {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

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
