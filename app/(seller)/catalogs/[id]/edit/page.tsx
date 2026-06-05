'use client';

import { useParams } from 'next/navigation';
import { FeatureGate } from '@/components/FeatureGate';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { CatalogComposer } from '@/components/seller/catalogs/CatalogComposer';
import { ROLES } from '@/constants';

export default function EditCatalogPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <FeatureGate flag="CATALOG_PUBLISHING">
      <RoleGuard roles={[ROLES.SELLER_ADMIN]}>
        <CatalogComposer mode="edit" catalogId={id} />
      </RoleGuard>
    </FeatureGate>
  );
}
