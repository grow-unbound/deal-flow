import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { assertSellerAdmin } from '@/lib/server/seller-auth';
import { loadOnboardingCatalogSummary, loadOnboardingPreview } from '@/lib/server/onboarding-catalog-preview';
import { isReservedStorefrontLabel, storefrontOriginForRequest } from '@/lib/storefront-host';
import { onboardingSlugify } from '@/lib/onboarding/slugify';
import type { CatalogPricingMode } from '@/lib/server/public-catalog';
import { revalidatePublicCatalogCache } from '@/lib/server/public-catalog-cache';

const PreviewQuerySchema = z.enum(['hidden_until_login', 'base_selling_rate', 'assigned_price_list']).optional();

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
      storefrontHost: `${preview.slug}.useyukti.in`,
    });
  } catch (error) {
    console.error('[GET /api/tenant/onboarding/catalog]', error);
    return NextResponse.json({ error: 'Failed to load catalog preview' }, { status: 500 });
  }
}

const PublishSchema = z.object({
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  pricing_mode: z.enum(['hidden_until_login', 'base_selling_rate', 'assigned_price_list']),
  price_list_id: z.string().uuid().nullable().optional(),
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

    const slug = onboardingSlugify(parsed.data.slug);
    if (!slug || isReservedStorefrontLabel(slug)) {
      return NextResponse.json({ error: 'That slug is reserved' }, { status: 400 });
    }
    if (parsed.data.pricing_mode === 'assigned_price_list' && !parsed.data.price_list_id) {
      return NextResponse.json({ error: 'Pick a price list' }, { status: 400 });
    }

    const { data: slugTaken } = await supabaseAdmin
      .schema('app')
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .neq('id', claims.tenant_id)
      .maybeSingle();
    if (slugTaken) {
      return NextResponse.json({ error: 'That catalog link is already taken' }, { status: 409 });
    }

    const actorId = claims.sub ?? claims.tenant_id;
    const { error: slugError } = await supabaseAdmin
      .schema('app')
      .from('tenants')
      .update({ slug, updated_at: new Date().toISOString(), updated_by: actorId })
      .eq('id', claims.tenant_id);
    if (slugError) {
      return NextResponse.json({ error: slugError.message }, { status: 500 });
    }

    const pricingMode = parsed.data.pricing_mode as CatalogPricingMode;
    const { data: catalogRows, error: catalogError } = await supabaseAdmin
      .schema('app')
      .from('catalogs')
      .update({
        pricing_mode: pricingMode,
        price_list_id: pricingMode === 'assigned_price_list' ? parsed.data.price_list_id : null,
        live_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: actorId,
      })
      .eq('tenant_id', claims.tenant_id)
      .eq('kind', 'public')
      .is('deleted_at', null)
      .select('id');

    if (catalogError) {
      return NextResponse.json({ error: catalogError.message }, { status: 500 });
    }
    if (!catalogRows?.length) {
      return NextResponse.json({ error: 'Public catalog row missing' }, { status: 500 });
    }

    revalidatePublicCatalogCache(claims.tenant_id);

    return NextResponse.json({
      ok: true,
      slug,
      storefront_url: storefrontOriginForRequest(req.headers.get('host') ?? '', slug),
    });
  } catch (error) {
    console.error('[PATCH /api/tenant/onboarding/catalog]', error);
    return NextResponse.json({ error: 'Failed to publish catalog' }, { status: 500 });
  }
}
