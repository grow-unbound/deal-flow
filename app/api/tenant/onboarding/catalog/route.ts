import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { assertSellerAdmin } from '@/lib/server/seller-auth';
import { loadOnboardingCatalogSummary, loadOnboardingPreview } from '@/lib/server/onboarding-catalog-preview';
import { storefrontOriginForRequest } from '@/lib/storefront-host';
import type { CatalogPricingMode } from '@/lib/server/public-catalog';
import { CatalogSetupValidationError, saveCatalogSetupState } from '@/lib/server/catalog-setup';

const PreviewQuerySchema = z.enum(['hidden_until_login', 'hide_price_collect_enquiry', 'base_selling_rate', 'assigned_price_list']).optional();

export async function GET(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);
    const admin = assertSellerAdmin(claims);
    if (!admin.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: admin.status });
    }
    if (!supabaseAdmin || !claims.tenant_id) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const url = new URL(req.url);
    if (url.searchParams.get('summary') === '1') {
      const summary = await loadOnboardingCatalogSummary(supabaseAdmin, claims.tenant_id);
      return NextResponse.json(summary);
    }
    const modeRaw = url.searchParams.get('pricing_mode');
    const modeParsed = PreviewQuerySchema.safeParse(modeRaw || undefined);
    const pricingMode = (modeParsed.success ? modeParsed.data : undefined) ?? null;
    const priceListId = url.searchParams.get('price_list_id');

    const preview = await loadOnboardingPreview(
      supabaseAdmin,
      claims.tenant_id,
      pricingMode,
      priceListId,
    );

    return NextResponse.json({
      ...preview,
      storefrontHost: new URL(storefrontOriginForRequest(req.headers.get('host') ?? '', preview.slug)).host,
    });
  } catch (error) {
    console.error('[GET /api/tenant/onboarding/catalog]', error);
    return NextResponse.json({ error: 'Failed to load catalog preview' }, { status: 500 });
  }
}

const PublishSchema = z.object({
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  pricing_mode: z.enum(['hidden_until_login', 'hide_price_collect_enquiry', 'base_selling_rate', 'assigned_price_list']),
  price_list_id: z.string().uuid().nullable().optional(),
  access_mode: z.enum(['public_link', 'approved_buyers_only']).optional(),
  collect_target_unit_price_range: z.boolean().optional(),
  product_display_mode: z.enum(['sku_list', 'group_variants']).optional(),
  settings: z.record(z.unknown()).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);
    const admin = assertSellerAdmin(claims);
    if (!admin.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: admin.status });
    }
    if (!supabaseAdmin || !claims.tenant_id) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const parsed = PublishSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Choose a pricing mode and a valid slug' }, { status: 400 });
    }

    const actorId = claims.sub ?? claims.tenant_id;
    const result = await saveCatalogSetupState(supabaseAdmin, {
      tenantId: claims.tenant_id,
      actorId,
      patch: {
        ...parsed.data,
        settings: parsed.data.settings,
        publish: true,
      },
    });
    const slug = result.slug ?? parsed.data.slug;

    return NextResponse.json({
      ok: true,
      slug,
      storefront_url: storefrontOriginForRequest(req.headers.get('host') ?? '', slug),
    });
  } catch (error) {
    if (error instanceof CatalogSetupValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[PATCH /api/tenant/onboarding/catalog]', error);
    return NextResponse.json({ error: 'Failed to publish catalog' }, { status: 500 });
  }
}
