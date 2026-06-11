'use client';

import * as React from 'react';
import { FileText } from 'lucide-react';

import { BuyerEmptyState } from '@/components/buyer/BuyerEmptyState';
import { EnquiryCard } from './EnquiryCard';
import { OrderRowSkeleton } from './OrderRowSkeleton';
import { ErrorState } from '@/components/ui/empty-state';
import type { EstimateSummary } from './EnquiryCard';

interface EstimatesApiResponse {
  estimates: EstimateSummary[];
}

export function EnquiriesTab() {
  const [estimates, setEstimates] = React.useState<EstimateSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchEstimates = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/buyer/estimates');
      if (!res.ok) {
        setError(res.status === 403 ? 'You do not have access to enquiries.' : 'Could not load enquiries.');
        setEstimates([]);
        return;
      }
      const data = (await res.json()) as EstimatesApiResponse;
      setEstimates(data.estimates ?? []);
    } catch {
      setError('Could not load enquiries.');
      setEstimates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchEstimates();
  }, [fetchEstimates]);

  if (loading) {
    return <OrderRowSkeleton count={3} />;
  }

  if (error) {
    return (
      <div className="px-4 py-4">
        <ErrorState
          heading="Couldn't load enquiries"
          description={error}
          onRetry={() => void fetchEstimates()}
        />
      </div>
    );
  }

  if (estimates.length === 0) {
    return (
      <BuyerEmptyState
        icon={<FileText size={28} strokeWidth={1.5} />}
        heading="No enquiries yet"
        description="Submitted quotes will appear here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {estimates.map((e) => (
        <EnquiryCard key={e.id} estimate={e} />
      ))}
    </div>
  );
}
