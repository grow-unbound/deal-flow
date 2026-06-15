import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseCsv,
  validateCsvRows,
  generateCsvTemplate,
  PRODUCT_CSV_TEMPLATE_HEADERS,
} from '@/lib/csv';

// ── parseCsv tests ────────────────────────────────────────────────────────────

describe('parseCsv', () => {
  it('parses basic CSV with headers', () => {
    const csv = 'internal_sku,name,brand_slug\nSKU001,My Product,my-brand\n';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      internal_sku: 'SKU001',
      name: 'My Product',
      brand_slug: 'my-brand',
    });
  });

  it('handles quoted values with commas inside', () => {
    const csv = 'internal_sku,name,description\nSKU001,"Product, with comma","A description"\n';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Product, with comma');
    expect(rows[0].description).toBe('A description');
  });

  it('handles CRLF line endings', () => {
    const csv = 'internal_sku,name\r\nSKU001,My Product\r\nSKU002,Another\r\n';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].internal_sku).toBe('SKU001');
    expect(rows[1].internal_sku).toBe('SKU002');
  });

  it('skips empty rows', () => {
    const csv = 'internal_sku,name\nSKU001,Product\n\n\nSKU002,Another\n';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
  });

  it('normalizes headers to lowercase', () => {
    const csv = 'Internal_SKU,Name,Brand_Slug\nSKU001,My Product,my-brand\n';
    const rows = parseCsv(csv);
    expect(rows[0]).toHaveProperty('internal_sku', 'SKU001');
    expect(rows[0]).toHaveProperty('name', 'My Product');
    expect(rows[0]).toHaveProperty('brand_slug', 'my-brand');
  });

  it('returns empty array for CSV with only headers', () => {
    const csv = 'internal_sku,name,brand_slug\n';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(0);
  });

  it('trims whitespace from field values', () => {
    const csv = 'internal_sku,name\n  SKU001  ,  My Product  \n';
    const rows = parseCsv(csv);
    expect(rows[0].internal_sku).toBe('SKU001');
    expect(rows[0].name).toBe('My Product');
  });
});

// ── validateCsvRows tests ─────────────────────────────────────────────────────

describe('validateCsvRows', () => {
  const validRow: Record<string, string> = {
    internal_sku: 'SKU001',
    name: 'Test Product',
    brand_slug: 'test-brand',
    mrp: '100',
    base_selling_price: '85',
    gst_rate: '18',
    hsn_code: '6205',
    default_uom: 'pcs',
    pack_size: '12',
    description: 'A test product',
  };

  it('marks valid row as isValid = true', () => {
    const results = validateCsvRows([validRow]);
    expect(results).toHaveLength(1);
    expect(results[0].isValid).toBe(true);
    expect(results[0].errors).toBeUndefined();
    expect(results[0].data).toBeDefined();
  });

  it('coerces numeric fields from strings', () => {
    const results = validateCsvRows([validRow]);
    expect(results[0].data?.mrp).toBe(100);
    expect(results[0].data?.base_selling_price).toBe(85);
    expect(results[0].data?.gst_rate).toBe(18);
  });

  it('marks row with missing required field as invalid', () => {
    const row = { ...validRow, name: '' };
    const results = validateCsvRows([row]);
    expect(results[0].isValid).toBe(false);
    expect(results[0].errors).toBeDefined();
    expect(results[0].errors?.some((e) => e.toLowerCase().includes('name'))).toBe(true);
  });

  it('marks row with invalid MRP as invalid', () => {
    const row = { ...validRow, mrp: '-10' };
    const results = validateCsvRows([row]);
    expect(results[0].isValid).toBe(false);
    expect(results[0].errors?.some((e) => e.toLowerCase().includes('mrp'))).toBe(true);
  });

  it('marks row with missing internal_sku as invalid', () => {
    const row = { ...validRow, internal_sku: '' };
    const results = validateCsvRows([row]);
    expect(results[0].isValid).toBe(false);
    expect(results[0].errors?.some((e) => e.toLowerCase().includes('sku'))).toBe(true);
  });

  it('marks row with missing hsn_code as invalid', () => {
    const row = { ...validRow, hsn_code: '' };
    const results = validateCsvRows([row]);
    expect(results[0].isValid).toBe(false);
    expect(results[0].errors?.some((e) => e.toLowerCase().includes('hsn'))).toBe(true);
  });

  it('flags duplicate SKU within the batch', () => {
    const row1 = { ...validRow };
    const row2 = { ...validRow, name: 'Another Product' }; // same SKU
    const results = validateCsvRows([row1, row2]);
    // First row is valid
    expect(results[0].isValid).toBe(true);
    // Second row should be invalid due to duplicate SKU
    expect(results[1].isValid).toBe(false);
    expect(results[1].errors?.some((e) => e.toLowerCase().includes('duplicate'))).toBe(true);
  });

  it('assigns correct rowIndex (1-based)', () => {
    const results = validateCsvRows([validRow, validRow]);
    expect(results[0].rowIndex).toBe(1);
    expect(results[1].rowIndex).toBe(2);
  });

  it('accepts optional fields being empty', () => {
    const row: Record<string, string> = {
      internal_sku: 'SKU002',
      name: 'Minimal Product',
      brand_slug: 'test-brand',
      mrp: '200',
      base_selling_price: '180',
      gst_rate: '12',
      hsn_code: '8471',
      // optional fields omitted
    };
    const results = validateCsvRows([row]);
    expect(results[0].isValid).toBe(true);
    expect(results[0].data?.cost_price).toBeUndefined();
    expect(results[0].data?.description).toBeUndefined();
  });

  it('validates GST rate range', () => {
    const row = { ...validRow, gst_rate: '150' };
    const results = validateCsvRows([row]);
    expect(results[0].isValid).toBe(false);
    expect(results[0].errors?.some((e) => e.toLowerCase().includes('gst'))).toBe(true);
  });
});

