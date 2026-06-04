'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

import {
  SELLER_LANDING_PERIOD_OPTIONS,
  parseSellerLandingPeriod,
  sellerLandingPeriodLabel,
  sellerLandingMetricSuffix,
  sellerLandingPeriodLowerLabel,
  type SellerLandingPeriod,
} from '@/lib/seller-period';

export function useSellerLandingPeriod(initialPeriod: SellerLandingPeriod) {
  const router = useRouter();
  const period = parseSellerLandingPeriod(initialPeriod);

  const setPeriod = useCallback(
    (nextPeriod: SellerLandingPeriod) => {
      const params = new URLSearchParams(window.location.search);
      params.set('period', nextPeriod);
      const query = params.toString();
      router.push(query ? `${window.location.pathname}?${query}` : window.location.pathname);
    },
    [router],
  );

  return {
    period,
    setPeriod,
    horizonLabel: sellerLandingPeriodLabel(period),
    lowerLabel: sellerLandingPeriodLowerLabel(period),
    metricSuffix: sellerLandingMetricSuffix(period),
    options: SELLER_LANDING_PERIOD_OPTIONS,
  };
}
