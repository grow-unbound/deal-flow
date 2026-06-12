import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UploadRouteError } from '@/lib/server/image-upload';

const requireSellerUploadContextMock = vi.fn();
const parseUploadFormPayloadMock = vi.fn();
const requireCatalogRowMock = vi.fn();
const getCatalogProductImageStateMock = vi.fn();
const clearCatalogProductPrimaryMock = vi.fn();
const forwardUploadToWorkerMock = vi.fn();
const requireTenantOwnedRowMock = vi.fn();

const state = {
  insertedProductImage: null as Record<string, unknown> | null,
  insertedTenantCategoryImage: null as Record<string, unknown> | null,
};

class QueryBuilder {
  table: string;
  action: 'insert' | 'update' | 'select' = 'select';
  filters: Record<string, unknown> = {};
  payload: Record<string, unknown> | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select() {
    return this;
  }

  insert(payload: Record<string, unknown>) {
    this.action = 'insert';
    this.payload = payload;
    if (this.table === 'product_images') state.insertedProductImage = payload;
    if (this.table === 'tenant_category_images') state.insertedTenantCategoryImage = payload;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.action = 'update';
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  is() {
    return this;
  }

  maybeSingle() {
    if (this.table === 'tenant_category_images') {
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve({ data: { id: 'row-1' }, error: null });
  }

  single() {
    return Promise.resolve({ data: { id: 'saved-row', ...this.payload }, error: null });
  }
}

vi.mock('@/lib/server/image-upload', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/image-upload')>('@/lib/server/image-upload');
  return {
    ...actual,
    requireSellerUploadContext: (...args: unknown[]) => requireSellerUploadContextMock(...args),
    parseUploadFormPayload: (...args: unknown[]) => parseUploadFormPayloadMock(...args),
    requireCatalogRow: (...args: unknown[]) => requireCatalogRowMock(...args),
    getCatalogProductImageState: (...args: unknown[]) => getCatalogProductImageStateMock(...args),
    clearCatalogProductPrimary: (...args: unknown[]) => clearCatalogProductPrimaryMock(...args),
    forwardUploadToWorker: (...args: unknown[]) => forwardUploadToWorkerMock(...args),
    requireTenantOwnedRow: (...args: unknown[]) => requireTenantOwnedRowMock(...args),
  };
});

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      from: vi.fn((table: string) => new QueryBuilder(table)),
    })),
  },
}));

import { POST as postCatalogProduct } from '../../../app/api/upload/catalog-product/route';
import { POST as postTenantCategory } from '../../../app/api/upload/tenant-category/route';

describe('image upload routes', () => {
  beforeEach(() => {
    state.insertedProductImage = null;
    state.insertedTenantCategoryImage = null;
    requireSellerUploadContextMock.mockResolvedValue({
      claims: { tenant_id: 'tenant-1', role: 'seller_admin', sub: 'user-1' },
      actorId: 'user-1',
    });
    parseUploadFormPayloadMock.mockResolvedValue({
      entityId: '11111111-1111-4111-8111-111111111111',
      file: new File([Uint8Array.from([1])], 'image.jpg', { type: 'image/jpeg' }),
      isPrimary: true,
      imageType: 'icon',
    });
    requireCatalogRowMock.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
    getCatalogProductImageStateMock.mockResolvedValue({
      count: 0,
      nextSortOrder: 0,
      hasPrimary: false,
    });
    clearCatalogProductPrimaryMock.mockResolvedValue(undefined);
    forwardUploadToWorkerMock.mockResolvedValue({
      success: true,
      entity_type: 'catalog_product',
      entity_id: '11111111-1111-4111-8111-111111111111',
      public_base_url: 'https://assets.yukti.so',
      variants: {
        original: 'catalog/products/111/original.jpg',
        large: 'catalog/products/111/large.webp',
        medium: 'catalog/products/111/medium.webp',
        small: 'catalog/products/111/small.webp',
        thumb: 'catalog/products/111/thumb.webp',
      },
    });
    requireTenantOwnedRowMock.mockResolvedValue({ id: 'cat-1', tenant_id: 'tenant-1' });
  });

  it('writes catalog uploads with pending moderation status', async () => {
    const response = await postCatalogProduct(new NextRequest('http://localhost/api/upload/catalog-product', { method: 'POST' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(state.insertedProductImage).toMatchObject({
      product_id: '11111111-1111-4111-8111-111111111111',
      status: 'pending',
      contributed_by_tenant_id: 'tenant-1',
      is_primary: true,
      sort_order: 0,
    });
    expect(body.urls.medium).toBe('catalog/products/111/medium.webp');
  });

  it('writes tenant category uploads as approved', async () => {
    forwardUploadToWorkerMock.mockResolvedValueOnce({
      success: true,
      entity_type: 'tenant_category',
      entity_id: '11111111-1111-4111-8111-111111111111',
      public_base_url: 'https://assets.yukti.so',
      variants: {
        original: 'tenants/tenant-1/categories/111/original.jpg',
        medium: 'tenants/tenant-1/categories/111/medium.webp',
        thumb: 'tenants/tenant-1/categories/111/thumb.webp',
      },
    });

    const response = await postTenantCategory(new NextRequest('http://localhost/api/upload/tenant-category', { method: 'POST' }));
    expect(response.status).toBe(200);
    expect(state.insertedTenantCategoryImage).toMatchObject({
      tenant_category_id: '11111111-1111-4111-8111-111111111111',
      status: 'approved',
      image_type: 'icon',
    });
  });

  it('returns auth errors from the shared guard', async () => {
    requireSellerUploadContextMock.mockRejectedValueOnce(new UploadRouteError(401, 'Unauthorized'));
    const response = await postCatalogProduct(new NextRequest('http://localhost/api/upload/catalog-product', { method: 'POST' }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'Unauthorized' });
  });

  it('propagates worker failures without DB writes', async () => {
    forwardUploadToWorkerMock.mockRejectedValueOnce(new UploadRouteError(502, 'Image processing failed.'));
    const response = await postCatalogProduct(new NextRequest('http://localhost/api/upload/catalog-product', { method: 'POST' }));
    expect(response.status).toBe(502);
    expect(state.insertedProductImage).toBeNull();
  });
});
