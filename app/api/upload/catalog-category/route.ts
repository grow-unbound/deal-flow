import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  UploadRouteError,
  mediaVariantUrls,
  parseVariantKeysPayload,
  requireCatalogRow,
  requireSellerUploadContext,
} from '@/lib/server/image-upload';
import type { MediaVariantKeySet } from '@/lib/r2-url';

export async function POST(req: NextRequest) {
  try {
    const { actorId } = await requireSellerUploadContext(req);
    const { entityId, variants, imageType } = await parseVariantKeysPayload(req);

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;
    await requireCatalogRow(db, { table: 'categories', id: entityId });

    const keys = variants as unknown as MediaVariantKeySet;
    const payload = {
      category_id: entityId,
      image_type: imageType === 'banner' ? 'banner' : 'icon',
      r2_original_key: keys.original,
      r2_medium_key: keys.medium,
      r2_thumb_key: keys.thumb,
      status: 'pending',
      created_by: actorId,
      updated_by: actorId,
    };

    const { data, error } = await db
      .schema('catalog')
      .from('category_images')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to save image metadata.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      entity_type: 'catalog_category',
      entity_id: entityId,
      image: data,
      variants: keys,
      urls: mediaVariantUrls(keys),
    });
  } catch (error) {
    if (error instanceof UploadRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[POST /api/upload/catalog-category]', error);
    return NextResponse.json({ error: 'Image upload failed.' }, { status: 500 });
  }
}
