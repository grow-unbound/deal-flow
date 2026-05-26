'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { CohortForm } from '@/components/seller/cohorts/CohortForm';
import { ROLES } from '@/constants';

export default function NewCohortPage() {
  return (
    <>
      <SellerTopbar title="Create Cohort" />
      <div style={{ paddingTop: 'calc(var(--topbar-h) + 24px)' }}>
        <FeatureGate flag="COHORTS">
          <RoleGuard roles={[ROLES.SELLER_ADMIN]}>
            <div className="px-8 py-6">
              <CohortForm mode="create" />
            </div>
          </RoleGuard>
        </FeatureGate>
      </div>
    </>
  );
}
