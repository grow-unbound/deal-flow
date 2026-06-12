import { NextRequest, NextResponse } from 'next/server';
import { r2Url, type ProductVariantKeySet } from '@/lib/r2-url';
import { supabaseAdmin } from '@/lib/supabase';
import {
  UploadRouteError,
  forwardUploadToWorker,
  parseUploadFormPayload,
  productVariantUrls,
  requireSellerUploadContext,
  requireTenantOwnedRow,
} from '@/lib/server/image-upload';

export async function POST(req: NextRequest) {
  try {
    const { claims, actorId } = await requireSellerUploadContext(req);
    const { entityId, file } = await parseUploadFormPayload(req);

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;
    await requireTenantOwnedRow(db, {
      schema: 'app',
      table: 'tenant_products',
      tenantId: claims.tenant_id,
      id: entityId,
    });

    const worker = await forwardUploadToWorker({
      file,
      entityType: 'tenant_product',
      entityId,
      tenantId: claims.tenant_id,
      isPrimary: true,
    });

    const variants = worker.variants as unknown as ProductVariantKeySet;
    const primaryUrl = r2Url(variants.medium) ?? r2Url(variants.original);

    const { data, error } = await db
      .schema('app')
      .from('tenant_products')
      .update({
        r2_original_key: variants.original,
        r2_large_key: variants.large,
        r2_medium_key: variants.medium,
        r2_small_key: variants.small,
        r2_thumb_key: variants.thumb,
        image_urls: primaryUrl ? [primaryUrl] : [],
        updated_by: actorId,
      })
      .eq('id', entityId)
      .eq('tenant_id', claims.tenant_id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to save image metadata.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      entity_type: 'tenant_product',
      entity_id: entityId,
      product: data,
      variants,
      urls: productVariantUrls(variants),
    });
  } catch (error) {
    if (error instanceof UploadRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[POST /api/upload/tenant-product]', error);
    return NextResponse.json({ error: 'Image upload failed.' }, { status: 500 });
  }
}
