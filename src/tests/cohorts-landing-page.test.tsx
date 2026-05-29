import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const useCohortsLandingMock = vi.fn();
const useFlagMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useCohorts', () => ({
  useCohortsLanding: () => useCohortsLandingMock(),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
}));

import CohortsPage from '../../app/(seller)/cohorts/page';

describe('cohorts landing integration', () => {
  beforeEach(() => {
    useCohortsLandingMock.mockReset();
    useFlagMock.mockReset();
  });

  it('renders flag-off empty state and does not fetch data when disabled', () => {
    useFlagMock.mockReturnValue(false);

    render(<CohortsPage />);

    expect(screen.getByText("This feature isn't enabled yet.")).toBeInTheDocument();
    expect(useCohortsLandingMock).not.toHaveBeenCalled();
  });
});

