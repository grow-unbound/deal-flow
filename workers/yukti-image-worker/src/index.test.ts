// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharpCallLog: Array<{
  source: ArrayBuffer;
  resizeArgs: [number, number, { fit: string; position: string }];
  flattenArgs?: { background: string };
  webpArgs?: { quality: number };
}> = [];

const failingVariantWidths = new Set<number>();

vi.mock('sharp', () => {
  return {
    default: (source: ArrayBuffer) => {
      const record: {
        source: ArrayBuffer;
        resizeArgs?: [number, number, { fit: string; position: string }];
        flattenArgs?: { background: string };
        webpArgs?: { quality: number };
      } = { source };

      const pipeline = {
        resize: (width: number, height: number, options: { fit: string; position: string }) => {
          record.resizeArgs = [width, height, options];
          return pipeline;
        },
        flatten: (options: { background: string }) => {
          record.flattenArgs = options;
          return pipeline;
        },
        webp: (options: { quality: number }) => {
          record.webpArgs = options;
          return pipeline;
        },
        toBuffer: async () => {
          if (!record.resizeArgs) {
            throw new Error('resize not called');
          }

          sharpCallLog.push({
            source,
            resizeArgs: record.resizeArgs,
            flattenArgs: record.flattenArgs,
            webpArgs: record.webpArgs,
          });

          if (failingVariantWidths.has(record.resizeArgs[0])) {
            throw new Error(`Synthetic sharp failure for width ${record.resizeArgs[0]}`);
          }

          return Uint8Array.from([record.resizeArgs[0] % 255]).buffer;
        },
      };

      return pipeline;
    },
  };
});

import worker from './index';

interface MockBucket {
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

function createEnv(bucket?: MockBucket) {
  const mockBucket =
    bucket ??
    ({
      put: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    } satisfies MockBucket);

  return {
    ASSETS_BUCKET: mockBucket,
    UPLOAD_SECRET: 'top-secret',
  };
}

function createFormDataRequest(fields?: {
  entityType?: string;
  entityId?: string;
  tenantId?: string;
  isPrimary?: string;
  file?: File | string | null;
  secret?: string | null;
}) {
  const formData = new FormData();
  if (fields?.file !== null) {
    if (fields?.file instanceof File) {
      formData.append('file', fields.file);
    } else if (typeof fields?.file === 'string') {
      formData.append('file', fields.file);
    } else {
      formData.append('file', new File([Uint8Array.from([1, 2, 3])], 'image.jpg', { type: 'image/jpeg' }));
    }
  }

  formData.append('entity_type', fields?.entityType ?? 'catalog_product');
  formData.append('entity_id', fields?.entityId ?? '11111111-1111-4111-8111-111111111111');
  if (fields?.tenantId) {
    formData.append('tenant_id', fields.tenantId);
  }
  if (fields?.isPrimary) {
    formData.append('is_primary', fields.isPrimary);
  }

  const request = new Request('https://images.yukti.so/upload', {
    method: 'POST',
    body: formData,
    headers:
      fields?.secret === null
        ? undefined
        : {
            'X-Upload-Secret': fields?.secret ?? 'top-secret',
          },
  });

  return request;
}

beforeEach(() => {
  sharpCallLog.length = 0;
  failingVariantWidths.clear();
  vi.restoreAllMocks();
});

describe('yukti-image-worker', () => {
  it('returns the health payload for GET /', async () => {
    const response = await worker.fetch(new Request('https://images.yukti.so/'), createEnv() as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      service: 'yukti-image-worker',
      status: 'ok',
    });
  });

  it('returns 401 for a missing secret', async () => {
    const response = await worker.fetch(
      createFormDataRequest({ secret: null }),
      createEnv() as never,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Unauthorized',
    });
  });

