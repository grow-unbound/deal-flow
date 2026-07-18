'use client';

import { keepPreviousData, useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'sonner';
import { apiFetch, apiPost } from '@/lib/api-fetch';
import { appendArrayParam } from '@/lib/landing-filter-params';
import { rollbackSnapshots, takeSnapshots, type OptimisticSnapshot } from '@/lib/optimistic';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';
import { mergeSellerLandingPages } from '@/lib/merge-seller-landing-pages';
import type {
  PriceListAssignmentInput,
  PriceListComposerPayload,
  PriceListCreateInput,
  PriceListFilterState,
  PriceListItemCreateInput,
  PriceListPricingStrategy,
} from '@/lib/zod';

export interface PriceList {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  valid_from: string | null;
  valid_to: string | null;
  priority: number;
  is_active: boolean;
  pricing_strategy?: PriceListPricingStrategy;
  strategy_value?: number | null;
  filters?: PriceListFilterState | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

export interface PriceListComposerProduct {
  id: string;
  internal_sku: string;
  display_name: string;
  name_override?: string | null;
  brand_name: string | null;
  category_name: string | null;
  mrp: number | null;
  base_selling_price: number | null;
  cost_price?: number | null;
  image_urls?: string[] | null;
  status_label?: string;
  status_tone?: 'success' | 'warning' | 'danger' | 'neutral';
}

export type PriceListLandingStatus = 'active' | 'draft' | 'expired';
export type PriceListLandingStatusTone = 'success' | 'warning' | 'neutral';

export interface PriceListLandingRow {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  currency: string;
  valid_from: string | null;
  valid_to: string | null;
  updated_at: string;
  created_at: string;
  status: PriceListLandingStatus;
  status_tone: PriceListLandingStatusTone;
  cohorts_count: number;
  cohort_names: string[];
  product_count: number;
  avg_discount_pct: number | null;
  avg_margin_pct: number | null;
  created_by_label: string;
  is_expiring_soon: boolean;
  pricing_strategy: PriceListPricingStrategy;
  strategy_value: number | null;
}

export interface PriceListsLandingResponse {
  total?: number;
  limit?: number;
  offset?: number;
  nextOffset?: number | null;
  kpis: {
    active_lists: number;
    draft_lists: number;
    expiring_soon: number;
    cohorts_covered: number;
    cohorts_total: number;
    products_with_overrides: number;
  };
  todays_read: {
    expiring_soon: Array<{
      id: string;
      name: string;
      initials: string;
      valid_until: string | null;
      valid_until_label: string;
      cohorts_count: number;
      status: PriceListLandingStatus;
      status_tone: PriceListLandingStatusTone;
    }>;
    most_coverage: Array<{
      id: string;
      name: string;
      initials: string;
      product_count: number;
      valid_until: string | null;
      valid_until_label: string;
    }>;
    uncovered_cohorts: Array<{
      id: string;
      name: string;
      initials: string;
      member_count: number;
    }>;
  };
  price_lists: PriceListLandingRow[];
  cohorts_total: number;
  counts: {
    active: number;
    draft: number;
    expired: number;
  };
}

export interface PriceListsLandingFilters {
  search?: string;
  status?: string[];
}

export interface PriceListItem {
  id: string;
  price_list_id: string;
  tenant_product_id: string;
  price: number;
  min_qty: number;
  max_qty: number | null;
  tenant_product?: {
    id: string;
    internal_sku: string;
    name_override: string | null;
    mrp: number | null;
    base_selling_price: number | null;
    cost_price?: number | null;
    is_active?: boolean;
    tenant_brand?: {
      id: string;
      display_name_override: string | null;
      master_brand: { name: string } | null;
    } | null;
    inventory?: { on_hand: number | null; reorder_level: number | null } | null;
    master_product: { name: string } | null;
  };
}

export interface PriceListAssignment {
  id: string;
  price_list_id: string;
  target_type: 'buyer' | 'cohort' | 'all_buyers';
  target_id: string | null;
  created_at: string;
  label?: string;
  members?: number;
  priority?: number;
}

export interface PriceListActivity {
  id: number;
  action: 'create' | 'update' | 'delete' | 'publish' | 'status_change';
  diff: Record<string, unknown> | null;
  ts: string;
}

export interface PriceListDetail extends PriceList {
  status?: 'active' | 'draft' | 'expired';
  status_label?: 'Active' | 'Draft' | 'Expired';
  status_tone?: 'success' | 'warning' | 'neutral';
  initials?: string;
  created_by_label?: string;
  items: PriceListItem[];
  assignments: PriceListAssignment[];
  activity?: PriceListActivity[];
  performance_cards?: unknown[];
  detail_v2?: unknown;
  stats?: {
    products_covered: number;
    brands_covered: number;
    assignments_count: number;
    avg_discount_pct: number;
    days_left: number;
  };
}

export function usePriceLists() {
  return useQuery({
    queryKey: ['price-lists'],
    queryFn: async (): Promise<{ price_lists: PriceList[] }> => {
      const res = await apiFetch('/api/price-lists');
      if (!res.ok) {
        throw new Error('Failed to fetch price lists');
      }
      return res.json();
    },
  });
}

export function usePriceListsLanding(
  filters: PriceListsLandingFilters = {},
  initialData?: PriceListsLandingResponse | null,
) {
  const hasFilters = Boolean(filters.search?.trim() || filters.status?.length);
  const baseSummary = initialData ?? undefined;
  const initial = !hasFilters ? baseSummary : undefined;
  const query = useInfiniteQuery({
    queryKey: ['price-lists-landing', filters],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }): Promise<PriceListsLandingResponse> => {
      const params = new URLSearchParams({ limit: '50', offset: String(pageParam), include_summary: String(pageParam === 0 && !hasFilters) });
      if (filters.search?.trim()) params.set('search', filters.search.trim());
      appendArrayParam(params, 'status', filters.status);
      const res = await apiFetch(`/api/price-lists?${params.toString()}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch price lists landing');
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialData: initial ? { pages: [initial], pageParams: [0] } : undefined,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    placeholderData: keepPreviousData,
  });
  const merged = mergeSellerLandingPages(query.data?.pages, 'price_lists');
  return { ...query, data: merged && baseSummary ? { ...baseSummary, ...merged } : merged };
}

export function useCreatePriceList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PriceListCreateInput | PriceListComposerPayload): Promise<{ price_list: PriceList }> => {
      const payload = 'save_mode' in data
        ? data
        : {
            ...data,
            pricing_strategy: 'edit_each' as const,
            strategy_value: null,
            filters: { brand_names: [], category_names: [] },
            item_prices: [],
            save_mode: 'publish' as const,
          };
      const res = await apiPost('/api/price-lists', payload);

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error((body as { error?: string }).error ?? 'Failed to create price list');
      }

      return res.json() as Promise<{ price_list: PriceList }>;
    },

    onMutate: async (data) => {
      const snapshots = await takeSnapshots(queryClient, [['price-lists']]);
      queryClient.setQueryData<{ price_lists: PriceList[] }>(['price-lists'], (old) => ({
        price_lists: [
          {
            id: `optimistic-${Date.now()}`,
            name: data.name,
            description: 'description' in data ? (data.description ?? null) : null,
            currency: data.currency,
            valid_from: data.valid_from ? new Date(data.valid_from).toISOString() : null,
            valid_to: data.valid_to ? new Date(data.valid_to).toISOString() : null,
            priority: data.priority,
            is_active: ('save_mode' in data ? data.save_mode : 'publish') === 'publish',
            pricing_strategy: 'pricing_strategy' in data ? data.pricing_strategy : 'edit_each',
            strategy_value: 'strategy_value' in data ? (data.strategy_value ?? null) : null,
            filters: 'filters' in data ? data.filters : { brand_names: [], category_names: [], availability: 'show_all' as const },
            tenant_id: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          ...(old?.price_lists ?? []),
        ],
      }));
      return { snapshots };
    },

    onError: (_error, _data, ctx) => {
      rollbackSnapshots(queryClient, ctx?.snapshots);
      toast.error(_error instanceof Error ? _error.message : 'Could not create price list');
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] });
      queryClient.invalidateQueries({ queryKey: ['price-lists-landing'] });
      toast.success('Price list created');
    },
  });
}

export function useSavePriceListComposer(priceListId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: PriceListComposerPayload): Promise<{ price_list: PriceList }> => {
      const res = await apiFetch(priceListId ? `/api/price-lists/${priceListId}` : '/api/price-lists', {
        method: priceListId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error((body as { error?: string }).error ?? 'Failed to save price list');
      }

      return res.json() as Promise<{ price_list: PriceList }>;
    },
    onSuccess: (_data, payload) => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] });
      queryClient.invalidateQueries({ queryKey: ['price-lists-landing'] });
      if (priceListId) {
        queryClient.invalidateQueries({ queryKey: ['price-list', priceListId] });
      }
      toast.success(payload.save_mode === 'publish' ? 'Price list published' : 'Draft saved');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not save price list');
    },
  });
}

export interface ComposerFacetOption {
  id: string;
  label: string;
  count: number;
}

export interface PriceListComposerData {
  products: PriceListComposerProduct[];
  selected_products?: PriceListComposerProduct[];
  facets: {
    brands: ComposerFacetOption[];
    categories: ComposerFacetOption[];
  };
  total: number;
  nextCursor?: string | null;
}

export interface PriceListComposerProductFilters {
  search?: string;
  brands?: string[];
  categories?: string[];
  availability?: 'show_all' | 'in_stock' | 'low_stock' | 'out_of_stock';
  limit?: number;
}

export function usePriceListComposerProducts(filters: PriceListComposerProductFilters = {}, enabled = true) {
  const normalizedSearch = filters.search?.trim() ?? '';
  const normalizedBrands = filters.brands ?? [];
  const normalizedCategories = filters.categories ?? [];
  const availability = filters.availability ?? 'show_all';
  const limit = filters.limit ?? 50;

  return useInfiniteQuery({
    queryKey: ['price-list-composer-products', normalizedSearch, normalizedBrands, normalizedCategories, availability, limit],
    queryFn: async ({ pageParam, signal }): Promise<PriceListComposerData> => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('availability', availability);
      if (pageParam) params.set('cursor', pageParam as string);
      if (normalizedSearch) params.set('q', normalizedSearch);
      appendArrayParam(params, 'brand', normalizedBrands);
      appendArrayParam(params, 'category', normalizedCategories);
      const res = await apiFetch(`/api/tenant/products/composer?${params.toString()}`, { signal });
      if (!res.ok) {
        throw new Error('Failed to fetch products');
      }

      const data = (await res.json()) as PriceListComposerData;
      return {
        products: data.products ?? [],
        facets: data.facets ?? { brands: [], categories: [] },
        total: data.total ?? 0,
        nextCursor: data.nextCursor ?? null,
      };
    },
    enabled,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function usePriceListDetail(id: string) {
  return useQuery({
    queryKey: ['price-list', id],
    queryFn: async (): Promise<{ price_list: PriceListDetail }> => {
      const res = await apiFetch(`/api/price-lists/${id}`);
      if (!res.ok) {
        throw new Error('Failed to fetch price list');
      }
      return res.json();
    },
    enabled: !!id,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function useUpdatePriceListItem(priceListId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, price }: { itemId: string; price: number }) => {
      const res = await apiFetch(`/api/price-lists/${priceListId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error((body as { error?: string }).error ?? 'Failed to update list price');
      }
      return res.json() as Promise<{ item: PriceListItem }>;
    },
    onMutate: async ({ itemId, price }) => {
      const snapshots = await takeSnapshots(queryClient, [['price-list', priceListId], ['price-list-items', priceListId]]);
      queryClient.setQueryData<{ price_list: PriceListDetail }>(['price-list', priceListId], (old) => {
        if (!old?.price_list) return old;
        return {
          price_list: {
            ...old.price_list,
            items: old.price_list.items.map((item) => (item.id === itemId ? { ...item, price } : item)),
          },
        };
      });
      queryClient.setQueryData<{ items: PriceListItem[] }>(['price-list-items', priceListId], (old) => ({
        items: (old?.items ?? []).map((item) => (item.id === itemId ? { ...item, price } : item)),
      }));
      return { snapshots };
    },
    onError: (_error, _vars, ctx) => {
      rollbackSnapshots(queryClient, ctx?.snapshots);
      toast.error(_error instanceof Error ? _error.message : 'Could not update list price');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-list', priceListId] });
      queryClient.invalidateQueries({ queryKey: ['price-list-items', priceListId] });
      queryClient.invalidateQueries({ queryKey: ['price-lists-landing'] });
      toast.success('List price updated');
    },
  });
}

export function usePriceListAction(priceListId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { action: 'duplicate' | 'extend_validity' | 'archive'; valid_to?: string }) => {
      const res = await apiFetch(`/api/price-lists/${priceListId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error((body as { error?: string }).error ?? 'Failed to update price list');
      }
      return res.json() as Promise<{ price_list: PriceList }>;
    },
    onError: (_error, _vars) => {
      toast.error(_error instanceof Error ? _error.message : 'Could not update price list');
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['price-list', priceListId] });
      queryClient.invalidateQueries({ queryKey: ['price-lists'] });
      queryClient.invalidateQueries({ queryKey: ['price-lists-landing'] });
      if (vars.action === 'duplicate') toast.success('Price list duplicated');
      if (vars.action === 'extend_validity') toast.success('Validity extended');
      if (vars.action === 'archive') toast.success('Price list archived');
    },
  });
}

export function usePriceListItems(priceListId: string) {
  return useQuery({
    queryKey: ['price-list-items', priceListId],
    queryFn: async (): Promise<{ items: PriceListItem[] }> => {
      const res = await apiFetch(`/api/price-lists/${priceListId}/items`);
      if (!res.ok) {
        throw new Error('Failed to fetch price list items');
      }
      return res.json();
    },
    enabled: !!priceListId,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function useAddPriceListItem(priceListId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PriceListItemCreateInput): Promise<{ item: PriceListItem }> => {
      const res = await apiPost(`/api/price-lists/${priceListId}/items`, data);

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error((body as { error?: string }).error ?? 'Failed to add item');
      }

      return res.json() as Promise<{ item: PriceListItem }>;
    },

    onMutate: async (data) => {
      const snapshots = await takeSnapshots(queryClient, [
        ['price-list-items', priceListId],
        ['price-list', priceListId],
      ]);
      const optimisticItem: PriceListItem = {
        id: `optimistic-${Date.now()}`,
        price_list_id: priceListId,
        tenant_product_id: data.tenant_product_id,
        price: data.price,
        min_qty: data.min_qty ?? 1,
        max_qty: data.max_qty ?? null,
      };
      queryClient.setQueryData<{ items: PriceListItem[] }>(['price-list-items', priceListId], (old) => ({
        items: [optimisticItem, ...(old?.items ?? [])],
      }));
      queryClient.setQueryData<{ price_list: PriceListDetail }>(['price-list', priceListId], (old) => {
        if (!old?.price_list) return old;
        return {
          price_list: {
            ...old.price_list,
            items: [optimisticItem, ...(old.price_list.items ?? [])],
          },
        };
      });
      return { snapshots };
    },

    onError: (_error, _data, ctx) => {
      rollbackSnapshots(queryClient, ctx?.snapshots);
      toast.error(_error instanceof Error ? _error.message : 'Could not add product');
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-list-items', priceListId] });
      queryClient.invalidateQueries({ queryKey: ['price-list', priceListId] });
      toast.success('Product added to price list');
    },
  });
}

export function useDeletePriceListItem(priceListId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (itemId: string): Promise<void> => {
      const res = await apiFetch(`/api/price-lists/${priceListId}/items/${itemId}`, {
        method: 'DELETE',
      });

      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error((body as { error?: string }).error ?? 'Failed to delete item');
      }
    },

    onMutate: async (itemId) => {
      const snapshots = await takeSnapshots(queryClient, [
        ['price-list-items', priceListId],
        ['price-list', priceListId],
      ]);
      queryClient.setQueryData<{ items: PriceListItem[] }>(['price-list-items', priceListId], (old) => ({
        items: (old?.items ?? []).filter((item) => item.id !== itemId),
      }));
      queryClient.setQueryData<{ price_list: PriceListDetail }>(['price-list', priceListId], (old) => {
        if (!old?.price_list) return old;
        return {
          price_list: {
            ...old.price_list,
            items: (old.price_list.items ?? []).filter((item) => item.id !== itemId),
          },
        };
      });
      return { snapshots };
    },

    onError: (_error, _itemId, ctx) => {
      rollbackSnapshots(queryClient, ctx?.snapshots);
      toast.error(_error instanceof Error ? _error.message : 'Could not remove item');
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-list-items', priceListId] });
      queryClient.invalidateQueries({ queryKey: ['price-list', priceListId] });
      toast.success('Item removed');
    },
  });
}

export function usePriceListAssignments(priceListId: string) {
  return useQuery({
    queryKey: ['price-list-assignments', priceListId],
    queryFn: async (): Promise<{ assignments: PriceListAssignment[] }> => {
      const res = await apiFetch(`/api/price-lists/${priceListId}/assignments`);
      if (!res.ok) {
        throw new Error('Failed to fetch assignments');
      }
      return res.json();
    },
    enabled: !!priceListId,
  });
}

export function useAddAssignment(priceListId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PriceListAssignmentInput): Promise<{ assignment: PriceListAssignment }> => {
      const res = await apiPost(`/api/price-lists/${priceListId}/assignments`, data);

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        const err = new Error((body as { error?: string }).error ?? 'Failed to add assignment');
        (err as Error & { status?: number }).status = res.status;
        throw err;
      }

      return res.json() as Promise<{ assignment: PriceListAssignment }>;
    },

    onMutate: async (data) => {
      const snapshots = await takeSnapshots(queryClient, [
        ['price-list-assignments', priceListId],
        ['price-list', priceListId],
      ]);
      const optimisticAssignment: PriceListAssignment = {
        id: `optimistic-${Date.now()}`,
        price_list_id: priceListId,
        target_type: data.target_type,
        target_id: data.target_id ?? null,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<{ assignments: PriceListAssignment[] }>(['price-list-assignments', priceListId], (old) => ({
        assignments: [optimisticAssignment, ...(old?.assignments ?? [])],
      }));
      queryClient.setQueryData<{ price_list: PriceListDetail }>(['price-list', priceListId], (old) => {
        if (!old?.price_list) return old;
        return {
          price_list: {
            ...old.price_list,
            assignments: [optimisticAssignment, ...(old.price_list.assignments ?? [])],
          },
        };
      });
      return { snapshots };
    },

    onError: (_error, _data, ctx) => {
      rollbackSnapshots(queryClient, ctx?.snapshots);
      toast.error(_error instanceof Error ? _error.message : 'Could not add assignment');
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-list-assignments', priceListId] });
      queryClient.invalidateQueries({ queryKey: ['price-list', priceListId] });
      toast.success('Assignment added');
    },
  });
}

export function useResolvePrice(tenantProductId: string, buyerId: string, qty: number = 1) {
  return useQuery({
    queryKey: ['resolve-price', tenantProductId, buyerId, qty],
    queryFn: async (): Promise<{ price: number | null }> => {
      const supabase = createClientComponentClient();
      const { data, error } = await (supabase as ReturnType<typeof createClientComponentClient> & { schema: (s: string) => ReturnType<typeof createClientComponentClient> })
        .schema('app')
        .rpc('resolve_price', {
          p_tenant_product_id: tenantProductId,
          p_buyer_id: buyerId,
          p_qty: qty,
        });
      if (error) throw error;
      return { price: data as number | null };
    },
    enabled: !!tenantProductId && !!buyerId,
    staleTime: 30_000,
  });
}

export function useTogglePriceListActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const res = await apiFetch(`/api/price-lists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to update price list');
      }
      return res.json() as Promise<{ price_list: PriceList }>;
    },
    onMutate: async ({ id, is_active }) => {
      const snapshots = await takeSnapshots(queryClient, [['price-lists'], ['price-list', id]]);
      queryClient.setQueryData<{ price_lists: PriceList[] }>(['price-lists'], (old) => ({
        price_lists: (old?.price_lists ?? []).map((priceList) =>
          priceList.id === id ? { ...priceList, is_active } : priceList,
        ),
      }));
      queryClient.setQueryData<{ price_list: PriceListDetail }>(['price-list', id], (old) => {
        if (!old?.price_list) return old;
        return {
          price_list: {
            ...old.price_list,
            is_active,
          },
        };
      });
      return { snapshots };
    },
    onError: (_error, _vars, ctx) => {
      rollbackSnapshots(queryClient, ctx?.snapshots as OptimisticSnapshot[]);
      toast.error(_error instanceof Error ? _error.message : 'Could not update price list');
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] });
      queryClient.invalidateQueries({ queryKey: ['price-list', id] });
      toast.success('Price list updated');
    },
  });
}

