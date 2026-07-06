import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let queryParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => queryParams,
}));

vi.mock('@/lib/supabase-browser', () => ({
  supabaseBrowser: {
    auth: {
      setSession: vi.fn(),
    },
  },
}));

describe('VerifyPage', () => {
  beforeEach(() => {
    queryParams = new URLSearchParams({ ref_id: 'ref-1', phone: '9876543210' });
  });

  it('shows the login-with-email fallback only in the otp footer', async () => {
    const VerifyPage = await import('../../../app/(auth)/verify/page').then((mod) => mod.default);

    render(<VerifyPage />);

    expect(screen.getByRole('link', { name: /Login with Email/i })).toHaveAttribute('href', '/login?view=email');
    expect(screen.getAllByRole('link', { name: /Login with Email/i })).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Change number/i })).toHaveAttribute('href', '/login');
  });
});
