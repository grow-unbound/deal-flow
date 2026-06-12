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

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const UUID_SCHEMA = z.string().uuid('Invalid entity ID');

const WORKER_RESPONSE_SCHEMA = z.object({
  success: z.literal(true),
  entity_type: z.string(),
  entity_id: z.string().uuid(),
  variants: z.record(z.string(), z.string()),
  public_base_url: z.string(),
});

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

export type UploadFormPayload = {
  entityId: string;
  file: File;
  isPrimary: boolean;
  imageType: 'icon' | 'banner' | 'logo';
};

export type WorkerUploadResponse = z.infer<typeof WORKER_RESPONSE_SCHEMA>;

export class UploadRouteError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'UploadRouteError';
    this.status = status;
  }
}

export function validateUploadImageFile(file: { size: number; type: string }) {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new UploadRouteError(415, 'Only JPG, PNG, and WebP images are allowed.');
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new UploadRouteError(413, 'Image must be under 5MB.');
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

function parseBoolean(value: FormDataEntryValue | null) {
  if (value == null) return false;
  if (typeof value !== 'string') {
    throw new UploadRouteError(400, 'is_primary must be "true" or "false".');
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === '' || normalized === 'false') return false;
  if (normalized === 'true') return true;

  throw new UploadRouteError(400, 'is_primary must be "true" or "false".');
}

function parseImageType(value: FormDataEntryValue | null): 'icon' | 'banner' | 'logo' {
  if (typeof value !== 'string' || value.trim() === '') {
    return 'icon';
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'icon' || normalized === 'banner' || normalized === 'logo') {
    return normalized;
  }

  throw new UploadRouteError(400, 'image_type must be icon, banner, or logo.');
}

export async function parseUploadFormPayload(req: NextRequest): Promise<UploadFormPayload> {
  const formData = await req.formData();
  const entityIdValue = formData.get('entity_id');
  const fileValue = formData.get('file');

  if (typeof entityIdValue !== 'string' || entityIdValue.trim() === '') {
    throw new UploadRouteError(400, 'entity_id is required.');
  }

  if (!(fileValue instanceof File)) {
    throw new UploadRouteError(400, 'file is required.');
  }

  validateUploadImageFile(fileValue);

  const parsedEntityId = UUID_SCHEMA.safeParse(entityIdValue);
  if (!parsedEntityId.success) {
    throw new UploadRouteError(400, 'entity_id must be a valid UUID.');
  }

  return {
    entityId: parsedEntityId.data,
    file: fileValue,
    isPrimary: parseBoolean(formData.get('is_primary')),
    imageType: parseImageType(formData.get('image_type')),
  };
}

export async function forwardUploadToWorker(input: {
  file: File;
  entityType: UploadEntityType;
  entityId: string;
  tenantId?: string;
  isPrimary?: boolean;
}): Promise<WorkerUploadResponse> {
  const workerUrl = process.env.IMAGE_UPLOAD_WORKER_URL;
  const sharedSecret = process.env.IMAGE_UPLOAD_SHARED_SECRET;

  if (!workerUrl || !sharedSecret) {
    throw new UploadRouteError(500, 'Image upload service is not configured.');
  }

  const formData = new FormData();
  formData.append('file', input.file);
  formData.append('entity_type', input.entityType);
  formData.append('entity_id', input.entityId);
  if (input.tenantId) {
    formData.append('tenant_id', input.tenantId);
  }
  formData.append('is_primary', input.isPrimary ? 'true' : 'false');

  const response = await fetch(new URL('/upload', workerUrl), {
    method: 'POST',
    headers: {
      'X-Upload-Secret': sharedSecret,
    },
    body: formData,
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      json &&
      typeof json === 'object' &&
      'error' in json &&
      typeof (json as { error?: unknown }).error === 'string'
        ? (json as { error: string }).error
        : 'Image processing failed.';
    throw new UploadRouteError(response.status, message);
  }

  const parsed = WORKER_RESPONSE_SCHEMA.safeParse(json);
  if (!parsed.success) {
    throw new UploadRouteError(502, 'Image upload service returned an invalid response.');
  }

  return parsed.data;
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
