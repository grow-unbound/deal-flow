'use client';

import { FeatureGate } from '@/components/FeatureGate';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { CatalogComposer } from '@/components/seller/catalogs/CatalogComposer';
import { ROLES } from '@/constants';

export default function NewCatalogPage() {
  return (
    <FeatureGate flag="CATALOG_PUBLISHING">
      <RoleGuard roles={[ROLES.SELLER_ADMIN]}>
        <CatalogComposer mode="create" />
      </RoleGuard>
    </FeatureGate>
  );
}
