'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { apiFetch, apiPost } from '@/lib/api-fetch';
import type { BillingSettingsView, UpgradeRequestInput } from '@/types/billing-settings';

async function parseBillingResponse(res: Response): Promise<BillingSettingsView> {
  const json = (await res.json()) as {
    data: BillingSettingsView | null;
    error: { code?: string; message?: string } | null;
  };
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Request failed (${res.status})`);
  }
  if (!json.data) {
    throw new Error(json.error?.message ?? 'No data');
  }
  return json.data;
}

export function useBillingSettings() {
  const queryClient = useQueryClient();
  const { currentTenantId } = useAuth();

  const query = useQuery({
    queryKey: ['billing-settings', currentTenantId],
    enabled: Boolean(currentTenantId),
    queryFn: async () => {
      const res = await apiFetch('/api/settings/billing');
      return parseBillingResponse(res);
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: async (body: UpgradeRequestInput) => {
      const res = await apiPost('/api/settings/billing/upgrade-request', body);
      const json = (await res.json()) as { data?: { success: boolean }; error?: { message?: string } };
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to send upgrade request');
      }
      return json.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['billing-settings', currentTenantId] });
      toast.success('Upgrade request sent');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Request failed');
    },
  });

  const topUpMutation = useMutation({
    mutationFn: async () => {
      const res = await apiPost('/api/settings/billing/top-up', {});
      const json = (await res.json()) as { error?: { message?: string } };
      if (res.status === 501) {
        throw new Error(json.error?.message ?? 'Top-up not available');
      }
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Request failed');
      }
    },
    onError: (err) => {
      toast.info(err instanceof Error ? err.message : 'Top-up not available');
    },
  });

  return {
    ...query,
    requestUpgrade: upgradeMutation.mutateAsync,
    requestTopUp: topUpMutation.mutateAsync,
    isRequestingUpgrade: upgradeMutation.isPending,
    isRequestingTopUp: topUpMutation.isPending,
  };
}
