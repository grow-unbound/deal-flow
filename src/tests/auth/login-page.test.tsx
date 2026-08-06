import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AUTH_LOGIN_COPY } from '@/constants/auth-login-copy';
import { DEVICE_HAS_LOGGED_IN_KEY } from '@/lib/auth-device-login';

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
    const store = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => {
          store.clear();
        },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() {
          return store.size;
        },
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'open', {
      configurable: true,
      value: openMock,
    });
  });

  it('defaults to the otp entry point and does not show the email fallback there', async () => {
    const LoginPage = await import('../../../app/(auth)/login/page').then((mod) => mod.default);

    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: AUTH_LOGIN_COPY.login.welcomeTitle })).toBeInTheDocument();
    expect(await screen.findByText(AUTH_LOGIN_COPY.login.welcomeSubtitle)).toBeInTheDocument();
    expect(screen.getByText(AUTH_LOGIN_COPY.login.landingBody)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Login with Email' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: AUTH_LOGIN_COPY.login.createSellerAccount }),
    ).toHaveAttribute('href', '/signup');
  });

  it('hides the welcome subtitle after this device has logged in once', async () => {
    window.localStorage.setItem(DEVICE_HAS_LOGGED_IN_KEY, '1');
    const LoginPage = await import('../../../app/(auth)/login/page').then((mod) => mod.default);

    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: AUTH_LOGIN_COPY.login.welcomeTitle })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(AUTH_LOGIN_COPY.login.welcomeSubtitle)).not.toBeInTheDocument();
    });
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

    expect(await screen.findByText("We couldn't find your number")).toBeInTheDocument();
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

    const openedHrefs: string[] = [];
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const el = originalCreateElement(tagName, options);
      if (String(tagName).toLowerCase() === 'a') {
        const anchor = el as HTMLAnchorElement;
        anchor.click = () => {
          openedHrefs.push(anchor.href);
        };
      }
      return el;
    }) as typeof document.createElement);

    const LoginPage = await import('../../../app/(auth)/login/page').then((mod) => mod.default);
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));

    expect(await screen.findByRole('button', { name: 'Inform your Seller' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Inform your Seller' }));

    expect(openedHrefs[0]).toBeTruthy();
    const openedUrl = openedHrefs[0]!;
    const textParam = new URL(openedUrl).searchParams.get('text') ?? '';
    expect(openedUrl).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(openedUrl).toContain('%27');
    // Prefill strips https:// so WhatsApp does not collapse the draft to the URL alone
    expect(textParam).not.toContain('https://');
    expect(textParam).toContain('Hi,');
    expect(textParam).toContain("I'd like to order from you through Yukti, but I don't have access yet.");
    expect(textParam).toContain(
      'Yukti is a simple app for managing your catalog, pricing, and orders with buyers like me.',
    );
    expect(textParam).toContain(
      'Could you create your seller account and add me as a buyer, so I can browse your catalog and order?',
    );
    expect(textParam).toContain('Seller signup:');
    expect(textParam).toMatch(/\/signup/);
    expect(textParam).toContain("Let me know once it's ready!");
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

    expect(await screen.findByText('Your account is not enabled by Acme Corp for catalog access and ordering')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Request Access' }));

    expect(openMock).toHaveBeenCalledWith(
      expect.stringContaining('https://api.whatsapp.com/send?phone=919876500000&text='),
      '_blank',
      'noopener,noreferrer',
    );
    const openedUrl = openMock.mock.calls[0][0] as string;
    expect(new URL(openedUrl).searchParams.get('text')).toContain('Acme Corp');
  });
});
