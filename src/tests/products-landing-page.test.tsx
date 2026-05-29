import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useTenantProductsMock = vi.fn();
const useFlagMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useProducts', () => ({
  useTenantProducts: () => useTenantProductsMock(),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
}));

vi.mock('@/components/seller/products/AddProductSheet', () => ({
  AddProductSheet: () => null,
}));

import ProductsPage from '../../app/(seller)/products/page';

describe('products landing integration', () => {
  beforeEach(() => {
    useTenantProductsMock.mockReset();
    useFlagMock.mockReset();
  });

  it('renders flag-off empty state and does not fetch data when disabled', () => {
    useFlagMock.mockReturnValue(false);

    render(<ProductsPage />);

    expect(screen.getByText("This feature isn't enabled yet.")).toBeInTheDocument();
    expect(useTenantProductsMock).not.toHaveBeenCalled();
  });
});
