'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

export interface BuyerMeData {
  mode: 'buyer' | 'preview';
  buyer_id: string;
  business_name: string;
  contact_name: string;
  phone: string;
  gstin: string | null;
  credit_limit: number;
  credit_used: number;
  open_orders_count: number;
  seller_preview: boolean;
  support_whatsapp_number: string | null;
  tenant: { id: string; name: string; slug: string };
  greeting_name?: string | null;
  order_features: {
    enquiries: boolean;
    sales_orders: boolean;
    invoices: boolean;
  };
  business_policy: {
    credit_enabled: boolean;
    gst_inclusive: boolean;
  };
}

export function useBuyerMe() {
  return useQuery<BuyerMeData>({
    queryKey: ['buyer-me'],
    queryFn: async () => {
      const res = await apiFetch('/api/buyer/me');
      if (!res.ok) throw new Error('Failed to fetch buyer profile');
      return res.json() as Promise<BuyerMeData>;
    },
    staleTime: 60_000,
  });
}
