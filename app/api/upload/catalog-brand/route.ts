import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  UploadRouteError,
  forwardUploadToWorker,
  mediaVariantUrls,
  parseUploadFormPayload,
  requireCatalogRow,
  requireSellerUploadContext,
} from '@/lib/server/image-upload';
import type { MediaVariantKeySet } from '@/lib/r2-url';

export async function POST(req: NextRequest) {
  try {
    const { claims, actorId } = await requireSellerUploadContext(req);
    const { entityId, file, imageType } = await parseUploadFormPayload(req);

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;
    await requireCatalogRow(db, { table: 'brands', id: entityId });

    const worker = await forwardUploadToWorker({
      file,
      entityType: 'catalog_brand',
      entityId,
    });

    const variants = worker.variants as unknown as MediaVariantKeySet;
    const payload = {
      brand_id: entityId,
      image_type: imageType === 'banner' ? 'banner' : 'logo',
      r2_original_key: variants.original,
      r2_medium_key: variants.medium,
      r2_thumb_key: variants.thumb,
      contributed_by_tenant_id: claims.tenant_id,
      status: 'pending',
      created_by: actorId,
      updated_by: actorId,
    };

    const { data, error } = await db
      .schema('catalog')
      .from('brand_images')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to save image metadata.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      entity_type: 'catalog_brand',
      entity_id: entityId,
      image: data,
      variants,
      urls: mediaVariantUrls(variants),
    });
  } catch (error) {
    if (error instanceof UploadRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[POST /api/upload/catalog-brand]', error);
    return NextResponse.json({ error: 'Image upload failed.' }, { status: 500 });
  }
}
