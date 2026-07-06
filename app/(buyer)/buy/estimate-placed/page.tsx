import { Suspense } from 'react';

import { BuyerTransactionPlacedPage } from '@/components/buyer/transactions/BuyerTransactionPlacedPage';
import EstimatePlacedLoading from './loading';

export default function EstimatePlacedPage() {
  return (
    <Suspense fallback={<EstimatePlacedLoading />}>
      <BuyerTransactionPlacedPage
        kind="estimate"
        title="Estimate created"
        detailEndpoint="/api/buyer/estimates"
        successHeading="Estimate created successfully"
        successCopy="Your estimate is ready. We’ll keep the canonical number in sync once Zoho confirms it."
        documentLabel="Estimate"
        catalogHref="/buy/catalog"
        ordersHref="/buy/orders?tab=enquiries"
      />
    </Suspense>
  );
}
