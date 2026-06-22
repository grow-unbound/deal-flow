import { BuyerAmount, BuyerDate, BuyerDocumentStat, BuyerSimpleDocumentDetail } from '@/components/buyer/documents/BuyerSimpleDocumentDetail';

interface BuyerEstimate {
  id: string;
  estimate_number: string | null;
  status: string;
  total_amount: number;
  created_at: string;
  notes: string | null;
}

export default async function BuyerEstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <BuyerSimpleDocumentDetail<BuyerEstimate>
      id={id}
      title="Estimate"
      endpoint="/api/buyer/estimates?limit=200"
      pickRows={(payload) => payload.estimates ?? []}
      match={(row) => row.id === id}
      render={(estimate) => (
        <div className="space-y-3">
          <BuyerDocumentStat
            label="Estimate number"
            value={estimate.estimate_number ?? estimate.id.slice(0, 8).toUpperCase()}
            sub={estimate.notes ?? `Created ${BuyerDate(estimate.created_at)}`}
          />
          <div className="grid grid-cols-2 gap-3">
            <BuyerDocumentStat label="Amount" value={BuyerAmount(estimate.total_amount)} sub={`Created ${BuyerDate(estimate.created_at)}`} />
            <BuyerDocumentStat label="Status" value={estimate.status} sub="Estimate" />
          </div>
        </div>
      )}
    />
  );
}