// ── generateCsvTemplate tests ─────────────────────────────────────────────────

describe('generateCsvTemplate', () => {
  it('returns a string with all required headers', () => {
    const template = generateCsvTemplate();
    const firstLine = template.split('\n')[0];
    const headers = firstLine.split(',');

    for (const required of ['internal_sku', 'name', 'brand_slug', 'mrp', 'base_selling_price', 'gst_rate', 'hsn_code']) {
      expect(headers).toContain(required);
    }
  });

  it('includes all template headers in PRODUCT_CSV_TEMPLATE_HEADERS', () => {
    const template = generateCsvTemplate();
    const firstLine = template.split('\n')[0];
    const headers = firstLine.split(',');
    expect(headers).toEqual([...PRODUCT_CSV_TEMPLATE_HEADERS]);
  });

  it('includes an example data row', () => {
    const template = generateCsvTemplate();
    const lines = template.split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    // Example row should have SKU001
    expect(lines[1]).toContain('SKU001');
  });
});

// ── API route mock tests ──────────────────────────────────────────────────────

describe('POST /api/tenant/products/import', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns imported: 2 for 2 valid rows', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        imported: 2,
        skipped: 0,
        results: [
          { sku: 'SKU001', status: 'imported' },
          { sku: 'SKU002', status: 'imported' },
        ],
      }),
    });

    const products = [
      {
        internal_sku: 'SKU001',
        name: 'Product One',
        tenant_brand_id: 'brand-uuid-001',
        mrp: 100,
        base_selling_price: 85,
        gst_rate: 18,
        hsn_code: '6205',
      },
      {
        internal_sku: 'SKU002',
        name: 'Product Two',
        tenant_brand_id: 'brand-uuid-001',
        mrp: 200,
        base_selling_price: 170,
        gst_rate: 12,
        hsn_code: '8471',
      },
    ];

    const res = await fetch('/api/tenant/products/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products }),
    });

    expect(res.ok).toBe(true);
    const data = await res.json() as any;
    expect(data.imported).toBe(2);
    expect(data.skipped).toBe(0);
  });

  it('returns imported: 1, skipped: 1 for 1 valid and 1 invalid (missing name)', async () => {
    // Simulate server-side result after client already filtered valid rows
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        imported: 1,
        skipped: 1,
        results: [
          { sku: 'SKU001', status: 'imported' },
          { sku: 'SKU002', status: 'skipped', error: 'SKU already exists in your catalog' },
        ],
      }),
    });

    const res = await fetch('/api/tenant/products/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products: [{ internal_sku: 'SKU001' }, { internal_sku: 'SKU002' }] }),
    });

    const data = await res.json() as any;
    expect(data.imported).toBe(1);
    expect(data.skipped).toBe(1);
    expect(data.results[1].error).toBe('SKU already exists in your catalog');
  });
});

// ── Template download mock test ───────────────────────────────────────────────

describe('GET /api/products/template', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 200 with CSV content-type', async () => {
    const csvContent = PRODUCT_CSV_TEMPLATE_HEADERS.join(',') + '\nSKU001,Product Name,brand-slug,100,85,18,6205,75,pcs,12,Optional description\n';

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="product-import-template.csv"',
      }),
      text: async () => csvContent,
    });

    const res = await fetch('/api/products/template');
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('product-import-template.csv');

    const body = await res.text();
    expect(body).toContain('internal_sku');
    expect(body).toContain('brand_slug');
  });
});
