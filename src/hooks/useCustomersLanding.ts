'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiPost } from '@/lib/api-fetch';
import { rollbackSnapshots, takeSnapshots } from '@/lib/optimistic';
import type { BuyerCreateInput } from '@/lib/zod';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface CustomersLandingBuyer {
  id: string;
  business_name: string;
  tier: 'A' | 'B' | 'C' | null;
  city: string;
  cohort: string;
  spend_mtd: number;
  spend_prev_mtd: number;
  growth_pct: number;
  orders_mtd: number;
  last_order_at: string | null;
  credit_limit: number;
  credit_used: number;
  dues: number;
  status: { label: string; tone: StatusTone };
  avatar: { initials: string; hue: 'teal' | 'ember' | 'cream' };
}

export interface CustomersLandingResponse {
  kpis: {
    total: number;
    cohort_count: number;
    active: number;
    active_pct: number;
    spend_mtd: number;
    spend_growth_pct: number;
    dormant_over_30d: number;
    outstanding_dues: number;
    buyers_with_dues: number;
  };
  callouts: {
    needs_call: Array<CustomersLandingBuyer & { last_order_label: string }>;
    top_spenders: CustomersLandingBuyer[];
    top_risers: CustomersLandingBuyer[];
  };
  buyers: CustomersLandingBuyer[];
}

export function useCustomersLanding() {
  return useQuery({
    queryKey: ['tenant-customers'],
    queryFn: async (): Promise<CustomersLandingResponse> => {
      const res = await apiFetch('/api/tenant/customers');
      if (!res.ok) throw new Error('Failed to fetch customers landing');
      return res.json();
    },
  });
}

export function useCreateCustomerOptimistic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: BuyerCreateInput) => {
      const res = await apiPost('/api/customers', payload);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to create customer');
      }
      return res.json();
    },
    onMutate: async (payload) => {
      const snapshots = await takeSnapshots(queryClient, [['tenant-customers']]);

      queryClient.setQueryData<CustomersLandingResponse>(['tenant-customers'], (old) => {
        if (!old) return old;

        const optimisticBuyer: CustomersLandingBuyer = {
          id: `optimistic-${Date.now()}`,
          business_name: payload.business_name,
          tier: payload.tier ?? null,
          city: payload.geography?.city ?? 'Unknown',
          cohort: '—',
          spend_mtd: 0,
          spend_prev_mtd: 0,
          growth_pct: 0,
          orders_mtd: 0,
          last_order_at: null,
          credit_limit: payload.credit_limit ?? 0,
          credit_used: 0,
          dues: 0,
          status: { label: 'Healthy', tone: 'success' },
          avatar: { initials: payload.business_name.slice(0, 2).toUpperCase(), hue: 'teal' },
        };

        return {
          ...old,
          kpis: {
            ...old.kpis,
            total: old.kpis.total + 1,
          },
          buyers: [optimisticBuyer, ...old.buyers],
        };
      });

      return { snapshots };
    },
    onError: (_, __, context) => {
      rollbackSnapshots(queryClient, context?.snapshots);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}
