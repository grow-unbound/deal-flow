import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const searchParamsGetMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  useSearchParams: () => ({
    get: searchParamsGetMock,
  }),
}));

vi.mock('@/components/buyer/auth/PhoneInput', () => ({
  PhoneInput: () => <div>Phone input</div>,
}));

describe('PhoneLoginPage', () => {
  beforeEach(() => {
    pushMock.mockReset();
    searchParamsGetMock.mockReset();
  });

  it('shows the expired-session banner on the buyer OTP entry screen', async () => {
    searchParamsGetMock.mockImplementation((key: string) =>
      key === 'reason' ? 'session_expired' : null,
    );

    const PhoneLoginPage = (await import('../../../app/(auth)/login/phone/page')).default;
    render(<PhoneLoginPage />);

    expect(await screen.findByText('Your session has expired. Please log in again.')).toBeInTheDocument();
    expect(screen.getByText('Phone input')).toBeInTheDocument();
  });
});
