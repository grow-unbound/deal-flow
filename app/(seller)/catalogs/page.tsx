'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';

export default function CatalogsPage() {
  return (
    <>
      <SellerTopbar title="Catalogs" />
      <div style={{ paddingTop: 'calc(var(--topbar-h) + 24px)' }}>
        <FeatureGate flag="CATALOG_PUBLISHING">
          <div className="px-8 py-6">
            <p className="text-cream-600">Catalog publishing module coming soon.</p>
          </div>
        </FeatureGate>
      </div>
    </>
  );
}
