'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';

export default function CatalogsPage() {
  return (
    <div className="px-8 py-6">
      <SellerTopbar title="Catalogs" subtitle="Publish curated product sets for the right buyer segments at the right time." />
      <FeatureGate flag="CATALOG_PUBLISHING">
        <p className="text-cream-600">Catalog publishing module coming soon.</p>
      </FeatureGate>
      </div>
  );
}
