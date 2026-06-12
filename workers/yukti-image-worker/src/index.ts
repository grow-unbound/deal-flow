import { timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';

type WorkerEnv = Env & {
  UPLOAD_SECRET: string;
};

type EntityType =
  | 'catalog_product'
  | 'catalog_brand'
  | 'catalog_category'
  | 'tenant_product'
  | 'tenant_brand'
  | 'tenant_category'
  | 'catalog_hero'
  | 'user_avatar';

type VariantName = 'thumb' | 'small' | 'medium' | 'large';

type VariantDimensions = Record<VariantName, number>;

type VariantResponse = Partial<Record<VariantName | 'original', string>>;

interface EntityConfig {
  requireTenantId: boolean;
  flattenOnWhite: boolean;
  variants: VariantName[];
  buildBaseKey: (entityId: string, tenantId?: string) => string;
}

interface UploadRequestFields {
  entityType: EntityType;
  entityId: string;
  tenantId?: string;
  isPrimary: boolean;
  file: File;
}

const PUBLIC_BASE_URL = 'https://assets.yukti.so';
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIME_TO_EXTENSION: Record<string, 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const VARIANT_SIZES: VariantDimensions = {
  thumb: 120,
  small: 320,
  medium: 640,
  large: 1200,
};

const ENTITY_CONFIG: Record<EntityType, EntityConfig> = {
  catalog_product: {
    requireTenantId: false,
    flattenOnWhite: true,
    variants: ['thumb', 'small', 'medium', 'large'],
    buildBaseKey: (entityId) => `catalog/products/${entityId}`,
  },
  catalog_brand: {
    requireTenantId: false,
    flattenOnWhite: false,
    variants: ['thumb', 'medium'],
    buildBaseKey: (entityId) => `catalog/brands/${entityId}`,
  },
  catalog_category: {
    requireTenantId: false,
    flattenOnWhite: true,
    variants: ['thumb', 'medium'],
    buildBaseKey: (entityId) => `catalog/categories/${entityId}`,
  },
  tenant_product: {
    requireTenantId: true,
    flattenOnWhite: true,
    variants: ['thumb', 'small', 'medium', 'large'],
    buildBaseKey: (entityId, tenantId) => `tenants/${tenantId}/products/${entityId}`,
  },
  tenant_brand: {
    requireTenantId: true,
    flattenOnWhite: false,
    variants: ['thumb', 'medium'],
    buildBaseKey: (entityId, tenantId) => `tenants/${tenantId}/brands/${entityId}`,
  },
  tenant_category: {
    requireTenantId: true,
    flattenOnWhite: true,
    variants: ['thumb', 'medium'],
    buildBaseKey: (entityId, tenantId) => `tenants/${tenantId}/categories/${entityId}`,
  },
  catalog_hero: {
    requireTenantId: true,
    flattenOnWhite: false,
    variants: ['medium'],
    buildBaseKey: (entityId, tenantId) => `tenants/${tenantId}/catalogs/${entityId}`,
  },
  user_avatar: {
    requireTenantId: true,
    flattenOnWhite: false,
    variants: ['thumb', 'small'],
    buildBaseKey: (entityId, tenantId) => `tenants/${tenantId}/users/${entityId}`,
  },
};

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
}

function encodeSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

function validateSecret(request: Request, env: WorkerEnv) {
  const headerValue = request.headers.get('X-Upload-Secret');
  if (!headerValue) {
    throw new HttpError(401, 'Unauthorized');
  }

  const providedSecret = encodeSecret(headerValue);
  const expectedSecret = encodeSecret(env.UPLOAD_SECRET);

  if (
    providedSecret.byteLength !== expectedSecret.byteLength ||
    !timingSafeEqual(providedSecret, expectedSecret)
  ) {
    throw new HttpError(401, 'Unauthorized');
  }
}

function ensureMultipartRequest(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    throw new HttpError(400, 'Content-Type must be multipart/form-data.');
  }
}

