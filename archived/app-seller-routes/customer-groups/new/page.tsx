import { FeatureGate } from '@/components/FeatureGate';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { CohortComposer } from '@/components/seller/cohorts/CohortComposer';
import { ROLES } from '@/constants';

export default function NewCohortPage() {
  return (
    <FeatureGate flag="COHORTS">
      <RoleGuard roles={[ROLES.SELLER_ADMIN]}>
        <CohortComposer mode="create" />
      </RoleGuard>
    </FeatureGate>
  );
}