export function useDeleteAssignment(priceListId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assignmentId: string): Promise<void> => {
      const res = await apiFetch(
        `/api/price-lists/${priceListId}/assignments/${assignmentId}`,
        { method: 'DELETE' },
      );

      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error((body as { error?: string }).error ?? 'Failed to remove assignment');
      }
    },

    onMutate: async (assignmentId) => {
      const snapshots = await takeSnapshots(queryClient, [
        ['price-list-assignments', priceListId],
        ['price-list', priceListId],
      ]);
      queryClient.setQueryData<{ assignments: PriceListAssignment[] }>(['price-list-assignments', priceListId], (old) => ({
        assignments: (old?.assignments ?? []).filter((assignment) => assignment.id !== assignmentId),
      }));
      queryClient.setQueryData<{ price_list: PriceListDetail }>(['price-list', priceListId], (old) => {
        if (!old?.price_list) return old;
        return {
          price_list: {
            ...old.price_list,
            assignments: (old.price_list.assignments ?? []).filter((assignment) => assignment.id !== assignmentId),
          },
        };
      });
      return { snapshots };
    },

    onError: (_error, _assignmentId, ctx) => {
      rollbackSnapshots(queryClient, ctx?.snapshots);
      toast.error(_error instanceof Error ? _error.message : 'Could not remove assignment');
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-list-assignments', priceListId] });
      queryClient.invalidateQueries({ queryKey: ['price-list', priceListId] });
      toast.success('Assignment removed');
    },
  });
}
