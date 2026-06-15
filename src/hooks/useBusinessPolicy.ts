'use client';

import { useTenantSettings } from '@/hooks/useTenantSettings';

export function useBusinessPolicy() {
  const { data } = useTenantSettings();
  return {
    creditEnabled: data?.modules.business_policy.credit_enabled ?? true,
    gstInclusive: data?.modules.business_policy.gst_inclusive ?? false,
  };
}
