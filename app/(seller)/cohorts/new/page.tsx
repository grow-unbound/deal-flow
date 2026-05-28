'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { CohortForm } from '@/components/seller/cohorts/CohortForm';
import { ROLES } from '@/constants';

export default function NewCohortPage() {
  return (
    <div className="px-8 py-6">
      <SellerTopbar title="Create Cohort" />
      <FeatureGate flag="COHORTS">
        <RoleGuard roles={[ROLES.SELLER_ADMIN]}>
          <CohortForm mode="create" />
        </RoleGuard>
      </FeatureGate>
    </div>
  );
}
