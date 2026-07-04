'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
}

export interface WhatsAppBroadcastHistoryRow {
  id: string;
  name: string;
  use_case: string;
  target_type: WhatsAppBroadcastTargetType;
  status: string;
  scheduled_for: string | null;
  estimated_recipient_count: number | null;
  actual_recipient_count: number | null;
  created_at: string;
}

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
      if (res.status === 403) return [];
      if (!res.ok) throw new Error('Failed to fetch WhatsApp templates');
      const data = (await res.json()) as { templates: WhatsAppTemplateOption[] };
      return data.templates;
    },
    enabled,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useWhatsAppBroadcastHistory(enabled = true) {
  return useQuery({
    queryKey: ['whatsapp-broadcast-history'],
    queryFn: async (): Promise<WhatsAppBroadcastHistoryRow[]> => {
      const res = await apiFetch('/api/whatsapp/broadcasts');
      if (res.status === 403) return [];
      if (!res.ok) throw new Error('Failed to fetch broadcast history');
      const data = (await res.json()) as { broadcasts: WhatsAppBroadcastHistoryRow[] };
      return data.broadcasts;
    },
    enabled,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
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
      queryClient.invalidateQueries({ queryKey: ['whatsapp-broadcast-history'] });
      toast.success('Broadcast scheduled');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create broadcast');
    },
  });
}
