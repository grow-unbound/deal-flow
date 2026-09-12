'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { BuyerTransactionPlacedPage } from '@/components/buyer/transactions/BuyerTransactionPlacedPage';
import EstimatePlacedLoading from './loading';

function EstimatePlacedContent() {
  const params = useSearchParams();
  const isEnquiry = params.get('kind') === 'enquiry';
  return (
    <BuyerTransactionPlacedPage
      kind="estimate"
      title={isEnquiry ? 'Enquiry sent' : 'Estimate created'}
      detailEndpoint="/api/buyer/estimates"
      successHeading={isEnquiry ? 'Enquiry sent' : 'Estimate created successfully'}
      successCopy={isEnquiry ? 'Your seller will respond with prices.' : 'Your estimate is ready.'}
      documentLabel={isEnquiry ? 'Enquiry' : 'Estimate'}
    />
  );
}

export default function EstimatePlacedPage() {
  return (
    <Suspense fallback={<EstimatePlacedLoading />}>
      <EstimatePlacedContent />
    </Suspense>
  );
}
