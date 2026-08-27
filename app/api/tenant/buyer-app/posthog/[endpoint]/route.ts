import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const POSTHOG_BASE = 'https://us.posthog.com';
const POSTHOG_PROJECT_ID = '370765';

// Endpoints that accept a tenant_id variable for server-side filtering.
// products-added-to-cart used to be filtered client-side by label prefix
// instead (no tenant_id variable sent), which meant it never matched
// anything and the card always came back empty -- scope it the same way as
// products-viewed.
const TENANT_FILTERED_ENDPOINTS = new Set(['wau', 'products-viewed', 'products-added-to-cart', 'cart-submits']);
const ALLOWED_ENDPOINTS = TENANT_FILTERED_ENDPOINTS;

interface ProductSummaryRow {
  tenant_product_id: string;
  product_name: string;
  sku: string | null;
  brand_name: string | null;
  category_name: string | null;
  image_urls: string[] | null;
}

/** Enrich raw {tenant_product_id, product_name (== id placeholder), ...count} rows with real product data. */
async function enrichWithProductSummary<T extends { tenant_product_id: string; product_name: string }>(
  rows: T[],
  tenantId: string,
): Promise<T[]> {
  if (!rows.length || !supabaseAdmin) return rows;

  const ids = rows.map((r) => r.tenant_product_id);
  const { data, error } = await (supabaseAdmin as any)
    .schema('app')
    .rpc('get_tenant_products_summary', { p_tenant_id: tenantId, p_tenant_product_ids: ids });

  if (error) {
    console.error('[buyer-app/posthog] get_tenant_products_summary failed', error);
    return rows;
  }

  const bySummary = new Map<string, ProductSummaryRow>((data as ProductSummaryRow[]).map((row) => [row.tenant_product_id, row]));
  return rows.map((row) => {
    const summary = bySummary.get(row.tenant_product_id);
    if (!summary) return row;
    return {
      ...row,
      product_name: summary.product_name,
      sku: summary.sku,
      brand_name: summary.brand_name,
      category_name: summary.category_name,
      image_urls: summary.image_urls,
    };
  });
}

/** PostHog Trends-style response series */
interface PhTrendSeries {
  data: number[];
  days: string[];
  labels: string[];
  label?: string;
  aggregated_value?: number;
}

interface PhResponse {
  results: PhTrendSeries[];
}

/**
 * Transform WAU Trends response → { week, count }[]
 * results[0].days = ISO week-start dates, results[0].data = buyer counts
 */
function transformWau(raw: PhResponse): { week: string; count: number }[] {
  const series = raw.results?.[0];
  if (!series) return [];
  return (series.days ?? series.labels ?? []).map((week, i) => ({
    week,
    count: Math.round(series.data[i] ?? 0),
  }));
}

/**
 * Transform Trends breakdown response (label = "{tenant_id}::{product_id}") → ranked list.
 * Already filtered by tenant prefix (for all-tenant endpoints) or just mapped (for tenant-scoped).
 */
function transformProductsList(
  raw: PhResponse,
  tenantId: string,
  countField: 'view_count' | 'add_count',
): { tenant_product_id: string; product_name: string; [k: string]: unknown }[] {
  return raw.results
    .filter((r) => r.label?.startsWith(`${tenantId}::`))
    .map((r) => {
      const [, ...rest] = (r.label ?? '::').split('::');
      const productRef = rest.join('::');
      return {
        tenant_product_id: productRef,
        product_name: productRef,
        [countField]: r.aggregated_value ?? 0,
      };
    })
    .sort((a, b) => Number(b[countField]) - Number(a[countField]));
}

/**
 * Transform cart-submits Trends response → { week, value, count }[]
 * Expects two series: one for value, one for count (or a single series for count).
 */
function transformCartSubmits(raw: PhResponse): { week: string; value: number; count: number }[] {
  if (!raw.results?.length) return [];

  // If two series: first = value, second = count (or vice versa — match by label)
  const valueSeries = raw.results.find(
    (r) => r.label?.toLowerCase().includes('value') || raw.results.indexOf(r) === 0,
  );
  const countSeries = raw.results.find(
    (r) => r.label?.toLowerCase().includes('count') || raw.results.indexOf(r) === 1,
  ) ?? raw.results[0];

  const days = valueSeries?.days ?? countSeries?.days ?? [];
  return days.map((week, i) => ({
    week,
    value: Math.round((valueSeries?.data[i] ?? 0) * 100) / 100,
    count: Math.round(countSeries?.data[i] ?? 0),
  }));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ endpoint: string }> },
) {
  const { endpoint } = await params;

  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return NextResponse.json({ error: 'Unknown endpoint' }, { status: 404 });
  }

  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!apiKey) {
    console.error('[buyer-app/posthog] POSTHOG_PERSONAL_API_KEY not configured');
    return NextResponse.json({ error: 'Analytics not configured' }, { status: 503 });
  }

  const body = TENANT_FILTERED_ENDPOINTS.has(endpoint)
    ? { variables: { tenant_id: claims.tenant_id } }
    : {};

  try {
    const phRes = await fetch(
      `${POSTHOG_BASE}/api/projects/${POSTHOG_PROJECT_ID}/endpoints/${endpoint}/run`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (!phRes.ok) {
      const text = await phRes.text().catch(() => '');
      console.error(`[buyer-app/posthog/${endpoint}] PostHog error ${phRes.status}:`, text);
      return NextResponse.json({ error: 'Analytics fetch failed' }, { status: 502 });
    }

    const raw = (await phRes.json()) as PhResponse;

    switch (endpoint) {
      case 'wau':
        return NextResponse.json(transformWau(raw));
      case 'products-viewed':
        return NextResponse.json(
          await enrichWithProductSummary(transformProductsList(raw, claims.tenant_id, 'view_count'), claims.tenant_id),
        );
      case 'products-added-to-cart':
        return NextResponse.json(
          await enrichWithProductSummary(transformProductsList(raw, claims.tenant_id, 'add_count'), claims.tenant_id),
        );
      case 'cart-submits':
        return NextResponse.json(transformCartSubmits(raw));
      default:
        return NextResponse.json(raw);
    }
  } catch (err) {
    console.error(`[buyer-app/posthog/${endpoint}] unexpected error`, err);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
