import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { ENTITY_VARIANT_CONFIG } from '@/lib/image-entity-config';
import { signEntityVariantUploads } from '@/lib/server/r2-presign-entity';

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const ItemSchema = z.object({
  entity_type: z.string().min(1),
  entity_id: z.string().uuid(),
  original_content_type: z.enum(ALLOWED_CONTENT_TYPES),
});

const BodySchema = z.object({
  items: z.array(ItemSchema).min(1).max(40),
});

export async function POST(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);
    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid request' }, { status: 400 });
    }

    const results = [];
    for (const item of parsed.data.items) {
      if (!ENTITY_VARIANT_CONFIG[item.entity_type]) {
        return NextResponse.json({ error: `Unknown entity type: ${item.entity_type}` }, { status: 400 });
      }
      const variants = await signEntityVariantUploads({
        entityType: item.entity_type,
        entityId: item.entity_id,
        tenantId: claims.tenant_id,
        originalContentType: item.original_content_type,
      });
      results.push({
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        variants,
      });
    }

    return NextResponse.json({ items: results });
  } catch (error) {
    console.error('[POST /api/uploads/r2/batch]', error);
    return NextResponse.json({ error: 'Failed to generate upload URLs' }, { status: 500 });
  }
}
