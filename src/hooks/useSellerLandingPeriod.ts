'use client';

import { useCallback, useState } from 'react';

import {
  SELLER_LANDING_PERIOD_OPTIONS,
  parseSellerLandingPeriod,
  sellerLandingPeriodLabel,
  sellerLandingMetricSuffix,
  sellerLandingPeriodLowerLabel,
  type SellerLandingPeriod,
} from '@/lib/seller-period';

export function useSellerLandingPeriod(initialPeriod: SellerLandingPeriod) {
  const [period, setPeriodState] = useState<SellerLandingPeriod>(() => parseSellerLandingPeriod(initialPeriod));

  const setPeriod = useCallback(
    (nextPeriod: SellerLandingPeriod) => {
      setPeriodState(parseSellerLandingPeriod(nextPeriod));
    },
    [],
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
