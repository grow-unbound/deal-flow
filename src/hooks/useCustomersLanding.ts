'use client';

import { useMutation, useQuery, useQueryClient, useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch, apiPost } from '@/lib/api-fetch';
import { appendArrayParam } from '@/lib/landing-filter-params';
import { rollbackSnapshots, takeSnapshots } from '@/lib/optimistic';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';
import type { BuyerCreateInput } from '@/lib/zod';
import { getSellerLandingInitialData, type SellerLandingPeriod, type SellerLandingPeriodMeta } from '@/lib/seller-period';
import type { LandingFilterMeta } from '@/lib/landing-filter-params';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';
export type AvatarHue = 'teal' | 'ember' | 'cream';

export interface CustomersLandingBuyer {
  id: string;
  business_name: string;
  tier: 'A' | 'B' | 'C' | null;
  phone: string | null;
  gst_treatment?: string | null;
  zoho_status?: string | null;
  city: string;
  state?: string | null;
  cohort: string;
  active_price_list?: string | null;
  spend_mtd: number;
  spend_prev_mtd: number;
  growth_pct: number;
  orders_mtd: number;
  last_order_at: string | null;
  credit_limit: number;
  credit_used: number;
  dues: number;
  status: { label: string; tone: StatusTone };
  avatar: { initials: string; hue: AvatarHue };
}

export interface CustomersLandingResponse {
  period?: SellerLandingPeriodMeta;
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
  filters?: LandingFilterMeta;
}

export interface TenantCustomerDetailResponse {
  header: {
    id: string;
    buyer_name: string;
    initials: string;
    hue: AvatarHue;
    status_label: string;
    status_tone: StatusTone;
    tier: 'A' | 'B' | 'C' | null;
    city: string;
    buyer_since: string | null;
    years_label: string;
    net_terms_days: number;
  };
  meta_strip_4: {
    spend_mtd: number;
    growth_pct: number;
    orders_mtd: number;
    aov_mtd: number;
    last_order_label: string;
    last_order_primary_product_qty: string;
    credit_used: number;
    credit_limit: number;
    credit_used_pct: number;
  };
  details: {
    business_name: string;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
    gstin: string | null;
    gst_treatment: string | null;
    zoho_status: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    zone: string | null;
    billing_address: Record<string, unknown> | null;
    shipping_address: Record<string, unknown> | null;
    payment_terms_days: number | null;
    credit_limit: number | null;
    external_ref: string | null;
    assigned_price_list: string | null;
    contacts: Array<{
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      designation: string | null;
      department: string | null;
      is_active: boolean;
    }>;
    default_cohort_id?: string | null;
    tier?: 'A' | 'B' | 'C' | null;
    cohorts: string[];
    is_active: boolean;
  };
  performance: {
    monthly_spend_trend: Array<{ month: string; spend: number }>;
    brand_affinity: Array<{ brand: string; spend: number }>;
    order_frequency: Array<{ label: string; orders: number }>;
  };
  performance_v2: {
    headline: {
      spend_mtd: number;
      growth_pct: number;
      orders_mtd: number;
      aov_mtd: number;
    };
    brand_mix: {
      total_spend: number;
      rows: Array<{
        brand: string;
        spend: number;
        pct: number;
      }>;
    };
    top_skus: Array<{
      name: string;
      sku: string;
      revenue: number;
      units: number;
    }>;
    credit_ops: {
      last_order_days_ago: string;
      last_order_value: number;
      catalog_opens_mtd: number;
      credit_used: number;
      credit_limit: number;
      credit_util_pct: number;
      payment_behavior_summary: string;
    };
  };
  orders: {
    badge_count_mtd: number;
    rows: Array<{
      id: string;
      order_number: string | null;
      placed_at: string | null;
      items: number;
      gmv: number;
      status: string;
    }>;
  };
  estimates: {
    rows: Array<{
      id: string;
      number: string | null;
      issued_at: string | null;
      total_amount: number;
      status: string;
    }>;
  };
  invoices: {
    rows: Array<{
      id: string;
      number: string | null;
      issued_at: string | null;
      total_amount: number;
      status: string;
    }>;
  };
  cohorts_summary: {
    rows: Array<{
      id: string;
      name: string;
      member_count: number;
    }>;
  };
  price_lists: {
    assigned: Array<{
      id: string;
      name: string;
      target_type: 'buyer' | 'cohort' | 'all_buyers';
      target_label: string;
      valid_from: string | null;
      valid_to: string | null;
      status: 'active' | 'draft' | 'expired';
    }>;
    lookup_products: Array<{
      tenant_product_id: string;
      name: string;
      sku: string;
    }>;
  };
  activity: Array<{
    id: string;
    at: string;
    kind: 'invoice' | 'payment' | 'credit_adjustment' | 'catalog_view' | 'order' | 'audit';
    title: string;
    subtitle: string;
    amount: number | null;
  }>;
  computed: {
    last_order_date_human: string;
  };
}

