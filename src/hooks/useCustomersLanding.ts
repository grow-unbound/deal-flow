'use client';

import { useMutation, useQuery, useQueryClient, useInfiniteQuery, keepPreviousData, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch, apiPatch, apiPost } from '@/lib/api-fetch';
import {
  patchCustomerDetailAfterPayment,
  patchCustomerDocumentsAfterPayment,
  patchCustomerDocumentsWithPaymentResult,
  patchOutstandingInvoicesAfterPayment,
  patchOutstandingInvoicesWithPaymentResult,
} from '@/lib/customers/customer-payment-cache-patches';
import { appendArrayParam } from '@/lib/landing-filter-params';
import { rollbackSnapshots, takeSnapshots } from '@/lib/optimistic';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';
import type { BuyerCreateInput } from '@/lib/zod';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import type {
  CustomersLandingMetricsV4,
  CustomersLandingTableResponseV4,
  CustomersLandingTableRowV4,
  CustomersLandingTableSort,
} from '@/lib/customers-landing-v4-types';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';
export type AvatarHue = 'teal' | 'ember' | 'cream';

/** @deprecated Use CustomersLandingTableRowV4 — kept as alias for gradual call-site updates. */
export type CustomersLandingBuyer = CustomersLandingTableRowV4;

/** @deprecated V2 landing response — use CustomersLandingMetricsV4 / CustomersLandingTableResponseV4. */
export type CustomersLandingResponse = CustomersLandingTableResponseV4;

export type {
  CustomersLandingMetricsV4,
  CustomersLandingTableResponseV4,
  CustomersLandingTableRowV4,
  CustomersLandingTableSort,
};

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
  /** Quarter-to-date KPI strip, sourced from metrics_buyer_now_summary + metrics_buyer_period_summary (grain='quarter'). */
  meta_strip_4: {
    sales_qtd_value: number;
    sales_qtd_count: number;
    sales_qtd_trend_pct: number | null;
    receivable_amount: number;
    receivable_invoice_count: number;
    overdue_amount: number;
    overdue_invoice_count: number;
    primary_demand_kind: 'orders' | 'estimates' | 'none';
    demand_qtd_value: number;
    demand_qtd_count: number;
    demand_qtd_trend_pct: number | null;
    app_engagement_value: number;
    app_engagement_count: number;
    credit_used: number;
    credit_available: number;
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

export interface CustomerOutstandingInvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string | null;
  due_date: string | null;
  total_amount: number;
  outstanding_amount: number;
  location_id: string | null;
  location_name: string | null;
  place_of_supply: string | null;
  status: 'sent' | 'overdue';
}

