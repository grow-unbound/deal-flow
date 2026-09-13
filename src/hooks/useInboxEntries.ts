'use client';

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiFetch, apiPost } from '@/lib/api-fetch';
import { NAVIGATION_QUERY_STALE_TIME, NAVIGATION_QUERY_GC_TIME } from '@/lib/query-navigation';
import type { InboxEntry } from '@/lib/inbox/inbox-types';

export interface EntryHistoryEvent {
  id: string;
  entry_id: string;
  entry_type: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  actor_id: string | null;
  created_at: string;
}

export function inboxEntriesQueryKey(status: 'active' | 'resolved', entryTypes?: string[]) {
  return ['inbox-entries', status, (entryTypes ?? []).join(',')] as const;
}

export function useInboxEntries(status: 'active' | 'resolved', entryTypes?: string[]) {
  return useQuery({
    queryKey: inboxEntriesQueryKey(status, entryTypes),
    queryFn: async () => {
      const params = new URLSearchParams({ status });
      if (entryTypes && entryTypes.length > 0) params.set('type', entryTypes.join(','));
      const res = await apiFetch(`/api/tenant/entries?${params.toString()}`, { fresh: true });
      if (!res.ok) throw new Error('Failed to load Inbox entries');
      return (await res.json()) as { entries: InboxEntry[]; nextCursor: string | null };
    },
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    placeholderData: keepPreviousData,
  });
}

interface GenericActionInput {
  entryId: string;
  action: 'remind_later' | 'add_note' | 'dismiss' | 'reopen';
  note?: string;
  remind_at?: string;
}

export function useApplyGenericEntryAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ entryId, ...body }: GenericActionInput) => {
      const res = await apiPost(`/api/tenant/entries/${entryId}/actions`, body);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? 'Failed to update entry');
      }
      const payload = (await res.json()) as { data: InboxEntry };
      return payload.data;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox-entries'] });
      queryClient.invalidateQueries({ queryKey: ['inbox-entry-history'] });
    },
  });
}

export interface EntryDocument {
  id: string;
  doc_type: 'shop_image' | 'gst_certificate';
  subject_scope: 'personal' | 'business';
  uploaded_at: string;
  verified: boolean;
}

export function useEntryDocuments(entryId: string) {
  return useQuery({
    queryKey: ['inbox-entry-documents', entryId],
    queryFn: async () => {
      const res = await apiFetch(`/api/tenant/entries/${entryId}/documents`, { fresh: true });
      if (!res.ok) throw new Error('Failed to load documents');
      return (await res.json()) as { documents: EntryDocument[] };
    },
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

/**
 * Mints a fresh signed download URL for one document. Deliberately not a
 * cached query — the URL is short-lived, so this is called imperatively
 * right when the seller opens the preview dialog or clicks Download, never
 * prefetched or reused (Yukti_Public-Signup_Frontend-Spec_v1.md §6/§1.2).
 */
export async function fetchDocumentSignedUrl(
  entryId: string,
  docId: string,
): Promise<{ url: string; doc_type: string }> {
  const res = await apiFetch(`/api/tenant/entries/${entryId}/documents/${docId}/signed-url`, { fresh: true });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error ?? 'Failed to load document');
  }
  return (await res.json()) as { url: string; doc_type: string };
}

interface ApprovalActionInput {
  entryId: string;
  action: 'approve' | 'decline' | 'request_more_info';
  note?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Approve / decline / request-more-info on a `business_approval` /
 * `new_user_login` entry — calls the same POST .../actions route as the
 * generic mutation above, but for the approval-specific action set that
 * requires richer client-side UI (document review, a missing-fields
 * checklist, a decline confirmation) rather than the bare one-click generic
 * actions.
 */
export function useApplyApprovalEntryAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ entryId, ...body }: ApprovalActionInput) => {
      const res = await apiPost(`/api/tenant/entries/${entryId}/actions`, body);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? 'Failed to update entry');
      }
      const payload = (await res.json()) as { data: InboxEntry };
      return payload.data;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox-entries'] });
      queryClient.invalidateQueries({ queryKey: ['inbox-entry-history'] });
    },
  });
}

export function useEntryHistory(buyerId: string | null) {
  return useQuery({
    queryKey: ['inbox-entry-history', buyerId],
    queryFn: async () => {
      const res = await apiFetch(`/api/tenant/entries/buyer/${buyerId}/events`, { fresh: true });
      if (!res.ok) throw new Error('Failed to load history');
      return (await res.json()) as { events: EntryHistoryEvent[] };
    },
    enabled: buyerId != null,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useInboxActiveCount() {
  return useQuery({
    queryKey: ['inbox-active-count'],
    queryFn: async () => {
      const res = await apiFetch('/api/tenant/entries/count', { fresh: true });
      if (!res.ok) throw new Error('Failed to load count');
      return (await res.json()) as { count: number };
    },
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}
