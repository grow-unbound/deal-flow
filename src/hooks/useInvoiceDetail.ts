'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api-fetch';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';
import type { InvoiceDetailResponse } from '@/types/tenant-invoices';

export type InvoiceDetailApiResponse = InvoiceDetailResponse;

export function useInvoiceDetail(id: string, initialData?: InvoiceDetailApiResponse | null) {
  return useQuery({
    queryKey: ['tenant-invoice', id],
    queryFn: async (): Promise<InvoiceDetailApiResponse> => {
      const res = await apiFetch(`/api/tenant/invoices/${id}`);
      if (res.status === 404) throw new Error('Not found');
      if (res.status === 403) throw new Error('forbidden');
      if (!res.ok) throw new Error('Failed to load invoice');
      return res.json();
    },
    enabled: Boolean(id),
    initialData: initialData ?? undefined,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useSendInvoice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/tenant/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Request failed');
      }
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['tenant-invoice', id] });
      const prev = qc.getQueryData<InvoiceDetailResponse>(['tenant-invoice', id]);
      if (prev) {
        qc.setQueryData<InvoiceDetailResponse>(['tenant-invoice', id], {
          ...prev,
          db_status: 'sent',
          status: 'sent',
          sent_at: new Date().toISOString(),
        });
      }
      return { prev };
    },
    onError: (_e, _b, ctx) => {
      if (ctx?.prev) qc.setQueryData(['tenant-invoice', id], ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['tenant-invoice', id] });
      void qc.invalidateQueries({ queryKey: ['tenant-invoices'] });
      void qc.invalidateQueries({ queryKey: ['tenant-invoice-composer', id] });
    },
  });
}

export function useMarkInvoicePaid(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      amount: number;
      payment_method: string;
      payment_reference?: string | null;
      paid_at?: string;
    }) => {
      const res = await apiFetch(`/api/tenant/invoices/${id}/pay`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Request failed');
      return json as { data: { amount_paid: number; outstanding_balance: number; status: string } };
    },
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: ['tenant-invoice', id] });
      const prev = qc.getQueryData<InvoiceDetailResponse>(['tenant-invoice', id]);
      if (!prev) return { prev };
      const nextPaid = prev.amount_paid + body.amount;
      const nextOutstanding = Math.max(prev.totals.grand_total - nextPaid, 0);
      const paidFully = nextOutstanding < 0.005;
      qc.setQueryData<InvoiceDetailResponse>(['tenant-invoice', id], {
        ...prev,
        amount_paid: nextPaid,
        amount_outstanding: paidFully ? 0 : nextOutstanding,
        ...(paidFully
          ? {
              status: 'paid',
              db_status: 'paid',
              paid_at: body.paid_at ?? new Date().toISOString(),
            }
          : {}),
        payment_method: body.payment_method,
        payment_reference: body.payment_reference ?? prev.payment_reference,
      });
      return { prev };
    },
    onError: (_e, _b, ctx) => {
      if (ctx?.prev) qc.setQueryData(['tenant-invoice', id], ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['tenant-invoice', id] });
      void qc.invalidateQueries({ queryKey: ['tenant-invoices'] });
    },
  });
}

export function useVoidInvoice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/tenant/invoices/${id}/void`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Request failed');
      return json;
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['tenant-invoice', id] });
      const prev = qc.getQueryData<InvoiceDetailResponse>(['tenant-invoice', id]);
      if (prev) {
        const now = new Date().toISOString();
        qc.setQueryData<InvoiceDetailResponse>(['tenant-invoice', id], {
          ...prev,
          status: 'void',
          db_status: 'void',
          voided_at: now,
        });
      }
      return { prev };
    },
    onError: (_e, _b, ctx) => {
      if (ctx?.prev) qc.setQueryData(['tenant-invoice', id], ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['tenant-invoice', id] });
      void qc.invalidateQueries({ queryKey: ['tenant-invoices'] });
    },
  });
}

export function useSendInvoiceReminder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { message?: string }) => {
      const res = await apiFetch(`/api/tenant/invoices/${id}/remind`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Request failed');
      return json as { data: { last_reminder_at: string } };
    },
    onSuccess: (res) => {
      const prev = qc.getQueryData<InvoiceDetailResponse>(['tenant-invoice', id]);
      if (prev) {
        qc.setQueryData<InvoiceDetailResponse>(['tenant-invoice', id], {
          ...prev,
          last_reminder_at: res.data.last_reminder_at,
        });
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['tenant-invoice', id] });
    },
  });
}