  it('returns 401 for a wrong secret', async () => {
    const response = await worker.fetch(
      createFormDataRequest({ secret: 'wrong-secret' }),
      createEnv() as never,
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 for a non-multipart request', async () => {
    const response = await worker.fetch(
      new Request('https://images.yukti.so/upload', {
        method: 'POST',
        headers: {
          'X-Upload-Secret': 'top-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ hello: 'world' }),
      }),
      createEnv() as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Content-Type must be multipart/form-data.',
    });
  });

  it('returns 400 when the file field is missing', async () => {
    const response = await worker.fetch(createFormDataRequest({ file: null }), createEnv() as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'file is required.',
    });
  });

  it('returns 400 when the file field is not a file', async () => {
    const response = await worker.fetch(createFormDataRequest({ file: 'not-a-file' }), createEnv() as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'file is required.',
    });
  });

  it('returns 415 for an unsupported MIME type', async () => {
    const response = await worker.fetch(
      createFormDataRequest({
        file: new File([Uint8Array.from([1])], 'image.gif', { type: 'image/gif' }),
      }),
      createEnv() as never,
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Only JPEG, PNG, and WebP images are allowed.',
    });
  });

  it('returns 413 when the file exceeds 10MB', async () => {
    const largeBytes = new Uint8Array(10 * 1024 * 1024 + 1);
    const response = await worker.fetch(
      createFormDataRequest({
        file: new File([largeBytes], 'large.jpg', { type: 'image/jpeg' }),
      }),
      createEnv() as never,
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Image must be 10MB or smaller.',
    });
  });

  it('uploads catalog product variants and flattens them on white', async () => {
    const env = createEnv();

    const response = await worker.fetch(createFormDataRequest(), env as never);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      entity_type: 'catalog_product',
      entity_id: '11111111-1111-4111-8111-111111111111',
      public_base_url: 'https://assets.yukti.so',
      variants: {
        original: 'catalog/products/11111111-1111-4111-8111-111111111111/original.jpg',
        large: 'catalog/products/11111111-1111-4111-8111-111111111111/large.webp',
        medium: 'catalog/products/11111111-1111-4111-8111-111111111111/medium.webp',
        small: 'catalog/products/11111111-1111-4111-8111-111111111111/small.webp',
        thumb: 'catalog/products/11111111-1111-4111-8111-111111111111/thumb.webp',
      },
    });

    expect(env.ASSETS_BUCKET.put).toHaveBeenCalledTimes(5);
    expect(env.ASSETS_BUCKET.put).toHaveBeenNthCalledWith(
      1,
      'catalog/products/11111111-1111-4111-8111-111111111111/original.jpg',
      expect.any(ArrayBuffer),
      expect.objectContaining({ httpMetadata: { contentType: 'image/jpeg' } }),
    );

    expect(sharpCallLog).toHaveLength(4);
    expect(sharpCallLog.map((call) => call.resizeArgs[0])).toEqual([120, 320, 640, 1200]);
    expect(sharpCallLog.every((call) => call.flattenArgs?.background === '#ffffff')).toBe(true);
    expect(sharpCallLog.every((call) => call.webpArgs?.quality === 85)).toBe(true);
  });

  it('uploads catalog brand variants without flattening', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      createFormDataRequest({
        entityType: 'catalog_brand',
        entityId: '22222222-2222-4222-8222-222222222222',
        file: new File([Uint8Array.from([9, 9, 9])], 'brand.png', { type: 'image/png' }),
      }),
      env as never,
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      variants: {
        original: 'catalog/brands/22222222-2222-4222-8222-222222222222/original.png',
        medium: 'catalog/brands/22222222-2222-4222-8222-222222222222/medium.webp',
        thumb: 'catalog/brands/22222222-2222-4222-8222-222222222222/thumb.webp',
      },
    });

    expect(env.ASSETS_BUCKET.put).toHaveBeenCalledTimes(3);
    expect(sharpCallLog).toHaveLength(2);
    expect(sharpCallLog.map((call) => call.resizeArgs[0])).toEqual([120, 640]);
    expect(sharpCallLog.every((call) => call.flattenArgs === undefined)).toBe(true);
  });

  it('uploads catalog category variants with white background flattening', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      createFormDataRequest({
        entityType: 'catalog_category',
        entityId: '55555555-5555-4555-8555-555555555555',
        file: new File([Uint8Array.from([4, 5, 6])], 'category.png', { type: 'image/png' }),
      }),
      env as never,
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      variants: {
        original: 'catalog/categories/55555555-5555-4555-8555-555555555555/original.png',
        medium: 'catalog/categories/55555555-5555-4555-8555-555555555555/medium.webp',
        thumb: 'catalog/categories/55555555-5555-4555-8555-555555555555/thumb.webp',
      },
    });

    expect(env.ASSETS_BUCKET.put).toHaveBeenCalledTimes(3);
    expect(sharpCallLog).toHaveLength(2);
    expect(sharpCallLog.map((call) => call.resizeArgs[0])).toEqual([120, 640]);
    expect(sharpCallLog.every((call) => call.flattenArgs?.background === '#ffffff')).toBe(true);
  });

  it('rejects tenant product uploads without tenant_id', async () => {
    const response = await worker.fetch(
      createFormDataRequest({
        entityType: 'tenant_product',
      }),
      createEnv() as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'tenant_id is required.',
    });
  });

  it('rejects catalog hero uploads without tenant_id', async () => {
    const response = await worker.fetch(
      createFormDataRequest({
        entityType: 'catalog_hero',
      }),
      createEnv() as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'tenant_id is required.',
    });
  });

  it('rejects user avatar uploads without tenant_id', async () => {
    const response = await worker.fetch(
      createFormDataRequest({
        entityType: 'user_avatar',
      }),
      createEnv() as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'tenant_id is required.',
    });
  });

  it('returns tenant-scoped keys for tenant uploads', async () => {
    const env = createEnv();

    const response = await worker.fetch(
      createFormDataRequest({
        entityType: 'tenant_product',
        tenantId: '33333333-3333-4333-8333-333333333333',
        entityId: '44444444-4444-4444-8444-444444444444',
      }),
      env as never,
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      variants: {
        original:
          'tenants/33333333-3333-4333-8333-333333333333/products/44444444-4444-4444-8444-444444444444/original.jpg',
        large:
          'tenants/33333333-3333-4333-8333-333333333333/products/44444444-4444-4444-8444-444444444444/large.webp',
      },
    });
  });

  it('cleans up written keys when processing fails', async () => {
    const env = createEnv();
    failingVariantWidths.add(640);

    const response = await worker.fetch(createFormDataRequest(), env as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Failed to process and store image.',
    });
    expect(env.ASSETS_BUCKET.delete).toHaveBeenCalledTimes(3);
    expect(env.ASSETS_BUCKET.delete).toHaveBeenCalledWith(
      'catalog/products/11111111-1111-4111-8111-111111111111/original.jpg',
    );
    expect(env.ASSETS_BUCKET.delete).toHaveBeenCalledWith(
      'catalog/products/11111111-1111-4111-8111-111111111111/thumb.webp',
    );
    expect(env.ASSETS_BUCKET.delete).toHaveBeenCalledWith(
      'catalog/products/11111111-1111-4111-8111-111111111111/small.webp',
    );
  });

  it('cleans up written keys when R2 storage fails', async () => {
    const env = createEnv({
      put: vi.fn(async (key: string) => {
        if (key.endsWith('/medium.webp')) {
          throw new Error('Synthetic R2 failure');
        }
      }),
      delete: vi.fn(async () => undefined),
    });

    const response = await worker.fetch(createFormDataRequest(), env as never);

    expect(response.status).toBe(500);
    expect(env.ASSETS_BUCKET.delete).toHaveBeenCalledWith(
      'catalog/products/11111111-1111-4111-8111-111111111111/original.jpg',
    );
    expect(env.ASSETS_BUCKET.delete).toHaveBeenCalledWith(
      'catalog/products/11111111-1111-4111-8111-111111111111/thumb.webp',
    );
    expect(env.ASSETS_BUCKET.delete).toHaveBeenCalledWith(
      'catalog/products/11111111-1111-4111-8111-111111111111/small.webp',
    );
  });
});
