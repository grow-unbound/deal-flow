'use client';

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch, apiPost } from '@/lib/api-fetch';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';
import type { WhatsAppBroadcastCreateInput, WhatsAppBroadcastTargetType } from '@/lib/zod';
import type { WhatsAppQualityRatingState } from '@/constants/whatsapp-quality-banner';

export interface WhatsAppTemplateOption {
  id: string;
  meta_template_name: string;
  meta_category: 'marketing' | 'utility' | 'authentication';
  use_case: string;
  body: string;
  variables: Array<{ key: string; description?: string }>;
  approval_status: 'pending' | 'approved' | 'rejected' | 'disabled';
  is_broadcast_template: boolean;
}

export interface ManageBroadcastRow {
  id: string;
  name: string;
  use_case: string;
  target_type: WhatsAppBroadcastTargetType;
  status: string;
  scheduled_for: string | null;
  estimated_recipient_count: number | null;
  actual_recipient_count: number | null;
  created_at: string;
  display_at: string;
  template_name: string | null;
  target_label: string;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  total_count: number;
}

export interface BroadcastKpis {
  total_broadcasts: number;
  delivered_this_month: number;
  scheduled_count: number;
  success_rate_pct: number;
  sent_this_month: number;
}

export interface BroadcastsPageResponse {
  kpis: BroadcastKpis;
  broadcasts: ManageBroadcastRow[];
  total: number;
  next_offset: number | null;
  limit: number;
  offset: number;
}

export type BroadcastSortOption = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc';

export interface BroadcastsListParams {
  q?: string;
  status?: string;
  sort?: BroadcastSortOption;
  limit: number;
}

type BroadcastsInfiniteData = InfiniteData<BroadcastsPageResponse, number>;

const BROADCASTS_QUERY_KEY = ['whatsapp-broadcasts'] as const;
const BROADCASTS_LIST_QUERY_KEY = [...BROADCASTS_QUERY_KEY, 'list'] as const;

export interface AudiencePreviewInput {
  target_type: WhatsAppBroadcastTargetType;
  target_cohort_id?: string | null;
  target_filter?: Record<string, string | number> | null;
  target_buyer_ids?: string[] | null;
  meta_category?: 'marketing' | 'utility' | 'authentication';
}

export interface AudiencePreviewResponse {
  recipient_count: number;
  opted_out_excluded: number;
  credits_per_message: number;
  estimated_credits: number;
  estimated_inr: number;
}

export interface WhatsAppPlatformStatus {
  broadcast_sending_paused: boolean;
  quality_rating_state: WhatsAppQualityRatingState;
}

export interface BroadcastCampaignOption {
  id: string;
  name: string;
  share_token: string | null;
}

/**
 * Phase F — read-only platform kill-switch / quality-rating status, used to
 * pick the right composer banner copy (§7.3). Polled lightly (short stale
 * time) since a Yellow/Red transition should surface to an open composer
 * without requiring a full page reload.
 */
export function useWhatsAppPlatformStatus(enabled = true) {
  return useQuery({
    queryKey: ['whatsapp-platform-status'],
    queryFn: async (): Promise<WhatsAppPlatformStatus> => {
      const res = await apiFetch('/api/whatsapp/platform-status');
      if (res.status === 403) return { broadcast_sending_paused: false, quality_rating_state: 'green' };
      if (!res.ok) throw new Error('Failed to fetch WhatsApp platform status');
      return res.json();
    },
    enabled,
    staleTime: 60_000,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useWhatsAppTemplates(enabled = true) {
  return useQuery({
    queryKey: ['whatsapp-templates'],
    queryFn: async (): Promise<WhatsAppTemplateOption[]> => {
      const res = await apiFetch('/api/whatsapp/templates');
      if (!res.ok) throw new Error('Failed to fetch WhatsApp templates');
      const data = (await res.json()) as { templates: WhatsAppTemplateOption[] };
      return data.templates;
    },
    enabled,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useBroadcastCampaignOptions(enabled = true) {
  return useQuery({
    queryKey: ['whatsapp-broadcast-campaign-options'],
    queryFn: async (): Promise<BroadcastCampaignOption[]> => {
      const res = await apiFetch('/api/whatsapp/broadcasts/campaign-options');
      if (!res.ok) throw new Error('Failed to fetch campaign options');
      const data = (await res.json()) as { campaigns: BroadcastCampaignOption[] };
      return data.campaigns;
    },
    enabled,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useWhatsAppBroadcastsInfinite(
  params: BroadcastsListParams,
  initialData?: BroadcastsPageResponse | null,
) {
  const q = params.q?.trim() ?? '';
  const status = params.status ?? 'all';
  const sort = params.sort ?? 'date_desc';
  const queryParams = { q, status, sort, limit: params.limit };
  const canUseInitialData =
    q === ''
    && status === 'all'
    && sort === 'date_desc'
    && (initialData?.limit == null || initialData.limit === params.limit)
    && (initialData?.offset == null || initialData.offset === 0);

  return useInfiniteQuery<
    BroadcastsPageResponse,
    Error,
    BroadcastsInfiniteData,
    readonly unknown[],
    number
  >({
    queryKey: [...BROADCASTS_LIST_QUERY_KEY, queryParams],
    queryFn: async ({ pageParam }) => {
      const searchParams = new URLSearchParams({
        limit: String(params.limit),
        offset: String(pageParam),
        status,
        sort,
      });
      if (q) searchParams.set('q', q);

      const res = await apiFetch(`/api/whatsapp/broadcasts?${searchParams.toString()}`);
      if (res.status === 403) {
        return {
          kpis: {
            total_broadcasts: 0,
            delivered_this_month: 0,
            scheduled_count: 0,
            success_rate_pct: 0,
            sent_this_month: 0,
          },
          broadcasts: [],
          total: 0,
          next_offset: null,
          limit: params.limit,
          offset: pageParam,
        };
      }
      if (!res.ok) throw new Error('Failed to fetch broadcasts');
      return res.json() as Promise<BroadcastsPageResponse>;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.next_offset,
    initialData: canUseInitialData && initialData
      ? { pages: [initialData], pageParams: [0] }
      : undefined,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    placeholderData: keepPreviousData,
  });
}

export function useAudiencePreview() {
  return useMutation({
    mutationFn: async (input: AudiencePreviewInput): Promise<AudiencePreviewResponse> => {
      const res = await apiPost('/api/whatsapp/broadcasts/audience-preview', input);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to preview audience');
      }
      return res.json();
    },
  });
}

export function useCreateWhatsAppBroadcast() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: WhatsAppBroadcastCreateInput) => {
      const res = await apiPost('/api/whatsapp/broadcasts', input);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to create broadcast');
      }
      return res.json() as Promise<{
        broadcast: { id: string; name: string; status: string; estimated_recipient_count: number };
        recipient_count: number;
        note: string;
      }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BROADCASTS_QUERY_KEY });
      toast.success('Broadcast queued');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create broadcast');
    },
  });
}
