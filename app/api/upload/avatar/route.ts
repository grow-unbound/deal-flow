import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  UploadRouteError,
  avatarVariantUrls,
  forwardUploadToWorker,
  requireSellerUploadContext,
  validateUploadImageFile,
} from '@/lib/server/image-upload';
import type { AvatarVariantKeySet } from '@/lib/r2-url';

export async function POST(req: NextRequest) {
  try {
    const { claims, actorId } = await requireSellerUploadContext(req);
    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required.' }, { status: 400 });
    }

    validateUploadImageFile(file);

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;
    const entityId = claims.sub ?? actorId;

    const worker = await forwardUploadToWorker({
      file,
      entityType: 'user_avatar',
      entityId,
      tenantId: claims.tenant_id,
    });

    const variants = worker.variants as unknown as AvatarVariantKeySet;
    const payload = {
      user_id: entityId,
      r2_avatar_orig_key: variants.original,
      r2_avatar_small_key: variants.small,
      r2_avatar_thumb_key: variants.thumb,
      created_by: actorId,
      updated_by: actorId,
      deleted_at: null,
    };

    const { data, error } = await db
      .schema('app')
      .from('user_profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to save image metadata.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      entity_type: 'user_avatar',
      entity_id: entityId,
      profile: data,
      variants,
      urls: avatarVariantUrls(variants),
    });
  } catch (error) {
    if (error instanceof UploadRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[POST /api/upload/avatar]', error);
    return NextResponse.json({ error: 'Image upload failed.' }, { status: 500 });
  }
}
