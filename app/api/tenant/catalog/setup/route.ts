import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { assertSellerAdmin } from '@/lib/server/seller-auth';
import {
  CatalogSetupPatchSchema,
  CatalogSetupValidationError,
  loadCatalogSetupState,
  saveCatalogSetupState,
} from '@/lib/server/catalog-setup';
import { storefrontOriginForRequest } from '@/lib/storefront-host';
import type { CatalogPricingMode } from '@/lib/server/public-catalog';

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

    const modeRaw = req.nextUrl.searchParams.get('pricing_mode') as CatalogPricingMode | null;
    const priceListId = req.nextUrl.searchParams.get('price_list_id');
    const state = await loadCatalogSetupState(supabaseAdmin, claims.tenant_id, modeRaw, priceListId);

    return NextResponse.json({
      ...state,
      storefrontHost: new URL(storefrontOriginForRequest(req.headers.get('host') ?? '', state.slug)).host,
    });
  } catch (error) {
    console.error('[GET /api/tenant/catalog/setup]', error);
    return NextResponse.json({ error: 'Failed to load catalog setup' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);
    const admin = assertSellerAdmin(claims);
    if (!admin.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: admin.status });
    }
    if (!supabaseAdmin || !claims.tenant_id || !claims.sub) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const parsed = CatalogSetupPatchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid catalog setup' }, { status: 400 });
    }

    const result = await saveCatalogSetupState(supabaseAdmin, {
      tenantId: claims.tenant_id,
      actorId: claims.sub,
      patch: parsed.data,
    });

    const state = await loadCatalogSetupState(supabaseAdmin, claims.tenant_id);
    return NextResponse.json({
      ok: true,
      slug: result.slug ?? state.slug,
      storefront_url: storefrontOriginForRequest(req.headers.get('host') ?? '', result.slug ?? state.slug),
      state,
    });
  } catch (error) {
    if (error instanceof CatalogSetupValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[PATCH /api/tenant/catalog/setup]', error);
    return NextResponse.json({ error: 'Failed to save catalog setup' }, { status: 500 });
  }
}
