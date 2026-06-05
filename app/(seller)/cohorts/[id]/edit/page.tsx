'use client';

import { use } from 'react';
import { FeatureGate } from '@/components/FeatureGate';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { CohortComposer } from '@/components/seller/cohorts/CohortComposer';
import { ROLES } from '@/constants';

export default function EditCohortPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <FeatureGate flag="COHORTS">
      <RoleGuard roles={[ROLES.SELLER_ADMIN]}>
        <CohortComposer mode="edit" cohortId={id} />
      </RoleGuard>
    </FeatureGate>
  );
}
