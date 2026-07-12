// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const apiFetchMock = vi.fn();
const storageFactory = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

import { GlobalSearchOverlay } from '@/components/seller/layout/GlobalSearchOverlay';

function makeResponse(groups: Array<{ entity_type: string; items: Array<{ id: string; label: string; sublabel?: string; url_path: string }> }>) {
  return {
    ok: true,
    json: async () => ({
      groups,
      total: groups.reduce((sum, group) => sum + group.items.length, 0),
    }),
  };
}

async function performSearch(query: string) {
  render(<GlobalSearchOverlay />);

  const input = screen.getByRole('searchbox', { name: 'Search seller entities' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: query } });

  await act(async () => {
    vi.advanceTimersByTime(250);
    await Promise.resolve();
  });

  expect(apiFetchMock).toHaveBeenCalled();

  await act(async () => {
    await Promise.resolve();
  });
}

describe('GlobalSearchOverlay', () => {
  beforeEach(() => {
    pushMock.mockReset();
    apiFetchMock.mockReset();
    Object.defineProperty(globalThis, 'localStorage', { value: storageFactory(), configurable: true });
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (vi.isFakeTimers()) {
      vi.runOnlyPendingTimers();
    }
    vi.useRealTimers();
  });

  it.each([
    ['product', 'Alpha Cable', '/products/tp-1'],
    ['brand', 'Vinikus', '/brands/b-1'],
    ['customer', 'Acme Retail', '/customers/c-1'],
    ['category', 'Cables', '/categories/cat-1'],
    ['location', 'Bengaluru', '/locations/loc-1'],
    ['warehouse', 'Central WH', '/warehouses/wh-1'],
    ['cohort', 'North Retailers', '/customer-groups/cg-1'],
    ['campaign', 'Monsoon Push', '/campaigns/cmp-1'],
    ['price_list', 'North Pricing', '/price-lists/pl-1'],
    ['order', 'SO-001', '/sales-orders/o-1'],
    ['invoice', 'INV-001', '/invoices/i-1'],
    ['estimate', 'EST-001', '/estimates/e-1'],
  ])('navigates %s results to detail pages', async (entityType, label, urlPath) => {
    apiFetchMock.mockResolvedValueOnce(makeResponse([
      {
        entity_type: entityType,
        items: [{ id: `${entityType}-1`, label, sublabel: 'meta', url_path: urlPath }],
      },
    ]));

    await performSearch('alpha');

    fireEvent.click(screen.getByRole('button', { name: new RegExp(label, 'i') }));

    expect(pushMock).toHaveBeenCalledWith(urlPath);
  });

  it.each([
    ['product', 'products', '/products'],
    ['brand', 'brands', '/brands'],
    ['customer', 'customers', '/customers'],
    ['category', 'categories', '/categories'],
    ['location', 'locations', '/locations'],
    ['warehouse', 'warehouses', '/warehouses'],
    ['cohort', 'customer groups', '/customer-groups'],
    ['campaign', 'campaigns', '/campaigns'],
    ['price_list', 'price lists', '/price-lists'],
    ['order', 'orders', '/sales-orders'],
    ['invoice', 'invoices', '/invoices'],
    ['estimate', 'estimates', '/estimates'],
  ])('routes "See all" for %s to the landing page with the query applied', async (entityType, labelText, baseUrl) => {
    apiFetchMock.mockResolvedValueOnce(makeResponse([
      {
        entity_type: entityType,
        items: Array.from({ length: 5 }, (_, index) => ({
          id: `${entityType}-${index + 1}`,
          label: `${labelText}-${index + 1}`,
          url_path: `${baseUrl}/${index + 1}`,
        })),
      },
    ]));

    await performSearch('alpha');

    fireEvent.click(screen.getByRole('button', { name: `See all ${labelText} →` }));

    expect(pushMock).toHaveBeenCalledWith(`${baseUrl}?search=alpha`);
  });
});
