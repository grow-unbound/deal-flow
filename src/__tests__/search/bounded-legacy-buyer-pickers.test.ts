import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function source(path: string) {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

describe('legacy buyer pickers use bounded server search', () => {
  it.each([
    'src/components/seller/price-lists/AssignmentsPanel.tsx',
  ])('%s avoids the unbounded customer universe', (path) => {
    const contents = source(path);

    expect(contents).toContain('/api/tenant/buyers/search?');
    expect(contents).toContain('limit: String(BUYER_SEARCH_LIMIT)');
    expect(contents).toContain('useDebounce');
    expect(contents).not.toContain("apiFetch('/api/customers')");
    expect(contents).not.toContain("fetch('/api/customers'");
  });

  it('retains the selected price-list buyer label after the result page changes', () => {
    const contents = source('src/components/seller/price-lists/AssignmentsPanel.tsx');

    expect(contents).toContain('buyerCache');
    expect(contents).toContain('const selectedBuyer = targetId ? buyerCache[targetId]');
  });
});
