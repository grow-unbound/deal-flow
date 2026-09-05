import { describe, expect, it } from 'vitest';
import { buildColumnMappings, duplicateYuktiFields, isOverriddenMapping, missingEssentialFields, reassignMappingField, suggestYuktiField } from '@/lib/onboarding/column-mapping';
import { mapRawRowToImport, detectRowAnomalies, uniqueSlugForName } from '@/lib/onboarding/import-rows';
import { collectWebkitEntryFiles, extractPhotoFiles, filesToPhotoEntries, folderNameFromPhotoEntries, folderUploadDialogCopy, matchPhotosToCandidates, snapshotFileList, type WebkitFsDirectoryEntry, type WebkitFsFileEntry } from '@/lib/onboarding/photo-match';

describe('onboarding column mapping', () => {
  it('aliases item code and rate before fuzzball', () => {
    expect(suggestYuktiField('Item Code')).toEqual({ field: 'internal_sku', confidence: 100 });
    expect(suggestYuktiField('Rate')).toEqual({ field: 'base_selling_price', confidence: 100 });
  });

  it('does not assign the same Yukti field twice', () => {
    const mappings = buildColumnMappings(['SKU', 'Item Code', 'Name'], { SKU: 'A', 'Item Code': 'B', Name: 'Cam' });
    const skuFields = mappings.filter((m) => m.yuktiField === 'internal_sku');
    expect(skuFields).toHaveLength(1);
  });

  it('aliases brand_slug from the product template', () => {
    expect(suggestYuktiField('brand_slug')).toEqual({ field: 'brand', confidence: 100 });
  });

  it('flags essential Yukti fields that no column maps to', () => {
    const mappings = buildColumnMappings(
      ['internal_sku', 'name', 'brand_slug', 'mrp', 'base_selling_price', 'gst_rate'],
      { internal_sku: 'SKU001', name: 'Cam', brand_slug: 'cp', mrp: '100', base_selling_price: '85', gst_rate: '18' },
    );
    expect(missingEssentialFields(mappings)).toEqual(['category']);
  });

  it('steals a Yukti field from the previous column instead of duplicating it', () => {
    const mappings = buildColumnMappings(['SKU', 'Name'], { SKU: 'A', Name: 'Cam' });
    const next = reassignMappingField(mappings, 1, 'internal_sku');
    expect(next.filter((m) => m.yuktiField === 'internal_sku')).toHaveLength(1);
    expect(next[0]?.yuktiField).toBe('unmapped');
    expect(next[1]?.yuktiField).toBe('internal_sku');
    expect(duplicateYuktiFields(next)).toEqual([]);
    expect(isOverriddenMapping(next[1]!)).toBe(true);
  });
});

describe('onboarding import rows', () => {
  it('requires SKU and flags dirty GST/price', () => {
    expect(mapRawRowToImport({ internal_sku: '', name: 'X' })).toBeNull();
    const row = mapRawRowToImport({ internal_sku: 'A1', name: 'Cam', gst_rate: '', base_selling_price: '0' });
    expect(row?.internal_sku).toBe('A1');
    const anomalies = detectRowAnomalies(row!, false);
    expect(anomalies.map((a) => a.kind)).toEqual(expect.arrayContaining(['missing_gst', 'zero_price']));
  });

  it('suffixes colliding slugs', () => {
    const taken = new Set(['cp-plus']);
    expect(uniqueSlugForName('CP Plus', taken)).toBe('cp-plus-2');
  });
});

describe('photo match two-pass', () => {
  it('exact-matches SKU stems before fuzzball leftovers', () => {
    const file = new File(['x'], 'CP-DM-24.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'webkitRelativePath', { value: 'products/CP-DM-24.jpg' });
    const photos = extractPhotoFiles([file]);
    const results = matchPhotosToCandidates(photos, [
      { key: 'CP-DM-24', entityId: 'p1', entityType: 'tenant_product', label: 'Dome' },
      { key: 'OTHER', entityId: 'p2', entityType: 'tenant_product', label: 'Other' },
    ]);
    expect(results[0]?.matchKind).toBe('exact');
    expect(results[0]?.candidate?.entityId).toBe('p1');
  });

  it('skips resized and dotfiles', () => {
    const skipped = extractPhotoFiles([
      new File(['x'], '.DS_Store', { type: 'text/plain' }),
      new File(['x'], 'sku_resized.jpg', { type: 'image/jpeg' }),
    ]);
    expect(skipped).toHaveLength(0);
  });

  it('keeps explicit relative paths from directory walks', () => {
    const file = new File(['x'], 'CP-DM-24.jpg', { type: 'image/jpeg' });
    const photos = extractPhotoFiles([{ file, relativePath: 'products/CP-DM-24.jpg' }]);
    expect(photos[0]?.stem).toBe('CP-DM-24');
  });
});

describe('folder upload confirm copy', () => {
  it('renames the chrome title and keeps the trust warning', () => {
    expect(folderUploadDialogCopy(12, 'product-photos')).toEqual({
      title: 'Upload 12 files to your catalog',
      message: 'This will upload all files from “product-photos”. Only do this if you trust the site.',
    });
    expect(folderUploadDialogCopy(1, 'sku').title).toBe('Upload 1 file to your catalog');
  });

  it('uses the dropped folder name when paths are nested', () => {
    expect(folderNameFromPhotoEntries([
      { relativePath: 'product-images/SKU-1.jpg' },
      { relativePath: 'product-images/SKU-2.jpg' },
    ])).toBe('product-images');
  });

  it('copies FileList before the input is reset', () => {
    const file = new File(['x'], 'SKU-1.jpg', { type: 'image/jpeg' });
    const list = {
      0: file,
      length: 1,
      item: (index: number) => (index === 0 ? file : null),
      [Symbol.iterator]: function* () { yield file; },
    } as unknown as FileList;
    const copied = snapshotFileList(list);
    expect(copied).toHaveLength(1);
    expect(filesToPhotoEntries(copied)[0]?.file.name).toBe('SKU-1.jpg');
    expect(snapshotFileList(null)).toEqual([]);
  });
});

describe('collectWebkitEntryFiles', () => {
  it('walks nested folders and preserves relative paths', async () => {
    const file: WebkitFsFileEntry = {
      isFile: true,
      isDirectory: false,
      name: 'SKU-1.jpg',
      file: (ok) => ok(new File(['x'], 'SKU-1.jpg', { type: 'image/jpeg' })),
    };
    const nested: WebkitFsDirectoryEntry = {
      isFile: false,
      isDirectory: true,
      name: 'products',
      createReader: () => {
        let sent = false;
        return {
          readEntries: (ok) => {
            if (sent) {
              ok([]);
              return;
            }
            sent = true;
            ok([file]);
          },
        };
      },
    };
    const root: WebkitFsDirectoryEntry = {
      isFile: false,
      isDirectory: true,
      name: 'photos',
      createReader: () => {
        let sent = false;
        return {
          readEntries: (ok) => {
            if (sent) {
              ok([]);
              return;
            }
            sent = true;
            ok([nested]);
          },
        };
      },
    };
    const files = await collectWebkitEntryFiles(root);
    expect(files.map((entry) => entry.relativePath)).toEqual(['photos/products/SKU-1.jpg']);
  });
});
