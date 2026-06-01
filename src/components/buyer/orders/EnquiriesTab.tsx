'use client';

import * as React from 'react';
import { FileText } from 'lucide-react';
import { EnquiryCard } from './EnquiryCard';
import { OrderRowSkeleton } from './OrderRowSkeleton';
import type { EstimateSummary } from './EnquiryCard';

interface EstimatesApiResponse {
  estimates: EstimateSummary[];
}

function EmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '40vh',
        padding: '40px 16px',
        textAlign: 'center',
      }}
    >
      <FileText size={48} strokeWidth={1.5} style={{ marginBottom: 16, color: 'var(--fg-3)' }} />
      <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg-1)', margin: '0 0 6px' }}>No enquiries yet</p>
      <p style={{ fontSize: 13, color: 'var(--fg-3)', margin: 0 }}>Submitted quotes will appear here.</p>
    </div>
  );
}

export function EnquiriesTab() {
  const [estimates, setEstimates] = React.useState<EstimateSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchEstimates() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/buyer/estimates');
        if (!res.ok) {
          // Graceful: treat 404/errors as empty list
          if (!cancelled) {
            setEstimates([]);
          }
          return;
        }
        const data = await res.json() as EstimatesApiResponse;
        if (!cancelled) {
          setEstimates(data.estimates ?? []);
        }
      } catch {
        // Gracefully show empty on any error
        if (!cancelled) {
          setEstimates([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchEstimates();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <OrderRowSkeleton count={3} />;
  }

  if (error) {
    return <EmptyState />;
  }

  if (estimates.length === 0) {
    return <EmptyState />;
  }

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {estimates.map((est) => (
        <EnquiryCard key={est.id} estimate={est} />
      ))}
    </div>
  );
}
