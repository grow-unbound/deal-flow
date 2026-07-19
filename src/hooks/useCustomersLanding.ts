'use client';

import { useMutation, useQuery, useQueryClient, useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch, apiPost } from '@/lib/api-fetch';
import { appendArrayParam } from '@/lib/landing-filter-params';
import { rollbackSnapshots, takeSnapshots } from '@/lib/optimistic';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';
import type { BuyerCreateInput } from '@/lib/zod';
import type { SellerLandingPeriod, SellerLandingPeriodMeta } from '@/lib/seller-period';
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
  active_price_list?: {
    name: string;
    source: 'direct' | 'cohort';
    cohort_name?: string | null;
  } | null;
  spend_mtd: number;
  spend_prev_mtd: number;
  growth_pct: number;
  orders_mtd: number;
  last_order_at: string | null;
  credit_limit: number;
  credit_used: number;
  overdue_amount?: number;
  dues: number;
  overdue_days?: number | null;
  status: { label: string; tone: StatusTone };
  avatar: { initials: string; hue: AvatarHue };
  whatsapp_opted_out?: boolean;
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
    invoiced_customer_count: number;
    overdue_sum: number;
    overdue_customer_count: number;
    dormant_prior_year_value: number;
  };
  callouts: {
    needs_call: Array<CustomersLandingBuyer & { last_order_label: string; invoice_count: number; days_overdue: number | null }>;
    needs_call_total?: number;
    win_back: Array<CustomersLandingBuyer & { last_order_label: string; prior_value: number; days_inactive: number | null }>;
    win_back_total?: number;
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
    buyer_app_enabled: boolean;
    whatsapp_opted_out: boolean;
    city: string;
    buyer_since: string | null;
    years_label: string;
    net_terms_days: number;
    subtitle_meta: {
      buyer_app_status_label: string;
      city: string | null;
      phone: string | null;
      last_activity_at: string | null;
      last_activity_kind: string | null;
      last_activity_days_ago: number | null;
      last_activity_date_label: string;
    };
  };
  meta_strip_4: {
    invoiced_sales_90d: number;
    invoice_count_90d: number;
    primary_demand_kind: 'orders' | 'estimates' | 'none';
    demand_90d: number;
    demand_order_count_90d: number;
    demand_estimate_count_90d: number;
    credit_used: number;
    credit_available: number;
    credit_limit: number;
    credit_used_pct: number;
    last_invoice_value: number;
    last_invoice_date: string | null;
  };
  details: {
    business_name: string;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
    gstin: string | null;
    gst_treatment: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    zone: string | null;
    billing_address: Record<string, unknown> | null;
    shipping_address: Record<string, unknown> | null;
    payment_terms_days: number | null;
    credit_limit: number | null;
    default_price_list_id: string | null;
    assigned_price_list: string | null;
    buyer_users: Array<{
      id: string;
      user_id: string | null;
      first_name: string;
      last_name: string;
      full_name: string;
      phone: string | null;
      email: string | null;
      designation: string | null;
      department: string | null;
      is_active: boolean;
      status: 'Active' | 'Inactive' | 'Pending invite';
    }>;
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
    cohorts: string[];
    is_active: boolean;
    buyer_app_enabled: boolean;
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
  performance_cards?: unknown[];
  detail_v2?: unknown;
  tab_badges: {
    orders_90d: number;
    estimates_90d: number;
    invoices_90d: number;
    price_lists_assigned: number;
  };
  cohorts_summary: {
    rows: Array<{
      id: string;
      name: string;
      member_count: number;
    }>;
  };
  price_lists: {
    assigned_count: number;
  };
  role: string | null;
}

export interface CustomerDocumentRow {
  id: string;
  number: string | null;
  placed_at: string | null;
  created_at: string | null;
  expires_at: string | null;
  due_date: string | null;
  location_name: string | null;
  place_of_supply: string | null;
  source_kind: 'buyer_app' | 'converted' | 'direct' | 'seller';
  source_label: string | null;
  campaign_name: string | null;
  items_count: number;
  total_amount: number;
  outstanding_amount: number;
  status: string;
}

export interface CustomerDocumentPage {
  rows: CustomerDocumentRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface CustomerPriceListRow {
  id: string;
  name: string;
  priority: number | null;
  target_type: 'buyer' | 'cohort' | 'all_buyers';
  target_label: string;
  valid_from: string | null;
  valid_to: string | null;
  status: 'active' | 'draft' | 'expired';
}

export interface CustomerPriceListPage {
  assigned: CustomerPriceListRow[];
  total: number;
}

export function useCustomersLanding(period: SellerLandingPeriod = 'month', initialData?: CustomersLandingResponse | null) {
  return useQuery({
    queryKey: ['tenant-customers'],
    queryFn: async (): Promise<CustomersLandingResponse> => {
      const res = await apiFetch('/api/tenant/customers');
      if (!res.ok) throw new Error('Failed to fetch customers landing');
      return res.json();
    },
    initialData: initialData ?? undefined,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export interface CustomersInfiniteFilters {
  search?: string;
  status?: string[];
  due?: string[];
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
    queryKey: ['tenant-customers-infinite', filters],
    queryFn: async ({ pageParam }): Promise<CustomersLandingPage> => {
      const params = new URLSearchParams();
      if (pageParam) params.set('cursor', pageParam as string);
      if (filters.search?.trim()) params.set('search', filters.search.trim());
      appendArrayParam(params, 'status', filters.status);
      appendArrayParam(params, 'due', filters.due);
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

export function useCustomerDocuments(
  buyerId: string,
  filters: {
    kind: 'order' | 'estimate' | 'invoice';
    period?: SellerLandingPeriod;
    query?: string;
    status?: string[];
    sort?: string;
  },
  enabled = true,
) {
  return useQuery<CustomerDocumentPage>({
    queryKey: ['tenant-customer-documents', buyerId, filters],
    enabled: Boolean(buyerId) && enabled,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ kind: filters.kind, limit: '200' });
      params.set('period', filters.period ?? 'month');
      if (filters.query?.trim()) params.set('q', filters.query.trim());
      appendArrayParam(params, 'status', filters.status);
      if (filters.sort) params.set('sort', filters.sort);
      const res = await apiFetch(`/api/tenant/customers/${buyerId}/documents?${params}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch customer documents');
      return res.json();
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useCustomerPriceLists(
  buyerId: string,
  page = 0,
  enabled = true,
) {
  return useQuery<CustomerPriceListPage>({
    queryKey: ['tenant-customer-price-lists', buyerId, page],
    enabled: Boolean(buyerId) && enabled,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        limit: '50',
        offset: String(Math.max(0, page) * 50),
      });
      const res = await apiFetch(`/api/tenant/customers/${buyerId}/price-lists?${params.toString()}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch customer price lists');
      return res.json();
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
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
          tier: null,
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
