import { FeatureGate } from '@/components/FeatureGate';
import { CohortDetailPage } from '@/components/seller/cohorts/detail';

export default async function CohortDetailsRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <FeatureGate flag="COHORTS">
      <CohortDetailPage id={id} />
    </FeatureGate>
  );
}
