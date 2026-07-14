import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const hooks = [
  'useBrands.ts',
  'useCategories.ts',
  'useLocations.ts',
  'useWarehouses.ts',
  'useCohorts.ts',
  'useCatalogs.ts',
  'usePriceLists.ts',
].map((file) => readFileSync(join(process.cwd(), 'src/hooks', file), 'utf8'));

describe('seller landing client pagination contracts', () => {
  it('fetches exactly one bounded page per infinite-query invocation', () => {
    for (const source of hooks) {
      expect(source).toContain('useInfiniteQuery');
      expect(source).toContain("limit: '50'");
      expect(source).toContain('offset: String(pageParam)');
      expect(source).toContain('getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined');
      expect(source).not.toContain('fetchCompleteSellerLanding');
      expect(source).not.toMatch(/while\s*\(/);
    }
  });

  it('retains loaded rows and requests summaries only for the initial page', () => {
    for (const source of hooks) {
      expect(source).toContain('mergeSellerLandingPages');
      expect(source).toMatch(/include_summary:\s*String\(pageParam === 0/);
      expect(source).toContain('placeholderData: keepPreviousData');
    }
  });
});
