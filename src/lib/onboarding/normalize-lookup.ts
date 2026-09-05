/** Port of scripts/upload-tenant-images.mjs normalizeLookup. */
export function normalizeLookup(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '');
}
