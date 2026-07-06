import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

let queryParams = new URLSearchParams();
const fetchMock = vi.fn();
const identifyMock = vi.fn();
const setSessionMock = vi.fn();
const openMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => queryParams,
}));

vi.mock('posthog-js', () => ({
  default: {
    get_distinct_id: () => null,
    get_session_id: () => null,
    identify: identifyMock,
  },
}));

vi.mock('@/lib/supabase-browser', () => ({
  supabaseBrowser: {
    auth: {
      setSession: setSessionMock,
    },
  },
}));

describe('LoginPage', () => {
  beforeEach(() => {
    queryParams = new URLSearchParams();
    fetchMock.mockReset();
    identifyMock.mockReset();
    setSessionMock.mockReset();
    openMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'open', {
      configurable: true,
      value: openMock,
    });
  });

  it('defaults to the otp entry point and does not show the email fallback there', async () => {
    const LoginPage = await import('../../../app/(auth)/login/page').then((mod) => mod.default);

    render(<LoginPage />);

    expect(screen.getByText('Enter your mobile number to get a WhatsApp OTP.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Login with Email' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create seller account' })).toHaveAttribute('href', '/signup');
  });

  it('shows the unregistered resolution card and resets back to the number form', async () => {
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

    const LoginPage = await import('../../../app/(auth)/login/page').then((mod) => mod.default);
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));

    expect(await screen.findByText("We couldn't find your number.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inform your Seller' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try a different number' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try a different number' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Mobile number')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send OTP' })).toBeInTheDocument();
    });
  });

  it('includes the full seller-facing draft when informing the seller', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ref_id: null,
        registered: false,
        outcome: 'unregistered',
        message: "We couldn't find your number.",
        seller_name: null,
        seller_whatsapp_number: null,
        buyer_name: 'Rajan',
      }),
    });

    const LoginPage = await import('../../../app/(auth)/login/page').then((mod) => mod.default);
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));

    expect(await screen.findByRole('button', { name: 'Inform your Seller' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Inform your Seller' }));

    const openedUrl = openMock.mock.calls[0]?.[0] as string;
    const decoded = decodeURIComponent(openedUrl);
    expect(decoded).toContain('Hi your seller,');
    expect(decoded).toContain('Please create your seller account and add me as a buyer so I can order from your catalog.');
    expect(decoded).toContain('Seller signup:');
    expect(decoded).toContain('https://');
    expect(decoded).toContain('- your buyer.');
  });

  it('shows the seller-disabled resolution card and opens WhatsApp for request access', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ref_id: null,
        registered: false,
        outcome: 'seller_disabled',
        message: 'Your account is not enabled by Acme Corp for catalog access and ordering.',
        seller_name: 'Acme Corp',
        seller_whatsapp_number: '9876500000',
        buyer_name: 'Rajan',
      }),
    });

    const LoginPage = await import('../../../app/(auth)/login/page').then((mod) => mod.default);
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));

    expect(await screen.findByText('Your account is not enabled by Acme Corp for catalog access and ordering.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Request Access' }));

    expect(openMock).toHaveBeenCalledWith(
      expect.stringContaining('https://wa.me/9876500000?text='),
      '_blank',
      'noopener,noreferrer',
    );
    expect(openMock.mock.calls[0][0]).toContain('Acme%20Corp');
  });
});
