import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
}));

vi.mock('@/hooks/useBuyerNavigationDirection', () => ({
  markBuyerNavigationForward: vi.fn(),
  navigateBuyerBack: vi.fn(),
}));

import { BuyerEntityChipNav } from '@/components/buyer/catalog/BuyerEntityChipNav';

const categories = [
  { id: 'cat-1', name: 'HD Camera', product_count: 23, image_url: null },
  { id: 'cat-2', name: 'DVR', product_count: 12, image_url: null },
  { id: 'cat-3', name: 'NVR', product_count: 8, image_url: null },
  { id: 'cat-4', name: 'Cables', product_count: 40, image_url: null },
  { id: 'cat-5', name: 'Power', product_count: 15, image_url: null },
  { id: 'cat-6', name: 'Mounts', product_count: 9, image_url: null },
];

describe('BuyerEntityChipNav', () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    window.sessionStorage.clear();
  });

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

  it('restores saved scroll before paint so smooth recenter does not jump from 0', () => {
    const { unmount } = render(
      <BuyerEntityChipNav
        kind="category"
        categories={categories}
        selectedId="cat-1"
        mode="detail"
      />,
    );

    const rail = screen.getByLabelText('Filter by category');
    Object.defineProperty(rail, 'scrollLeft', { value: 140, writable: true, configurable: true });
    fireEvent.scroll(rail);
    expect(window.sessionStorage.getItem('buyer-chip-scroll:category:detail')).toBe('140');

    fireEvent.click(screen.getByRole('button', { name: /^NVR/ }));
    expect(replace).toHaveBeenCalledWith('/buy/catalog/category/cat-3');
    expect(window.sessionStorage.getItem('buyer-chip-scroll:category:detail')).toBe('140');

    unmount();

    render(
      <BuyerEntityChipNav
        kind="category"
        categories={categories}
        selectedId="cat-3"
        mode="detail"
      />,
    );

    const nextRail = screen.getByLabelText('Filter by category');
    expect(nextRail.scrollLeft).toBe(140);
  });
});