export function useCustomersLanding(period: SellerLandingPeriod = 'month', initialData?: CustomersLandingResponse | null) {
  return useQuery({
    queryKey: ['tenant-customers', period],
    queryFn: async (): Promise<CustomersLandingResponse> => {
      const res = await apiFetch(`/api/tenant/customers?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch customers landing');
      return res.json();
    },
    initialData: getSellerLandingInitialData(period, initialData),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export interface CustomersInfiniteFilters {
  search?: string;
  status?: string[];
  due?: string[];
  city?: string[];
  state?: string[];
}

export interface CustomersLandingPage extends CustomersLandingResponse {
  nextCursor: string | null;
  total: number | null;
}

export function useCustomersLandingInfinite(
  period: SellerLandingPeriod = 'month',
  filters: CustomersInfiniteFilters = {},
) {
  return useInfiniteQuery({
    queryKey: ['tenant-customers-infinite', period, filters],
    queryFn: async ({ pageParam }): Promise<CustomersLandingPage> => {
      const params = new URLSearchParams({ period });
      if (pageParam) params.set('cursor', pageParam as string);
      if (filters.search?.trim()) params.set('search', filters.search.trim());
      appendArrayParam(params, 'status', filters.status);
      appendArrayParam(params, 'due', filters.due);
      appendArrayParam(params, 'city', filters.city);
      appendArrayParam(params, 'state', filters.state);
      const res = await apiFetch(`/api/tenant/customers?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch customers landing');
      return res.json() as Promise<CustomersLandingPage>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useTenantCustomerDetail(id: string) {
  return useQuery({
    queryKey: ['tenant-customer-detail', id],
    queryFn: async (): Promise<TenantCustomerDetailResponse> => {
      const res = await apiFetch(`/api/tenant/customers/${id}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Forbidden');
        }
        if (res.status === 404) {
          throw new Error('Not found');
        }
        throw new Error('Failed to fetch customer detail');
      }
      return res.json();
    },
    enabled: Boolean(id),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function useToggleCustomerStatusOptimistic(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (action: 'deactivate' | 'reactivate') => {
      const res = await apiFetch(`/api/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to update status');
      }

      return res.json();
    },
    onMutate: async (action) => {
      const snapshots = await takeSnapshots(queryClient, [
        ['tenant-customer-detail', id],
        ['tenant-customers'],
      ]);

      queryClient.setQueryData<TenantCustomerDetailResponse>(['tenant-customer-detail', id], (old) => {
        if (!old) return old;
        const isActive = action === 'reactivate';
        return {
          ...old,
          header: {
            ...old.header,
            status_label: isActive ? 'Active' : 'Inactive',
            status_tone: isActive ? 'success' : 'neutral',
          },
          details: {
            ...old.details,
            is_active: isActive,
          },
        };
      });

      queryClient.setQueryData<CustomersLandingResponse>(['tenant-customers'], (old) => {
        if (!old) return old;
        const isActive = action === 'reactivate';
        return {
          ...old,
          buyers: old.buyers.map((buyer) => {
            if (buyer.id !== id) return buyer;
            return {
              ...buyer,
              status: {
                label: isActive ? 'Healthy' : 'Inactive',
                tone: isActive ? 'success' : 'neutral',
              },
            };
          }),
        };
      });

      return { snapshots };
    },
    onError: (error, _action, context) => {
      rollbackSnapshots(queryClient, context?.snapshots);
      toast.error(error instanceof Error ? error.message : 'Failed to update status');
    },
    onSuccess: (_data, action) => {
      toast.success(action === 'reactivate' ? 'Customer reactivated' : 'Customer deactivated');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-customer-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['tenant-customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
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
        throw new Error((body as { error?: string }).error ?? 'Failed to create customer');
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
          phone: payload.phone ?? null,
          gst_treatment: null,
          zoho_status: null,
          city: payload.geography?.city ?? 'Unknown',
          cohort: '—',
          active_price_list: null,
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
    onError: (error, __, context) => {
      rollbackSnapshots(queryClient, context?.snapshots);
      toast.error(error instanceof Error ? error.message : 'Failed to create customer');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}
