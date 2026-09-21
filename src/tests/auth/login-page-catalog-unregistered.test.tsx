import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AUTH_LOGIN_COPY } from '@/constants/auth-login-copy';

const fetchMock = vi.fn();

vi.setConfig({ testTimeout: 15_000 });

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('posthog-js', () => ({
  default: { get_distinct_id: () => null, get_session_id: () => null, identify: vi.fn(), capture: vi.fn() },
}));
vi.mock('@/lib/supabase-browser', () => ({
  supabaseBrowser: { auth: { setSession: vi.fn(), getSession: vi.fn(), signOut: vi.fn() } },
}));
vi.mock('@/hooks/useCatalogTenantContext', () => ({
  useCatalogTenantContext: () => ({ isCatalogHost: true, tenant: null, tenantLoading: false }),
}));

describe('LoginPage on the catalog host without return_to', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ref_id: null,
        registered: false,
        outcome: 'unregistered',
        message: "We couldn't find your number.",
        seller_name: null,
        seller_whatsapp_number: null,
        buyer_name: null,
      }),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('tells the user what to do next and shows support, instead of a dead end', async () => {
    const LoginPage = await import('../../../app/(auth)/login/page').then((mod) => mod.default);
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));

    expect(await screen.findByText(AUTH_LOGIN_COPY.resolution.unregisteredCatalog.title)).toBeInTheDocument();
    expect(screen.getByText(/open the catalog link they shared/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: AUTH_LOGIN_COPY.login.supportWhatsAppDisplay }))
      .toHaveAttribute('href', AUTH_LOGIN_COPY.login.supportWhatsAppHref);
    expect(screen.getByRole('link', { name: AUTH_LOGIN_COPY.resolution.unregisteredCatalog.sellerLogin })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try a different number' }));
    await waitFor(() => expect(screen.getByLabelText('Mobile number')).toBeInTheDocument());
  });
});