function requireTextField(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${name} is required.`);
  }
  return value.trim();
}

function parseBooleanField(value: FormDataEntryValue | null): boolean {
  if (value === null) return false;
  if (typeof value !== 'string') {
    throw new HttpError(400, 'is_primary must be a string boolean value.');
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === '' || normalized === 'false') return false;
  if (normalized === 'true') return true;

  throw new HttpError(400, 'is_primary must be "true" or "false".');
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function parseEntityType(value: string): EntityType {
  if (value in ENTITY_CONFIG) {
    return value as EntityType;
  }
  throw new HttpError(400, 'entity_type is invalid.');
}

async function parseUploadRequest(request: Request): Promise<UploadRequestFields> {
  ensureMultipartRequest(request);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new HttpError(400, 'Invalid multipart form data.');
  }

  const fileEntry = formData.get('file');
  if (!(fileEntry instanceof File)) {
    throw new HttpError(400, 'file is required.');
  }

  if (!ALLOWED_MIME_TYPES.has(fileEntry.type)) {
    throw new HttpError(415, 'Only JPEG, PNG, and WebP images are allowed.');
  }

  if (fileEntry.size > MAX_FILE_SIZE_BYTES) {
    throw new HttpError(413, 'Image must be 10MB or smaller.');
  }

  const entityType = parseEntityType(requireTextField(formData, 'entity_type'));
  const entityId = requireTextField(formData, 'entity_id');
  if (!isUuid(entityId)) {
    throw new HttpError(400, 'entity_id must be a valid UUID.');
  }

  const config = ENTITY_CONFIG[entityType];
  const tenantField = formData.get('tenant_id');
  const tenantId =
    typeof tenantField === 'string' && tenantField.trim() ? tenantField.trim() : undefined;

  if (config.requireTenantId) {
    if (!tenantId) {
      throw new HttpError(400, 'tenant_id is required.');
    }
    if (!isUuid(tenantId)) {
      throw new HttpError(400, 'tenant_id must be a valid UUID.');
    }
  } else if (tenantId && !isUuid(tenantId)) {
    throw new HttpError(400, 'tenant_id must be a valid UUID.');
  }

  return {
    entityType,
    entityId,
    tenantId,
    isPrimary: parseBooleanField(formData.get('is_primary')),
    file: fileEntry,
  };
}

function buildVariantKey(baseKey: string, variant: VariantName): string {
  return `${baseKey}/${variant}.webp`;
}

function buildOriginalKey(baseKey: string, mimeType: string): string {
  return `${baseKey}/original.${MIME_TO_EXTENSION[mimeType]}`;
}

async function writeObject(
  bucket: R2Bucket,
  key: string,
  value: ArrayBuffer | Uint8Array,
  contentType: string,
) {
  await bucket.put(key, value, {
    httpMetadata: {
      contentType,
    },
  });
}

async function cleanupUploadedKeys(bucket: R2Bucket, keys: string[]) {
  await Promise.all(
    keys.map(async (key) => {
      try {
        await bucket.delete(key);
      } catch (error) {
        console.error('Failed to clean up uploaded key', { key, error });
      }
    }),
  );
}

async function createVariantBuffer(
  sourceBuffer: ArrayBuffer,
  variant: VariantName,
  flattenOnWhite: boolean,
) {
  let pipeline = sharp(sourceBuffer).resize(VARIANT_SIZES[variant], VARIANT_SIZES[variant], {
    fit: 'cover',
    position: 'centre',
  });

  if (flattenOnWhite) {
    pipeline = pipeline.flatten({ background: '#ffffff' });
  }

  return pipeline.webp({ quality: 85 }).toBuffer();
}

async function persistUpload(env: WorkerEnv, fields: UploadRequestFields) {
  const config = ENTITY_CONFIG[fields.entityType];
  const baseKey = config.buildBaseKey(fields.entityId, fields.tenantId);
  const originalKey = buildOriginalKey(baseKey, fields.file.type);
  const originalBuffer = await fields.file.arrayBuffer();
  const writtenKeys: string[] = [];
  const variants: VariantResponse = {};

  try {
    await writeObject(env.ASSETS_BUCKET, originalKey, originalBuffer, fields.file.type);
    writtenKeys.push(originalKey);
    variants.original = originalKey;

    for (const variant of config.variants) {
      const variantKey = buildVariantKey(baseKey, variant);
      const buffer = await createVariantBuffer(originalBuffer, variant, config.flattenOnWhite);
      await writeObject(env.ASSETS_BUCKET, variantKey, buffer, 'image/webp');
      writtenKeys.push(variantKey);
      variants[variant] = variantKey;
    }
  } catch (error) {
    await cleanupUploadedKeys(env.ASSETS_BUCKET, writtenKeys);
    console.error('Image processing or upload failed', {
      entityType: fields.entityType,
      entityId: fields.entityId,
      error,
    });
    throw new HttpError(500, 'Failed to process and store image.');
  }

  return variants;
}

async function handleUpload(request: Request, env: WorkerEnv) {
  validateSecret(request, env);
  const fields = await parseUploadRequest(request);
  const variants = await persistUpload(env, fields);

  return json({
    success: true,
    entity_type: fields.entityType,
    entity_id: fields.entityId,
    variants,
    public_base_url: PUBLIC_BASE_URL,
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/upload') {
      try {
        return await handleUpload(request, env);
      } catch (error) {
        if (error instanceof HttpError) {
          return json({ success: false, error: error.message }, { status: error.status });
        }

        console.error('Unhandled upload error', error);
        return json({ success: false, error: 'Internal server error.' }, { status: 500 });
      }
    }

    return json({
      service: 'yukti-image-worker',
      status: 'ok',
      message: 'Phase 1 infrastructure is deployed. Upload handler arrives in phase 3.',
    });
  },
};
