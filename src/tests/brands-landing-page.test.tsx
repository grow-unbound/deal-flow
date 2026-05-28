import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const useTenantBrandsMock = vi.fn();
const useFlagMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useBrands', () => ({
  useTenantBrands: () => useTenantBrandsMock(),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
}));

vi.mock('@/components/seller/brands/AddBrandCommand', () => ({
  AddBrandCommand: () => null,
}));

vi.mock('@/components/seller/InviteUserDialog', () => ({
  InviteUserDialog: () => null,
}));

import BrandsPage from '../../app/(seller)/brands/page';

describe('brands landing integration', () => {
  beforeEach(() => {
    useTenantBrandsMock.mockReset();
    useFlagMock.mockReset();
  });

  it('renders flag-off empty state and does not fetch data when disabled', () => {
    useFlagMock.mockReturnValue(false);

    render(<BrandsPage />);

    expect(screen.getByText("This feature isn't enabled yet.")).toBeInTheDocument();
    expect(useTenantBrandsMock).not.toHaveBeenCalled();
  });
});
