import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ENTITY_VARIANT_CONFIG,
  buildOriginalKey,
  buildVariantKey,
  type VariantName,
} from '@/lib/image-entity-config';
import { putObjectBlob } from '@/lib/r2';
import {
  UploadRouteError,
  requireSellerUploadContext,
  requireTenantOwnedRow,
} from '@/lib/server/image-upload';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

const VariantNameSchema = z.enum(['original', 'thumb', 'small', 'medium', 'large']);
const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_SERVER_UPLOAD_BYTES = 12 * 1024 * 1024;

const TENANT_ENTITY_TABLE: Record<string, string> = {
  tenant_product: 'tenant_products',
  tenant_product_family: 'tenant_product_families',
  tenant_brand: 'tenant_brands',
  tenant_category: 'tenant_categories',
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const { claims } = await requireSellerUploadContext(req);
    if (!supabaseAdmin) {
      return jsonError('Server configuration error', 500);
    }

    const form = await req.formData();
    const entityType = String(form.get('entity_type') ?? '');
    const entityId = String(form.get('entity_id') ?? '');
    const variantNameRaw = String(form.get('variant_name') ?? '');
    const contentType = String(form.get('content_type') ?? '');
    const file = form.get('file');

    const variantName = VariantNameSchema.safeParse(variantNameRaw);
    if (!variantName.success) return jsonError('Invalid variant name', 400);
    if (!z.string().uuid().safeParse(entityId).success) return jsonError('entity_id must be a valid UUID', 400);
    if (!ALLOWED_CONTENT_TYPES.includes(contentType as (typeof ALLOWED_CONTENT_TYPES)[number])) {
      return jsonError('Only JPG, PNG, and WebP images are allowed.', 415);
    }
    if (!(file instanceof File)) return jsonError('file is required', 400);
    if (file.size > MAX_SERVER_UPLOAD_BYTES) return jsonError('Image variant is too large.', 413);

    const config = ENTITY_VARIANT_CONFIG[entityType];
    const table = TENANT_ENTITY_TABLE[entityType];
    if (!config || !table) return jsonError(`Unknown entity type: ${entityType}`, 400);
    if (variantName.data !== 'original' && !config.variants.includes(variantName.data as VariantName)) {
      return jsonError(`Variant ${variantName.data} is not supported for ${entityType}`, 400);
    }

    await requireTenantOwnedRow(supabaseAdmin as any, {
      schema: 'app',
      table,
      tenantId: claims.tenant_id,
      id: entityId,
    });

    const baseKey = config.buildBaseKey(entityId, claims.tenant_id);
    const key = variantName.data === 'original'
      ? buildOriginalKey(baseKey, contentType)
      : buildVariantKey(baseKey, variantName.data as VariantName);

    await putObjectBlob(key, new Uint8Array(await file.arrayBuffer()), contentType);
    return NextResponse.json({ key });
  } catch (error) {
    if (error instanceof UploadRouteError) {
      return jsonError(error.message, error.status);
    }
    console.error('[POST /api/uploads/r2/entity-variant]', error);
    return jsonError('Image upload failed.', 500);
  }
}
