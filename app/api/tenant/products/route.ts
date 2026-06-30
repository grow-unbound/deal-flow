import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { createTimer } from '@/lib/server-timing';
import { resolveImportedProductTenantLinks } from '@/lib/server/tenant-product-source-resolution';
import { z } from 'zod';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { PAGE_SIZE } from '@/lib/pagination';
import { readArrayParam, type LandingFilterMeta } from '@/lib/landing-filter-params';

const AddProductSchema = z.object({
  master_product_id: z.string().uuid('Invalid product ID').optional().nullable(),
  internal_sku: z.string().min(1, 'Internal SKU is required'),
  name: z.string().min(1).optional(),
  mrp: z.coerce.number().positive('MRP must be positive'),
  base_selling_price: z.coerce.number().positive('Base selling price must be positive'),
  cost_price: z.coerce.number().positive().optional().nullable(),
  tenant_brand_id: z.string().uuid().optional(),
  name_override: z.string().optional(),
  default_uom: z.string().optional(),
  pack_size: z.coerce.number().positive().optional().nullable(),
  hsn_code: z.string().optional(),
  gst_rate: z.coerce.number().min(0).max(100).optional().nullable(),
  description: z.string().optional(),
  category_name: z.string().optional(),
  tenant_category_id: z.string().uuid().optional().nullable(),
  attributes: z.record(z.string()).optional().default({}),
  image_urls: z.array(z.string().url()).optional().default([]),
});