export function useCustomersLandingMetrics(initialData?: CustomersLandingMetricsV4 | null) {
  return useQuery({
    queryKey: ['tenant-customers-metrics'],
    queryFn: async (): Promise<CustomersLandingMetricsV4> => {
      const res = await apiFetch('/api/tenant/customers/metrics');
      if (!res.ok) throw new Error('Failed to fetch customers metrics');
      return res.json();
    },
    initialData: initialData ?? undefined,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

/** @deprecated Prefer useCustomersLandingMetrics — kept for invalidate call sites. */
export function useCustomersLanding(
  _period?: SellerLandingPeriod,
  initialData?: CustomersLandingMetricsV4 | null,
) {
  return useCustomersLandingMetrics(initialData);
}

export interface CustomersInfiniteFilters {
  search?: string;
  sort?: CustomersLandingTableSort;
  filter_preset?: Record<string, unknown> | null;
}

export interface CustomersLandingPage extends CustomersLandingTableResponseV4 {
  nextCursor: string | null;
  total: number | null;
}

export function useCustomersLandingInfinite(filters: CustomersInfiniteFilters = {}) {
  const presetKey = filters.filter_preset ? JSON.stringify(filters.filter_preset) : null;
  return useInfiniteQuery({
    queryKey: ['tenant-customers-infinite', {
      search: filters.search ?? '',
      sort: filters.sort ?? 'invoice_value',
      filter_preset: presetKey,
    }],
    queryFn: async ({ pageParam }): Promise<CustomersLandingPage> => {
      const params = new URLSearchParams();
      if (pageParam) params.set('cursor', pageParam as string);
      if (filters.search?.trim()) params.set('search', filters.search.trim());
      if (filters.sort) params.set('sort', filters.sort);
      if (filters.filter_preset && Object.keys(filters.filter_preset).length > 0) {
        params.set('filter_preset', JSON.stringify(filters.filter_preset));
      }
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

export function useTenantCustomerDetail(id: string, options?: { includePerformance?: boolean }) {
  return useQuery({
    queryKey: ['tenant-customer-detail', id, options?.includePerformance ?? true],
    queryFn: async (): Promise<TenantCustomerDetailResponse> => {
      const params = new URLSearchParams();
      params.set('include_performance', String(options?.includePerformance ?? true));
      const res = await apiFetch(`/api/tenant/customers/${id}?${params.toString()}`, { fresh: true });
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

export function useCustomerOutstandingInvoices(id: string, enabled = true) {
  return useQuery<{ invoices: CustomerOutstandingInvoiceRow[] }>({
    queryKey: ['tenant-customer-outstanding-invoices', id],
    enabled: Boolean(id) && enabled,
    queryFn: async ({ signal }) => {
      const res = await apiFetch(`/api/tenant/customers/${id}/outstanding-invoices`, { signal, fresh: true });
      if (!res.ok) {
        if (res.status === 403) throw new Error('Forbidden');
        if (res.status === 404) throw new Error('Not found');
        throw new Error('Failed to fetch outstanding invoices');
      }
      return res.json();
    },
    staleTime: 30_000,
  });
}

interface CollectCustomerPaymentResult {
  data?: {
    outstanding_balance?: number;
    status?: string;
  };
}

interface CollectCustomerPaymentPayload {
  invoiceId: string;
  amount: number;
  payment_method: string;
  payment_reference?: string | null;
  paid_at?: string;
}

function applyCustomerPaymentDetailCacheUpdate(
  queryClient: QueryClient,
  customerId: string,
  paymentAmount: number,
) {
  queryClient.setQueryData<TenantCustomerDetailResponse>(
    ['tenant-customer-detail', customerId],
    (old) => (old ? patchCustomerDetailAfterPayment(old, paymentAmount) : old),
  );
}

function applyCustomerPaymentInvoiceCacheUpdates(
  queryClient: QueryClient,
  customerId: string,
  payload: CollectCustomerPaymentPayload,
  paymentResult?: CollectCustomerPaymentResult,
) {
  const outstandingBalance = paymentResult?.data?.outstanding_balance;
  const status = paymentResult?.data?.status;

  if (typeof outstandingBalance === 'number' && typeof status === 'string') {
    queryClient.setQueryData<{ invoices: CustomerOutstandingInvoiceRow[] }>(
      ['tenant-customer-outstanding-invoices', customerId],
      (old) => (old ? patchOutstandingInvoicesWithPaymentResult(old, payload.invoiceId, outstandingBalance) : old),
    );

    queryClient.setQueriesData<CustomerDocumentPage>(
      { queryKey: ['tenant-customer-documents', customerId] },
      (old) => (old ? patchCustomerDocumentsWithPaymentResult(old, payload.invoiceId, outstandingBalance, status) : old),
    );
    return;
  }

  queryClient.setQueryData<{ invoices: CustomerOutstandingInvoiceRow[] }>(
    ['tenant-customer-outstanding-invoices', customerId],
    (old) => (old ? patchOutstandingInvoicesAfterPayment(old, payload.invoiceId, payload.amount) : old),
  );

  queryClient.setQueriesData<CustomerDocumentPage>(
    { queryKey: ['tenant-customer-documents', customerId] },
    (old) => (old ? patchCustomerDocumentsAfterPayment(old, payload.invoiceId, payload.amount) : old),
  );
}

function applyCustomerPaymentCacheUpdates(
  queryClient: QueryClient,
  customerId: string,
  payload: CollectCustomerPaymentPayload,
  paymentResult?: CollectCustomerPaymentResult,
) {
  applyCustomerPaymentDetailCacheUpdate(queryClient, customerId, payload.amount);
  applyCustomerPaymentInvoiceCacheUpdates(queryClient, customerId, payload, paymentResult);
}

export function useCollectCustomerInvoicePayment(customerId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CollectCustomerPaymentPayload) => {
      const res = await apiPatch(`/api/tenant/invoices/${payload.invoiceId}/pay`, {
        amount: payload.amount,
        payment_method: payload.payment_method,
        payment_reference: payload.payment_reference,
        paid_at: payload.paid_at,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((json as { error?: string }).error ?? 'Failed to record payment');
      }
      return json as CollectCustomerPaymentResult;
    },
    onMutate: async (payload) => {
      const snapshots = await takeSnapshots(queryClient, [
        ['tenant-customer-detail', customerId],
        ['tenant-customer-outstanding-invoices', customerId],
      ]);

      await queryClient.cancelQueries({ queryKey: ['tenant-customer-documents', customerId] });
      const documentSnapshots = queryClient.getQueriesData<CustomerDocumentPage>({
        queryKey: ['tenant-customer-documents', customerId],
      });

      applyCustomerPaymentCacheUpdates(queryClient, customerId, payload);

      return { snapshots, documentSnapshots };
    },
    onSuccess: (paymentResult, payload) => {
      applyCustomerPaymentInvoiceCacheUpdates(queryClient, customerId, payload, paymentResult);
      toast.success('Payment recorded');
    },
    onError: (error, _payload, context) => {
      rollbackSnapshots(queryClient, context?.snapshots);
      context?.documentSnapshots?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      toast.error(error instanceof Error ? error.message : 'Failed to record payment');
    },
    onSettled: async (_paymentResult, error, payload) => {
      if (!payload || error) return;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tenant-customer-outstanding-invoices', customerId] }),
        queryClient.invalidateQueries({ queryKey: ['tenant-customer-documents', customerId] }),
        queryClient.invalidateQueries({ queryKey: ['tenant-invoices'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant-customers-metrics'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant-customers-infinite'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant-invoice', payload.invoiceId] }),
      ]);
    },
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
      const res = await apiFetch(`/api/tenant/customers/${buyerId}/documents?${params}`, { signal, fresh: true });
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
        ['tenant-customers-metrics'],
        ['tenant-customers-infinite'],
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
      queryClient.invalidateQueries({ queryKey: ['tenant-customers-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-customers-infinite'] });
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
    onMutate: async () => {
      const snapshots = await takeSnapshots(queryClient, [
        ['tenant-customers-metrics'],
        ['tenant-customers-infinite'],
      ]);
      return { snapshots };
    },
    onError: (error, __, context) => {
      rollbackSnapshots(queryClient, context?.snapshots);
      toast.error(error instanceof Error ? error.message : 'Failed to create customer');
    },
    onSuccess: () => {
      toast.success('Customer created');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-customers-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-customers-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}
