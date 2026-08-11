import { Suspense } from 'react';

import { BuyerTransactionPlacedPage } from '@/components/buyer/transactions/BuyerTransactionPlacedPage';
import OrderPlacedLoading from './loading';

export default function OrderPlacedPage() {
  return (
    <Suspense fallback={<OrderPlacedLoading />}>
      <BuyerTransactionPlacedPage
        kind="order"
        title="Order created"
        detailEndpoint="/api/buyer/orders"
        successHeading="Order created successfully"
        successCopy="Your order is in the queue."
        documentLabel="Order"
      />
    </Suspense>
  );
}
