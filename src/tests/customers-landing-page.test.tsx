import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useCustomersLandingMock = vi.fn();
const useFlagMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useCustomersLanding', () => ({
  useCustomersLanding: () => useCustomersLandingMock(),
  useCreateCustomerOptimistic: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
}));

vi.mock('@/components/seller/InviteUserDialog', () => ({ InviteUserDialog: () => null }));

import CustomersPage from '../../app/(seller)/customers/page';

describe('customers landing integration', () => {
  beforeEach(() => {
    useCustomersLandingMock.mockReset();
    useFlagMock.mockReset();
  });

  it('renders flag-off state and does not fetch landing data', () => {
    useFlagMock.mockReturnValue(false);

    render(<CustomersPage />);

    expect(screen.getByText("This feature isn't enabled yet.")).toBeInTheDocument();
    expect(useCustomersLandingMock).not.toHaveBeenCalled();
  });
});
