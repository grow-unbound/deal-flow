'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

export type CatalogDisplayStatus = 'Live' | 'Draft' | 'Ended';
export type CatalogStatusTone = 'success' | 'warning' | 'neutral';
export type CatalogAvatarHue = 'teal' | 'ember' | 'cream';

export interface CatalogLandingRow {
  id: string;
  name: string;
  initials: string;
  hue: CatalogAvatarHue;
  status: {
    value: 'draft' | 'published' | 'archived';
    label: CatalogDisplayStatus;
    tone: CatalogStatusTone;
  };
  cohort_name: string;
  products_count: number;
  brands_count: number;
  gmv: number;
  orders: number;
  views: number;
  conversion_pct: number;
  valid_from: string;
  valid_to: string | null;
  valid_until_label: string;
  days_left: number | null;
  created_at: string;
  growth_pct: number;
}

export interface CatalogsLandingResponse {
  kpis: {
    live_catalogs: number;
    draft_catalogs: number;
    ended_catalogs: number;
    gmv_mtd: number;
    gmv_prev_mtd: number;
    gmv_growth_pct: number;
    avg_conversion_pct: number;
    orders_attributed_mtd: number;
  };
  todays_read: {
    needs_attention: CatalogLandingRow[];
    top_performers: CatalogLandingRow[];
    top_risers: CatalogLandingRow[];
  };
  catalogs: CatalogLandingRow[];
}

export function useTenantCatalogs() {
  return useQuery({
    queryKey: ['tenant-catalogs'],
    queryFn: async (): Promise<CatalogsLandingResponse> => {
      const res = await apiFetch('/api/tenant/catalogs');
      if (!res.ok) throw new Error('Failed to fetch catalogs');
      return res.json();
    },
  });
}
