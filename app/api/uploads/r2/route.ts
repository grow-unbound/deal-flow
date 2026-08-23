import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { getPresignedUploadUrl, getPublicUrl } from '@/lib/r2';
import { supabaseAdmin } from '@/lib/supabase';
import {
  ENTITY_VARIANT_CONFIG,
  buildOriginalKey,
  buildVariantKey,
  type VariantName,
} from '@/lib/image-entity-config';
import { z } from 'zod';

// Platform-shared catalog entities have no tenant to scope to by design — instead,
// verify entity_id actually references an existing row before handing out a
// presigned upload URL, so any seller can't overwrite arbitrary/guessed catalog
// image keys for products/brands/categories they don't own.
const CATALOG_ENTITY_TABLE: Record<string, string> = {
  catalog_product: 'products',
  catalog_brand: 'brands',
  catalog_category: 'categories',
};

async function assertCatalogEntityExists(entityType: string, entityId: string): Promise<boolean> {
  const table = CATALOG_ENTITY_TABLE[entityType];
  if (!table || !supabaseAdmin) return true;
  const { data } = await supabaseAdmin
    .schema('catalog')
    .from(table)
    .select('id')
    .eq('id', entityId)
    .is('deleted_at', null)
    .maybeSingle();
  return Boolean(data);
}

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

// Multi-variant entity-aware request
const EntityVariantRequestSchema = z.object({
  entity_type: z.string().min(1),
  entity_id: z.string().uuid('entity_id must be a valid UUID'),
  tenant_id: z.string().uuid().optional(),
  original_content_type: z.enum(ALLOWED_CONTENT_TYPES, {
    errorMap: () => ({ message: 'Only JPG, PNG, and WebP images are allowed.' }),
  }),
});

export async function POST(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden — seller role required' }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = EntityVariantRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid request' }, { status: 400 });
    }

    const { entity_type, entity_id, original_content_type } = parsed.data;
    // Always use the verified tenant_id from JWT — never trust the client
    const tenantId = claims.tenant_id;

    const config = ENTITY_VARIANT_CONFIG[entity_type];
    if (!config) {
      return NextResponse.json({ error: `Unknown entity type: ${entity_type}` }, { status: 400 });
    }

    if (!(await assertCatalogEntityExists(entity_type, entity_id))) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    const baseKey = config.buildBaseKey(entity_id, tenantId);

    // Generate presigned URLs for original + all variants
    const variantEntries: { name: string; contentType: string; key: string }[] = [
      { name: 'original', contentType: original_content_type, key: buildOriginalKey(baseKey, original_content_type) },
      ...config.variants.map((v: VariantName) => ({
        name: v,
        contentType: 'image/webp',
        key: buildVariantKey(baseKey, v),
      })),
    ];

    const variants = await Promise.all(
      variantEntries.map(async ({ name, contentType, key }) => ({
        name,
        key,
        upload_url: await getPresignedUploadUrl(key, contentType),
        public_url: getPublicUrl(key),
      })),
    );

    return NextResponse.json({ variants }, { status: 200 });
  } catch (err) {
    console.error('[R2 presign]', err);
    return NextResponse.json({ error: 'Failed to generate upload URLs' }, { status: 500 });
  }
}
