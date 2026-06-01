import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { PageWrap } from '@/components/seller/layout';

export default function ExportsPage() {
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
