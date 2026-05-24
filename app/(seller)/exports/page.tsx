'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';

export default function ExportsPage() {
  return (
    <>
      <SellerTopbar title="Exports" />
      <div style={{ paddingTop: 'calc(var(--topbar-h) + 24px)' }}>
        <FeatureGate flag="TALLY_EXPORT">
          <div className="px-8 py-6">
            <p className="text-cream-600">Tally CSV export module coming soon.</p>
          </div>
        </FeatureGate>
      </div>
    </>
  );
}
