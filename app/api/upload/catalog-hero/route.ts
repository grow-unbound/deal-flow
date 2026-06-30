import { NextRequest, NextResponse } from 'next/server';
import { r2Url, type HeroVariantKeySet } from '@/lib/r2-url';
import { supabaseAdmin } from '@/lib/supabase';
import {
  UploadRouteError,
  heroVariantUrls,
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
      table: 'campaigns',
      tenantId: claims.tenant_id,
      id: entityId,
    });

    const keys = variants as unknown as HeroVariantKeySet;
    const heroUrl = r2Url(keys.medium) ?? r2Url(keys.original);

    const { data, error } = await db
      .schema('app')
      .from('campaigns')
      .update({
        r2_hero_original_key: keys.original,
        r2_hero_medium_key: keys.medium,
        hero_image_url: heroUrl,
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
      entity_type: 'catalog_hero',
      entity_id: entityId,
      catalog: data,
      variants: keys,
      urls: heroVariantUrls(keys),
    });
  } catch (error) {
    if (error instanceof UploadRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[POST /api/upload/catalog-hero]', error);
    return NextResponse.json({ error: 'Image upload failed.' }, { status: 500 });
  }
}
