'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';
import { PageWrap } from '@/components/seller/layout';

export default function ExportsPage() {
  return (
    <PageWrap>
      <SellerTopbar title="Exports" subtitle="Prepare accounting-friendly exports for downstream ERP and Tally workflows." />
      <FeatureGate flag="TALLY_EXPORT">
        <p className="text-cream-600">Tally CSV export module coming soon.</p>
      </FeatureGate>
    </PageWrap>
  );
}
