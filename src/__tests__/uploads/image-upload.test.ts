import { beforeAll, describe, expect, it, vi } from 'vitest';

let r2Url: typeof import('@/lib/r2-url').r2Url;
let r2Urls: typeof import('@/lib/r2-url').r2Urls;
let validateUploadImageFile: typeof import('@/lib/server/image-upload').validateUploadImageFile;
let UploadRouteError: typeof import('@/lib/server/image-upload').UploadRouteError;

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: vi.fn(),
}));

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_R2_BASE_URL', 'https://assets.yukti.so');
  ({ r2Url, r2Urls } = await import('@/lib/r2-url'));
  ({ validateUploadImageFile, UploadRouteError } = await import('@/lib/server/image-upload'));
});

describe('r2Url', () => {
  it('returns null for empty keys', () => {
    expect(r2Url(null)).toBeNull();
    expect(r2Url(undefined)).toBeNull();
  });

  it('normalizes a relative key into a public URL', () => {
    expect(r2Url('/catalog/products/123/medium.webp')).toBe('https://assets.yukti.so/catalog/products/123/medium.webp');
  });

  it('maps a variant set to public URLs', () => {
    expect(
      r2Urls({
        original: 'catalog/products/123/original.jpg',
        medium: 'catalog/products/123/medium.webp',
      }),
    ).toEqual({
      original: 'https://assets.yukti.so/catalog/products/123/original.jpg',
      medium: 'https://assets.yukti.so/catalog/products/123/medium.webp',
    });
  });
});

describe('validateUploadImageFile', () => {
  it('accepts jpg, png, and webp files under 5MB', () => {
    expect(() => validateUploadImageFile({ size: 5 * 1024 * 1024, type: 'image/jpeg' })).not.toThrow();
    expect(() => validateUploadImageFile({ size: 1024, type: 'image/png' })).not.toThrow();
    expect(() => validateUploadImageFile({ size: 1024, type: 'image/webp' })).not.toThrow();
  });

  it('rejects files over 5MB', () => {
    expect(() => validateUploadImageFile({ size: 5 * 1024 * 1024 + 1, type: 'image/jpeg' })).toThrowError(
      new UploadRouteError(413, 'Image must be under 5MB.'),
    );
  });

  it('rejects unsupported MIME types', () => {
    expect(() => validateUploadImageFile({ size: 100, type: 'image/gif' })).toThrowError(
      new UploadRouteError(415, 'Only JPG, PNG, and WebP images are allowed.'),
    );
  });
});