export async function GET(req: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('products_api'));
    return response;
  };
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return timedJson({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return timedJson({ error: 'Forbidden' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return timedJson({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any; // supabase client typed generically for multi-schema queries

    const reqLimit = Math.min(
      Number(req.nextUrl.searchParams.get('limit') || PAGE_SIZE.SELLER),
      PAGE_SIZE.MAX,
    );
    const search = req.nextUrl.searchParams.get('search')?.trim() || null;
    const brandId = req.nextUrl.searchParams.get('brand_id') || null;
    const brandParams = readArrayParam(req.nextUrl.searchParams, 'brand');
    const categoryParams = readArrayParam(req.nextUrl.searchParams, 'category');
    const statusParams = readArrayParam(req.nextUrl.searchParams, 'status');
    const stockParams = readArrayParam(req.nextUrl.searchParams, 'stock');

    let productsQuery = db
      .schema('app')
      .from('tenant_products')
      .select(`
        id,
        tenant_id,
        tenant_brand_id,
        tenant_category_id,
        master_product_id,
        internal_sku,
        name_override,
        mrp,
        base_selling_price,
        cost_price,
        default_uom,
        pack_size,
        image_urls,
        is_active,
        external_ref,
        created_at,
        updated_at
      `)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(reqLimit + 1); // +1 to detect hasNextPage

    if (search) {
      productsQuery = productsQuery.textSearch('search_vector', search, { type: 'websearch' });
    }
    if (brandId) {
      productsQuery = productsQuery.eq('tenant_brand_id', brandId);
    }

    const { data, error } = await productsQuery;

    if (error) {
      console.error('[GET /api/tenant/products] DB error:', error.code, error.message, error.details);
      return timedJson(
        { error: 'Failed to fetch products', code: error.code, detail: error.message },
        { status: 500 },
      );
    }

    const allProducts = data ?? [];
    const hasNextPage = allProducts.length > reqLimit;
    const pageProducts = hasNextPage ? allProducts.slice(0, reqLimit) : allProducts;
    const lastProduct = pageProducts.at(-1);
    const nextCursor = hasNextPage && lastProduct
      ? Buffer.from(JSON.stringify({ t: lastProduct.created_at, i: lastProduct.id })).toString('base64url')
      : null;

    // Fetch snapshot for total counts (O(1)) alongside enrichment queries
    const { data: snapshotRow } = await db
      .schema('app')
      .from('products_snapshot')
      .select('total_count, active_count')
      .eq('tenant_id', claims.tenant_id)
      .maybeSingle();

    // Fetch master product details for enrichment
    const masterProductIds = pageProducts
      .filter((r: { master_product_id: string | null }) => r.master_product_id)
      .map((r: { master_product_id: string }) => r.master_product_id);
    const tenantBrandIds = pageProducts
      .filter((r: { tenant_brand_id: string | null }) => r.tenant_brand_id)
      .map((r: { tenant_brand_id: string }) => r.tenant_brand_id);
    const tenantCategoryIds = pageProducts
      .filter((r: { tenant_category_id: string | null }) => r.tenant_category_id)
      .map((r: { tenant_category_id: string }) => r.tenant_category_id);

    let masterProducts: Record<
      string,
      {
        id: string;
        name: string;
        master_sku: string;
        category_name: string | null;
        image_urls: string[] | null;
        brand_id: string;
        brands: { id: string; name: string; slug: string; logo_url: string | null } | null;
      }
    > = {};
    let tenantBrands: Record<string, { id: string; display_name_override: string | null; master_brand_id: string | null }> = {};
    let tenantCategories: Record<string, { id: string; name: string | null }> = {};
    let masterBrands: Record<string, { id: string; name: string }> = {};
    let activeBrandRows: Array<{ id: string; display_name_override: string | null; master_brand_id: string | null }> = [];
    let activeCategoryRows: Array<{ id: string; name: string | null }> = [];

    if (masterProductIds.length > 0) {
      const { data: catalogProducts } = await db
        .schema('catalog')
        .from('products')
        .select('id, name, master_sku, image_urls, category_id, categories(name), brand_id, brands!inner(id, name, slug, logo_url)')
        .in('id', masterProductIds);

      masterProducts = Object.fromEntries(
        (catalogProducts ?? []).map(
          (p: {
            id: string;
            name: string;
            master_sku: string;
            image_urls: string[] | null;
            categories: { name: string } | null;
            brand_id: string;
            brands: { id: string; name: string; slug: string; logo_url: string | null } | null;
          }) => [p.id, { ...p, category_name: p.categories?.name ?? null }]
        )
      );
    }

    if (tenantBrandIds.length > 0) {
      const { data: tenantBrandsData } = await db
        .schema('app')
        .from('tenant_brands')
        .select('id, display_name_override, master_brand_id, deleted_at')
        .in('id', tenantBrandIds)
        .is('deleted_at', null);
      tenantBrands = Object.fromEntries((tenantBrandsData ?? []).map((row: { id: string }) => [row.id, row]));

      const masterBrandIds = (tenantBrandsData ?? [])
        .map((row: { master_brand_id: string | null }) => row.master_brand_id)
        .filter(Boolean);
      if (masterBrandIds.length > 0) {
        const { data: masterBrandsData } = await db
          .schema('catalog')
          .from('brands')
          .select('id, name, deleted_at')
          .in('id', masterBrandIds)
          .is('deleted_at', null);
        masterBrands = Object.fromEntries((masterBrandsData ?? []).map((row: { id: string }) => [row.id, row]));
      }
    }

    if (tenantCategoryIds.length > 0) {
      const { data: tenantCategoryRows } = await db
        .schema('app')
        .from('tenant_categories')
        .select('id, name')
        .in('id', tenantCategoryIds)
        .is('deleted_at', null);
      tenantCategories = Object.fromEntries((tenantCategoryRows ?? []).map((row: { id: string }) => [row.id, row]));
    }

    const [{ data: activeBrandsData }, { data: activeCategoriesData }] = await Promise.all([
      db
        .schema('app')
        .from('tenant_brands')
        .select('id, display_name_override, master_brand_id')
        .eq('tenant_id', claims.tenant_id)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      db
        .schema('app')
        .from('tenant_categories')
        .select('id, name')
        .eq('tenant_id', claims.tenant_id)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name', { ascending: true }),
    ]);

    activeBrandRows = (activeBrandsData ?? []) as Array<{ id: string; display_name_override: string | null; master_brand_id: string | null }>;
    activeCategoryRows = (activeCategoriesData ?? []) as Array<{ id: string; name: string | null }>;

    const productIds = pageProducts.map((row: { id: string }) => row.id);
    const inventoryByProduct = new Map<string, number>();
    const unitsMtdByProduct = new Map<string, number>();
    const gmvMtdByProduct = new Map<string, number>();
    const gmvPrevByProduct = new Map<string, number>();

    if (productIds.length > 0) {
      const { data: inventoryRows } = await db
        .schema('app')
        .from('tenant_inventory')
        .select('tenant_product_id, qty_available, deleted_at')
        .in('tenant_product_id', productIds)
        .is('deleted_at', null);
      for (const row of inventoryRows ?? []) {
        const qty = Number(row.qty_available ?? 0);
        inventoryByProduct.set(row.tenant_product_id, (inventoryByProduct.get(row.tenant_product_id) ?? 0) + qty);
      }
    }

    const period = getSellerLandingPeriodMeta(req.nextUrl.searchParams.get('period'));
    const currentStartDay = period.current_start.slice(0, 10);
    const currentEndDay = period.current_end_exclusive.slice(0, 10);
    const previousStartDay = period.previous_start.slice(0, 10);
    const previousEndDay = period.previous_end_exclusive.slice(0, 10);

    if (productIds.length > 0) {
      const [mtdKpiRes, prevKpiRes] = await Promise.all([
        db
          .schema('app')
          .from('kpi_product_daily')
          .select('tenant_product_id, units_sold, revenue')
          .eq('tenant_id', claims.tenant_id)
          .in('tenant_product_id', productIds)
          .gte('day', currentStartDay)
          .lt('day', currentEndDay)
          .is('deleted_at', null),
        db
          .schema('app')
          .from('kpi_product_daily')
          .select('tenant_product_id, revenue')
          .eq('tenant_id', claims.tenant_id)
          .in('tenant_product_id', productIds)
          .gte('day', previousStartDay)
          .lt('day', previousEndDay)
          .is('deleted_at', null),
      ]);

      for (const row of mtdKpiRes.data ?? []) {
        const units = Number(row.units_sold ?? 0);
        const revenue = Number(row.revenue ?? 0);
        unitsMtdByProduct.set(
          row.tenant_product_id,
          (unitsMtdByProduct.get(row.tenant_product_id) ?? 0) + units,
        );
        gmvMtdByProduct.set(
          row.tenant_product_id,
          (gmvMtdByProduct.get(row.tenant_product_id) ?? 0) + revenue,
        );
      }

      for (const row of prevKpiRes.data ?? []) {
        const revenue = Number(row.revenue ?? 0);
        gmvPrevByProduct.set(
          row.tenant_product_id,
          (gmvPrevByProduct.get(row.tenant_product_id) ?? 0) + revenue,
        );
      }
    }

    const role = claims.role;

    const products = pageProducts.map(
      (row: {
        id: string;
        tenant_id: string;
        tenant_brand_id: string | null;
        tenant_category_id: string | null;
        master_product_id: string | null;
        internal_sku: string;
        name_override: string | null;
        mrp: number | null;
        base_selling_price: number | null;
        cost_price: number | null;
        default_uom: string | null;
        pack_size: number | null;
        image_urls: string[] | null;
        is_active: boolean;
        external_ref: string | null;
        created_at: string;
        updated_at: string;
      }) => {
        const master = row.master_product_id ? masterProducts[row.master_product_id] : null;
        const tenantBrand = row.tenant_brand_id ? tenantBrands[row.tenant_brand_id] : null;
        const tenantCategory = row.tenant_category_id ? tenantCategories[row.tenant_category_id] : null;
        const masterBrand = tenantBrand?.master_brand_id ? masterBrands[tenantBrand.master_brand_id] : null;
        const onHand = Math.max(0, Math.round(inventoryByProduct.get(row.id) ?? 0));
        const unitsMtd = Math.max(0, Math.round(unitsMtdByProduct.get(row.id) ?? 0));
        const gmvMtd = Number(gmvMtdByProduct.get(row.id) ?? 0);
        const gmvPrev = Number(gmvPrevByProduct.get(row.id) ?? 0);
        const avgDailyUnits = period.elapsed_days > 0 ? unitsMtd / period.elapsed_days : 0;
        const computedDaysCover = onHand === 0 ? 0 : avgDailyUnits <= 0 ? 999 : Math.max(0, Math.round(onHand / avgDailyUnits));
        const growthPct = gmvPrev > 0 ? Math.round(((gmvMtd - gmvPrev) / gmvPrev) * 100) : gmvMtd > 0 ? 100 : 0;
        const statusTone = onHand === 0 ? 'danger' : computedDaysCover < 14 ? 'warning' : 'success';
        const statusLabel = onHand === 0 ? 'Out of stock' : computedDaysCover < 14 ? 'Low stock' : 'On pace';
        const brandName =
          tenantBrand?.display_name_override ??
          masterBrand?.name ??
          master?.brands?.name ??
          null;
        const enriched = {
          ...row,
          image_urls: row.image_urls?.length ? row.image_urls : (master?.image_urls ?? null),
          master_product: master ?? null,
          display_name: row.name_override ?? master?.name ?? row.internal_sku,
          brand_name: brandName,
          category_name: tenantCategory?.name ?? master?.category_name ?? 'Uncategorized',
          on_hand: onHand,
          days_cover: computedDaysCover,
          units_mtd: unitsMtd,
          gmv_mtd: gmvMtd,
          growth_pct: growthPct,
          status_label: statusLabel,
          status_tone: statusTone as 'success' | 'warning' | 'danger' | 'neutral',
        };

        // Strip cost_price for seller_assistant role
        if (role === 'seller_assistant') {
          const { cost_price: _stripped, ...rest } = enriched;
          void _stripped;
          return rest;
        }

        return enriched;
      }
    );
    const brandOptions = Array.from(
      new Set(
        activeBrandRows
          .map((row) => {
            if (row.display_name_override) return row.display_name_override;
            return row.master_brand_id ? masterBrands[row.master_brand_id]?.name ?? null : null;
          })
          .filter(Boolean) as string[],
      ),
    ).sort();
    const categoryOptions = activeCategoryRows.map((row) => row.name).filter(Boolean).sort() as string[];
    const statusOptions = ['Active', 'Inactive'];
    const filteredProducts = products.filter((row: { brand_name?: string | null; category_name?: string | null; is_active?: boolean; on_hand?: number; days_cover?: number }) => {
      const brandMatch = brandParams.length === 0 || (row.brand_name ? brandParams.includes(row.brand_name) : false);
      const categoryMatch = categoryParams.length === 0 || (row.category_name ? categoryParams.includes(row.category_name) : false);
      const statusMatch =
        statusParams.length === 0 ||
        statusParams.some((value) => {
          if (value === 'Active') return row.is_active === true;
          if (value === 'Inactive') return row.is_active === false;
          return false;
        });
      const stockMatch =
        stockParams.length === 0 ||
        stockParams.some((value) => {
          const onHand = Number(row.on_hand ?? 0);
          const daysCover = Number(row.days_cover ?? 0);
          if (value === 'Out of stock') return onHand === 0;
          if (value === 'Low stock') return onHand > 0 && daysCover < 14;
          if (value === 'In stock') return onHand > 0 && daysCover >= 14;
          return false;
        });
      return brandMatch && categoryMatch && statusMatch && stockMatch;
    });
    const revenueMtd = filteredProducts.reduce((sum: number, row: { gmv_mtd?: number }) => sum + Number(row.gmv_mtd ?? 0), 0);
    const revenuePrev = filteredProducts.reduce((sum: number, row: { id: string }) => sum + Number(gmvPrevByProduct.get(row.id) ?? 0), 0);
    const revenueGrowth = revenuePrev > 0 ? Math.round(((revenueMtd - revenuePrev) / revenuePrev) * 100) : revenueMtd > 0 ? 100 : 0;
    const activeCount = filteredProducts.filter((row: { is_active?: boolean }) => row.is_active).length;
    const outOfStock = filteredProducts.filter((row: { on_hand?: number }) => Number(row.on_hand ?? 0) === 0).length;
    const lowStock = filteredProducts.filter((row: { on_hand?: number; days_cover?: number }) => Number(row.on_hand ?? 0) > 0 && Number(row.days_cover ?? 0) < 14).length;

    const attention = filteredProducts
      .filter((row: { status_tone?: string; growth_pct?: number }) => row.status_tone === 'danger' || row.status_tone === 'warning' || Number(row.growth_pct ?? 0) < 0)
      .slice(0, 3);
    const topPerformers = [...filteredProducts]
      .sort((a, b) => Number(b.gmv_mtd ?? 0) - Number(a.gmv_mtd ?? 0))
      .slice(0, 2);
    const topRisers = [...filteredProducts]
      .sort((a, b) => Number(b.growth_pct ?? 0) - Number(a.growth_pct ?? 0))
      .slice(0, 2);

    const toReadItem = (row: any, index: number) => ({
      id: row.id,
      name: row.display_name,
      brand: row.brand_name ?? 'Unknown brand',
      brand_initials: (row.brand_name ?? 'Unknown brand')
        .split(' ')
        .map((chunk: string) => chunk[0] ?? '')
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      brand_hue: (['teal', 'ember', 'cream'][index % 3] ?? 'cream') as 'teal' | 'ember' | 'cream',
      on_hand: Number(row.on_hand ?? 0),
      days_cover: Number(row.days_cover ?? 0),
      growth_pct: Number(row.growth_pct ?? 0),
      units_mtd: Number(row.units_mtd ?? 0),
      gmv_mtd: Number(row.gmv_mtd ?? 0),
      status: {
        label: row.status_label ?? 'On pace',
        tone: row.status_tone ?? 'neutral',
      },
    });

    const filters: LandingFilterMeta = {
      groups: [
        { key: 'brand', label: 'Brand', options: brandOptions.map((value) => ({ value, label: value })) },
        { key: 'category', label: 'Category', options: categoryOptions.map((value) => ({ value, label: value })) },
        { key: 'status', label: 'Status', options: statusOptions.map((value) => ({ value, label: value })) },
        { key: 'stock', label: 'Stock', options: ['In stock', 'Low stock', 'Out of stock'].map((value) => ({ value, label: value })) },
      ],
    };
    return timedJson({
      period,
      products: filteredProducts,
      brands: brandOptions,
      filters,
      nextCursor,
      total: filteredProducts.length,
      kpis: {
        active_skus: activeCount,
        total_skus: filteredProducts.length,
        archived_skus: filteredProducts.length - activeCount,
        out_of_stock: outOfStock,
        low_stock: lowStock,
        revenue_mtd: revenueMtd,
        revenue_prev_mtd: revenuePrev,
        revenue_growth_pct: revenueGrowth,
      },
      todays_read: {
        needs_attention: attention.map(toReadItem),
        top_performers: topPerformers.map(toReadItem),
        top_risers: topRisers.map(toReadItem),
      },
    });
  } catch (err) {
    console.error('[GET /api/tenant/products] Unexpected error:', err);
    return timedJson({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const body = await req.json();
    const parsed = AddProductSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      master_product_id,
      internal_sku,
      name,
      mrp,
      base_selling_price,
      cost_price,
      tenant_brand_id: providedTenantBrandId,
      name_override,
      default_uom,
      pack_size,
      hsn_code,
      gst_rate,
      description,
      tenant_category_id,
      attributes,
      image_urls,
    } = parsed.data;

    // For custom products (master_product_id = null), tenant_brand_id is required
    if (!master_product_id && !providedTenantBrandId) {
      return NextResponse.json(
        { error: 'tenant_brand_id is required for custom products' },
        { status: 400 }
      );
    }

    // seller_assistant cannot set cost_price
    const effectiveCostPrice =
      claims.role === 'seller_assistant' ? null : (cost_price ?? null);

    const tenantId = claims.tenant_id;
    const actorUserId = claims.sub ?? claims.tenant_id;

    const db = supabaseAdmin as any; // supabase client typed generically for multi-schema queries

    // Check internal_sku uniqueness within tenant
    const { data: existing } = await db
      .schema('app')
      .from('tenant_products')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('internal_sku', internal_sku)
      .is('is_active', true)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'This SKU already exists in your product list.' },
        { status: 409 }
      );
    }

    let resolvedTenantBrandId = providedTenantBrandId ?? null;
    let resolvedTenantCategoryId = tenant_category_id ?? null;

    if (master_product_id) {
      let importedLinks: Awaited<ReturnType<typeof resolveImportedProductTenantLinks>> = null;
      try {
        importedLinks = await resolveImportedProductTenantLinks(db, tenantId, actorUserId, master_product_id, {
          tenant_brand_id: resolvedTenantBrandId,
          tenant_category_id: resolvedTenantCategoryId,
        });
      } catch (resolutionError) {
        console.error('[POST /api/tenant/products] failed to resolve imported product links:', resolutionError);
        return NextResponse.json(
          { error: 'Failed to resolve imported brand/category links' },
          { status: 500 },
        );
      }

      if (importedLinks) {
        resolvedTenantBrandId = importedLinks.tenant_brand_id;
        resolvedTenantCategoryId = importedLinks.tenant_category_id;
      }
    }

    const { data: inserted, error: insertError } = await db
      .schema('app')
      .from('tenant_products')
      .insert({
        tenant_id: tenantId,
        tenant_brand_id: resolvedTenantBrandId,
        master_product_id: master_product_id ?? null,
        internal_sku,
        name_override: name_override?.trim() || name?.trim() || null,
        mrp,
        base_selling_price,
        cost_price: effectiveCostPrice,
        default_uom: default_uom ?? null,
        pack_size: pack_size ?? null,
        hsn_code: hsn_code ?? null,
        gst_rate: gst_rate ?? null,
        description: description ?? null,
        tenant_category_id: resolvedTenantCategoryId,
        attributes_override: attributes ?? {},
        image_urls: image_urls ?? [],
        is_active: true,
        created_by: actorUserId,
        updated_by: actorUserId,
      })
      .select()
      .single();

    if (insertError) {
      // Unique constraint violation (race condition on internal_sku)
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'This SKU already exists in your product list.' },
          { status: 409 }
        );
      }
      console.error('[POST /api/tenant/products] DB error:', insertError.code, insertError.message);
      return NextResponse.json(
        { error: 'Failed to add product', code: insertError.code, detail: insertError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ product: inserted }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/tenant/products] Unexpected error:', err);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
