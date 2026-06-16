import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  UploadRouteError,
  avatarVariantUrls,
  parseVariantKeysPayload,
  requireSellerUploadContext,
} from '@/lib/server/image-upload';
import type { AvatarVariantKeySet } from '@/lib/r2-url';

export async function POST(req: NextRequest) {
  try {
    const { claims, actorId } = await requireSellerUploadContext(req);
    const { variants } = await parseVariantKeysPayload(req);

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;
    const entityId = claims.sub ?? actorId;

    const keys = variants as unknown as AvatarVariantKeySet;
    const payload = {
      user_id: entityId,
      r2_avatar_orig_key: keys.original,
      r2_avatar_small_key: keys.small,
      r2_avatar_thumb_key: keys.thumb,
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
      variants: keys,
      urls: avatarVariantUrls(keys),
    });
  } catch (error) {
    if (error instanceof UploadRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[POST /api/upload/avatar]', error);
    return NextResponse.json({ error: 'Image upload failed.' }, { status: 500 });
  }
}
