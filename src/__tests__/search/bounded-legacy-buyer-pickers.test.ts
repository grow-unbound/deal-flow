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

    // AssignmentsPanel now calls the shared cohort-composer buyer picker (same
    // endpoint used by the Customer Group and Campaign forms) instead of its own
    // /api/tenant/buyers/search call, but the bound (small page size, debounced
    // search) is preserved via useCohortComposerBuyers.
    expect(contents).toContain('useCohortComposerBuyers');
    expect(contents).toContain('limit: BUYER_SEARCH_LIMIT');
    expect(contents).toContain('useDebounce');
    expect(contents).not.toContain("apiFetch('/api/customers')");
    expect(contents).not.toContain("fetch('/api/customers'");
  });

  it('retains the selected price-list buyer label after the result page changes', () => {
    const contents = source('src/components/seller/price-lists/AssignmentsPanel.tsx');

    expect(contents).toContain('buyerCache');
    expect(contents).toContain('const selectedBuyer = targetId ? buyerCache[targetId]');
  });

  it('the shared cohort-composer buyer hook hard-caps selected-buyer preload ids, never an unbounded list', () => {
    const contents = source('src/hooks/useCohorts.ts');

    expect(contents).toContain('SELECTED_BUYERS_LIMIT = 250');
    expect(contents).toContain('selectedIds.slice(0, SELECTED_BUYERS_LIMIT)');
  });
});
