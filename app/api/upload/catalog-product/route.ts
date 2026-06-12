import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  UploadRouteError,
  clearCatalogProductPrimary,
  forwardUploadToWorker,
  getCatalogProductImageState,
  parseUploadFormPayload,
  productVariantUrls,
  requireCatalogRow,
  requireSellerUploadContext,
} from '@/lib/server/image-upload';
import type { ProductVariantKeySet } from '@/lib/r2-url';

export async function POST(req: NextRequest) {
  try {
    const { claims, actorId } = await requireSellerUploadContext(req);
    const { entityId, file, isPrimary } = await parseUploadFormPayload(req);

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;

    await requireCatalogRow(db, { table: 'products', id: entityId });

    const state = await getCatalogProductImageState(db, entityId);
    if (state.count >= 5) {
      return NextResponse.json({ error: 'Catalog products can have up to 5 images.' }, { status: 400 });
    }

    const effectivePrimary = state.count === 0 ? true : isPrimary;
    if (effectivePrimary) {
      await clearCatalogProductPrimary(db, entityId);
    }

    const worker = await forwardUploadToWorker({
      file,
      entityType: 'catalog_product',
      entityId,
      isPrimary: effectivePrimary,
    });

    const variants = worker.variants as unknown as ProductVariantKeySet;
    const payload = {
      product_id: entityId,
      is_primary: effectivePrimary,
      sort_order: state.nextSortOrder,
      r2_original_key: variants.original,
      r2_large_key: variants.large,
      r2_medium_key: variants.medium,
      r2_small_key: variants.small,
      r2_thumb_key: variants.thumb,
      contributed_by_tenant_id: claims.tenant_id,
      status: 'pending',
      created_by: actorId,
      updated_by: actorId,
    };

    const { data, error } = await db
      .schema('catalog')
      .from('product_images')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to save image metadata.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      entity_type: 'catalog_product',
      entity_id: entityId,
      image: data,
      variants,
      urls: productVariantUrls(variants),
    });
  } catch (error) {
    if (error instanceof UploadRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[POST /api/upload/catalog-product]', error);
    return NextResponse.json({ error: 'Image upload failed.' }, { status: 500 });
  }
}
