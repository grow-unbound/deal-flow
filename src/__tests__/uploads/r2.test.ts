import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateImageFile } from '@/components/seller/products/ImageUploadZone';

// ── Pure validation function tests ────────────────────────────────────────────
describe('validateImageFile', () => {
  it('returns null for a valid JPEG under 5MB', () => {
    expect(validateImageFile({ size: 5 * 1024 * 1024, type: 'image/jpeg' })).toBeNull();
  });

  it('returns null for a valid PNG under 5MB', () => {
    expect(validateImageFile({ size: 1024 * 1024, type: 'image/png' })).toBeNull();
  });

  it('returns null for a valid WebP under 5MB', () => {
    expect(validateImageFile({ size: 2 * 1024 * 1024, type: 'image/webp' })).toBeNull();
  });

  it('returns error for a file exactly at 5MB limit (inclusive)', () => {
    // 5MB exactly is valid (<=)
    expect(validateImageFile({ size: 5 * 1024 * 1024, type: 'image/jpeg' })).toBeNull();
  });

  it('returns "Image must be under 5MB." for a file over 5MB', () => {
    const result = validateImageFile({ size: 5 * 1024 * 1024 + 1, type: 'image/jpeg' });
    expect(result).toBe('Image must be under 5MB.');
  });

  it('returns "Image must be under 5MB." for a 10MB file', () => {
    const result = validateImageFile({ size: 10 * 1024 * 1024, type: 'image/png' });
    expect(result).toBe('Image must be under 5MB.');
  });

  it('returns type error for image/gif', () => {
    const result = validateImageFile({ size: 100, type: 'image/gif' });
    expect(result).toBe('Only JPG, PNG, and WebP images are allowed.');
  });

  it('returns type error for application/pdf', () => {
    const result = validateImageFile({ size: 100, type: 'application/pdf' });
    expect(result).toBe('Only JPG, PNG, and WebP images are allowed.');
  });

  it('returns type error for video/mp4', () => {
    const result = validateImageFile({ size: 100, type: 'video/mp4' });
    expect(result).toBe('Only JPG, PNG, and WebP images are allowed.');
  });
});

// ── API route tests (mock fetch) ──────────────────────────────────────────────
describe('POST /api/uploads/r2', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns uploadUrl, publicUrl, key for a valid request', async () => {
    const mockResponse = {
      uploadUrl: 'https://r2.cloudflarestorage.com/bucket/products/tenant/12345-image.jpg?sig=abc',
      publicUrl: 'https://assets.yukti.so/products/tenant/12345-image.jpg',
      key: 'products/tenant/12345-image.jpg',
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as unknown as Response);

    const res = await fetch('/api/uploads/r2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'image.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1024 * 1024,
      }),
    });

    expect(res.ok).toBe(true);
    const data = await res.json() as any;
    expect(data).toHaveProperty('uploadUrl');
    expect(data).toHaveProperty('publicUrl');
    expect(data).toHaveProperty('key');
  });

  it('returns 400 for a file over 5MB', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Image must be under 5MB.' }),
    } as unknown as Response);

    const res = await fetch('/api/uploads/r2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'big.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 10 * 1024 * 1024, // 10MB
      }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toBe('Image must be under 5MB.');
  });

  it('returns 400 for an invalid content type', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Only JPG, PNG, and WebP images are allowed.' }),
    } as unknown as Response);

    const res = await fetch('/api/uploads/r2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'doc.pdf',
        contentType: 'application/pdf',
        sizeBytes: 512,
      }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toMatch(/JPG|PNG|WebP/);
  });

  it('returns 401 for unauthenticated requests', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    } as unknown as Response);

    const res = await fetch('/api/uploads/r2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'image.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
      }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    const data = await res.json() as any;
    expect(data.error).toBe('Unauthorized');
  });
});
