import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  UploadRouteError,
  forwardUploadToWorker,
  mediaVariantUrls,
  parseUploadFormPayload,
  requireSellerUploadContext,
  requireTenantOwnedRow,
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
    await requireTenantOwnedRow(db, {
      schema: 'app',
      table: 'tenant_categories',
      tenantId: claims.tenant_id,
      id: entityId,
    });

    const normalizedType = imageType === 'banner' ? 'banner' : 'icon';
    const worker = await forwardUploadToWorker({
      file,
      entityType: 'tenant_category',
      entityId,
      tenantId: claims.tenant_id,
    });

    const variants = worker.variants as unknown as MediaVariantKeySet;
    const { data: existing, error: existingError } = await db
      .schema('app')
      .from('tenant_category_images')
      .select('id')
      .eq('tenant_category_id', entityId)
      .eq('image_type', normalizedType)
      .eq('is_primary', true)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: 'Failed to inspect existing images.' }, { status: 500 });
    }

    const payload = {
      tenant_category_id: entityId,
      image_type: normalizedType,
      is_primary: true,
      sort_order: 0,
      r2_original_key: variants.original,
      r2_medium_key: variants.medium,
      r2_thumb_key: variants.thumb,
      status: 'approved',
      created_by: actorId,
      updated_by: actorId,
    };

    const query = existing
      ? db
          .schema('app')
          .from('tenant_category_images')
          .update({
            r2_original_key: variants.original,
            r2_medium_key: variants.medium,
            r2_thumb_key: variants.thumb,
            status: 'approved',
            updated_by: actorId,
          })
          .eq('id', existing.id)
      : db.schema('app').from('tenant_category_images').insert(payload);

    const { data, error } = await query.select('*').single();

    if (error) {
      return NextResponse.json({ error: 'Failed to save image metadata.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      entity_type: 'tenant_category',
      entity_id: entityId,
      image: data,
      variants,
      urls: mediaVariantUrls(variants),
    });
  } catch (error) {
    if (error instanceof UploadRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[POST /api/upload/tenant-category]', error);
    return NextResponse.json({ error: 'Image upload failed.' }, { status: 500 });
  }
}
