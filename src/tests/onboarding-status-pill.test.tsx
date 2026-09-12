import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe('OnboardingStatusPill', () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it('navigates needs_more_info to /resubmit-documents (Task 11 -- was a /pending stub)', async () => {
    const { OnboardingStatusPill } = await import('@/components/buyer/layout/OnboardingStatusPill');
    render(<OnboardingStatusPill status="needs_more_info" />);
    fireEvent.click(screen.getByText('More info needed'));
    expect(pushMock).toHaveBeenCalledWith('/resubmit-documents');
  });

  it('still navigates pending_approval to /pending', async () => {
    const { OnboardingStatusPill } = await import('@/components/buyer/layout/OnboardingStatusPill');
    render(<OnboardingStatusPill status="pending_approval" />);
    fireEvent.click(screen.getByText('Account verification in progress'));
    expect(pushMock).toHaveBeenCalledWith('/pending');
  });

  it('still navigates declined to /pending', async () => {
    const { OnboardingStatusPill } = await import('@/components/buyer/layout/OnboardingStatusPill');
    render(<OnboardingStatusPill status="declined" />);
    fireEvent.click(screen.getByText('Access declined'));
    expect(pushMock).toHaveBeenCalledWith('/pending');
  });

  it('renders nothing for approved/null', async () => {
    const { OnboardingStatusPill } = await import('@/components/buyer/layout/OnboardingStatusPill');
    const { container: c1 } = render(<OnboardingStatusPill status="approved" />);
    expect(c1).toBeEmptyDOMElement();
    const { container: c2 } = render(<OnboardingStatusPill status={null} />);
    expect(c2).toBeEmptyDOMElement();
  });
});
