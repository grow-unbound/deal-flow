import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
}));

vi.mock('@/hooks/useBuyerNavigationDirection', () => ({
  markBuyerNavigationForward: vi.fn(),
}));

import { BuyerEntityChipNav } from '@/components/buyer/catalog/BuyerEntityChipNav';

const categories = [
  { id: 'cat-1', name: 'HD Camera', product_count: 23, image_url: null },
  { id: 'cat-2', name: 'DVR', product_count: 12, image_url: null },
];

describe('BuyerEntityChipNav', () => {
  it('navigates to category detail from landing', () => {
    render(
      <BuyerEntityChipNav
        kind="category"
        categories={categories}
        selectedId={null}
        mode="landing"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /HD Camera/i }));
    expect(push).toHaveBeenCalledWith('/buy/catalog/category/cat-1');
  });

  it('replaces route when switching categories on detail', () => {
    render(
      <BuyerEntityChipNav
        kind="category"
        categories={categories}
        selectedId="cat-1"
        mode="detail"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^DVR/ }));
    expect(replace).toHaveBeenCalledWith('/buy/catalog/category/cat-2');
  });

  it('returns to catalog landing when All is tapped on detail', () => {
    render(
      <BuyerEntityChipNav
        kind="category"
        categories={categories}
        selectedId="cat-1"
        mode="detail"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(push).toHaveBeenCalledWith('/buy/catalog');
  });
});
