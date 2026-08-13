'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { BUYER_REFERENCE_QUERY_STALE_TIME, BUYER_REFERENCE_QUERY_GC_TIME } from '@/lib/query-navigation';

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
  tenant: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    outlets: Array<{
      location_id: string;
      name: string;
      is_default: boolean;
      city: string;
      state: string;
      pincode: string;
      formatted_address: string;
      lat: number | null;
      lng: number | null;
      warehouse_id: string;
      warehouse_name: string;
    }>;
  };
  greeting_name?: string | null;
  order_features: {
    enquiries: boolean;
    sales_orders: boolean;
    invoices: boolean;
    create_enquiries: boolean;
    create_sales_orders: boolean;
  };
  business_policy: {
    credit_enabled: boolean;
    gst_inclusive: boolean;
    gst_rate: number;
  };
  stock_visibility: {
    enabled: boolean;
    block_order_on_oos: boolean;
  };
  whatsapp_consent_required: boolean;
}

export function useBuyerMe() {
  return useQuery<BuyerMeData>({
    queryKey: ['buyer-me'],
    queryFn: async () => {
      const res = await apiFetch('/api/buyer/me');
      if (!res.ok) throw new Error('Failed to fetch buyer profile');
      return res.json() as Promise<BuyerMeData>;
    },
    staleTime: BUYER_REFERENCE_QUERY_STALE_TIME,
    gcTime: BUYER_REFERENCE_QUERY_GC_TIME,
  });
}
