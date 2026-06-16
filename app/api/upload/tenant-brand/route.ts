import { NextRequest, NextResponse } from 'next/server';
import { r2Url, type MediaVariantKeySet } from '@/lib/r2-url';
import { supabaseAdmin } from '@/lib/supabase';
import {
  UploadRouteError,
  mediaVariantUrls,
  parseVariantKeysPayload,
  requireSellerUploadContext,
  requireTenantOwnedRow,
} from '@/lib/server/image-upload';

export async function POST(req: NextRequest) {
  try {
    const { claims, actorId } = await requireSellerUploadContext(req);
    const { entityId, variants } = await parseVariantKeysPayload(req);

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;
    await requireTenantOwnedRow(db, {
      schema: 'app',
      table: 'tenant_brands',
      tenantId: claims.tenant_id,
      id: entityId,
    });

    const keys = variants as unknown as MediaVariantKeySet;
    const logoUrl = r2Url(keys.medium) ?? r2Url(keys.original);

    const { data, error } = await db
      .schema('app')
      .from('tenant_brands')
      .update({
        r2_logo_original_key: keys.original,
        r2_logo_medium_key: keys.medium,
        r2_logo_thumb_key: keys.thumb,
        logo_url: logoUrl,
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
      entity_type: 'tenant_brand',
      entity_id: entityId,
      brand: data,
      variants: keys,
      urls: mediaVariantUrls(keys),
    });
  } catch (error) {
    if (error instanceof UploadRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[POST /api/upload/tenant-brand]', error);
    return NextResponse.json({ error: 'Image upload failed.' }, { status: 500 });
  }
}
