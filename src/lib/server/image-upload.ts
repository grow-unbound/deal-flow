import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getVerifiedClaims, type JWTClaims } from '@/lib/auth';
import {
  r2Urls,
  type AvatarVariantKeySet,
  type HeroVariantKeySet,
  type MediaVariantKeySet,
  type ProductVariantKeySet,
} from '@/lib/r2-url';

const UUID_SCHEMA = z.string().uuid('Invalid entity ID');

export type UploadEntityType =
  | 'catalog_product'
  | 'catalog_brand'
  | 'catalog_category'
  | 'tenant_product'
  | 'tenant_brand'
  | 'tenant_category'
  | 'catalog_hero'
  | 'user_avatar';

export type UploadRouteContext = {
  claims: JWTClaims & { tenant_id: string; role: string };
  actorId: string;
};

export type VariantKeysPayload = {
  entityId: string;
  variants: Record<string, string>;
  isPrimary: boolean;
  imageType: 'icon' | 'banner' | 'logo';
};

export function validateUploadImageFile(file: { size: number; type: string }): void {
  if (file.size > 5 * 1024 * 1024) {
    throw new UploadRouteError(413, 'Image must be under 5MB.');
  }
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    throw new UploadRouteError(415, 'Only JPG, PNG, and WebP images are allowed.');
  }
}

export class UploadRouteError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'UploadRouteError';
    this.status = status;
  }
}

export async function requireSellerUploadContext(req: NextRequest): Promise<UploadRouteContext> {
  const claims = await getVerifiedClaims(req);

  if (!claims.tenant_id) {
    throw new UploadRouteError(401, 'Unauthorized');
  }

  if (!claims.role?.startsWith('seller_')) {
    throw new UploadRouteError(403, 'Forbidden');
  }

  return {
    claims: {
      ...claims,
      tenant_id: claims.tenant_id,
      role: claims.role,
    },
    actorId: claims.sub ?? claims.tenant_id,
  };
}

export async function parseVariantKeysPayload(req: NextRequest): Promise<VariantKeysPayload> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new UploadRouteError(400, 'Invalid JSON body.');
  }

  if (!body || typeof body !== 'object') {
    throw new UploadRouteError(400, 'Request body must be a JSON object.');
  }

  const { entity_id, variants, is_primary, image_type } = body as Record<string, unknown>;

  const parsedId = UUID_SCHEMA.safeParse(entity_id);
  if (!parsedId.success) {
    throw new UploadRouteError(400, 'entity_id must be a valid UUID.');
  }

  if (!variants || typeof variants !== 'object' || Array.isArray(variants)) {
    throw new UploadRouteError(400, 'variants must be a key→R2-key map.');
  }

  const variantMap = variants as Record<string, unknown>;
  if (!('original' in variantMap)) {
    throw new UploadRouteError(400, 'variants must include "original".');
  }

  for (const [k, v] of Object.entries(variantMap)) {
    if (typeof v !== 'string' || !v) {
      throw new UploadRouteError(400, `variants.${k} must be a non-empty string.`);
    }
  }

  const normalizedImageType = ((): 'icon' | 'banner' | 'logo' => {
    if (image_type === 'banner') return 'banner';
    if (image_type === 'logo') return 'logo';
    return 'icon';
  })();

  return {
    entityId: parsedId.data,
    variants: variantMap as Record<string, string>,
    isPrimary: is_primary === true,
    imageType: normalizedImageType,
  };
}

export async function requireTenantOwnedRow(
  db: any,
  input: {
    schema: 'app';
    table: string;
    tenantId: string;
    id: string;
    select?: string;
  },
) {
  const { data, error } = await db
    .schema(input.schema)
    .from(input.table)
    .select(input.select ?? 'id, tenant_id')
    .eq('id', input.id)
    .eq('tenant_id', input.tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new UploadRouteError(500, 'Failed to validate upload target.');
  }

  if (!data) {
    throw new UploadRouteError(404, 'Upload target not found.');
  }

  return data;
}

export async function requireCatalogRow(
  db: any,
  input: {
    table: 'products' | 'brands' | 'categories';
    id: string;
    select?: string;
  },
) {
  const { data, error } = await db
    .schema('catalog')
    .from(input.table)
    .select(input.select ?? 'id')
    .eq('id', input.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new UploadRouteError(500, 'Failed to validate upload target.');
  }

  if (!data) {
    throw new UploadRouteError(404, 'Upload target not found.');
  }

  return data;
}

export async function getCatalogProductImageState(db: any, productId: string) {
  const { data, error } = await db
    .schema('catalog')
    .from('product_images')
    .select('id, is_primary, sort_order')
    .eq('product_id', productId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  if (error) {
    throw new UploadRouteError(500, 'Failed to inspect product images.');
  }

  const rows = (data ?? []) as Array<{ id: string; is_primary: boolean; sort_order: number | null }>;
  return {
    count: rows.length,
    nextSortOrder: rows.reduce((max, row) => Math.max(max, row.sort_order ?? 0), -1) + 1,
    hasPrimary: rows.some((row) => row.is_primary),
  };
}

export async function clearCatalogProductPrimary(db: any, productId: string) {
  const { error } = await db
    .schema('catalog')
    .from('product_images')
    .update({ is_primary: false })
    .eq('product_id', productId)
    .eq('is_primary', true)
    .is('deleted_at', null);

  if (error) {
    throw new UploadRouteError(500, 'Failed to update primary image.');
  }
}

export function productVariantUrls(variants: ProductVariantKeySet) {
  return r2Urls(variants);
}

export function mediaVariantUrls(variants: MediaVariantKeySet) {
  return r2Urls(variants);
}

export function heroVariantUrls(variants: HeroVariantKeySet) {
  return r2Urls(variants);
}

export function avatarVariantUrls(variants: AvatarVariantKeySet) {
  return r2Urls(variants);
}
