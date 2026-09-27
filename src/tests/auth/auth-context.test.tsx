import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AUTH_CONTEXTS_STORAGE_KEY } from '@/lib/auth-session';

const {
  assignMock,
  fetchMock,
  groupMock,
  getSessionMock,
  identifyMock,
  onAuthStateChangeMock,
  registerMock,
  replaceMock,
  signOutMock,
} = vi.hoisted(() => ({
  assignMock: vi.fn(),
  fetchMock: vi.fn(),
  groupMock: vi.fn(),
  getSessionMock: vi.fn(),
  identifyMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  registerMock: vi.fn(),
  replaceMock: vi.fn(),
  signOutMock: vi.fn(),
}));

let authStateChangeHandler:
  | ((event: string, session: unknown) => void | Promise<void>)
  | null = null;

function createStorageMock(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

vi.mock('@/lib/supabase-browser', () => ({
  supabaseBrowser: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
      signOut: signOutMock,
    },
  },
}));

vi.mock('posthog-js', () => ({
  default: {
    group: groupMock,
    identify: identifyMock,
    register: registerMock,
  },
}));

function AuthProbe() {
  const { signOut, user } = useAuth();
  return (
    <div>
      <span>{user?.email ?? 'signed-out'}</span>
      <span>{user?.phone ?? 'no-phone'}</span>
      <button type="button" onClick={() => void signOut()}>logout</button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    authStateChangeHandler = null;
    fetchMock.mockReset();
    getSessionMock.mockReset();
    onAuthStateChangeMock.mockReset();
    signOutMock.mockReset();
    identifyMock.mockReset();
    groupMock.mockReset();
    registerMock.mockReset();
    assignMock.mockReset();
    replaceMock.mockReset();

    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: createStorageMock(),
    });
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createStorageMock(),
    });

    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: `header.${btoa(JSON.stringify({ tenant_id: 'tenant-1', user_role: 'seller_admin' }))}.sig`,
          user: {
            id: 'user-1',
            email: 'owner@yukti.so',
            phone: null,
            user_metadata: {
              phone: '+919999999999',
            },
          },
        },
      },
      error: null,
    });

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        tenant: {
          id: 'tenant-1',
          slug: 'yukti-demo',
          business_name: 'yukti demo',
        },
        role: 'seller_admin',
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    onAuthStateChangeMock.mockImplementation((callback: typeof authStateChangeHandler) => {
      authStateChangeHandler = callback;
      return {
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      };
    });

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        pathname: '/dashboard',
        hostname: 'localhost',
        host: 'localhost',
        assign: assignMock,
        replace: replaceMock,
      },
    });
  });

  it('clears client auth storage and auth state when Supabase emits SIGNED_OUT', async () => {
    window.sessionStorage.setItem(AUTH_CONTEXTS_STORAGE_KEY, JSON.stringify([{ tenant_id: 'tenant-1' }]));
    window.sessionStorage.setItem('yukti_draft_customers', '{"field":"value"}');
    window.localStorage.setItem('yukti_draft_products', '{"field":"value"}');

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('owner@yukti.so')).toBeInTheDocument();
      expect(screen.getByText('+919999999999')).toBeInTheDocument();
    });

    await act(async () => {
      await authStateChangeHandler?.('SIGNED_OUT', null);
    });

    await waitFor(() => {
      expect(screen.getByText('signed-out')).toBeInTheDocument();
    });

    expect(window.sessionStorage.getItem(AUTH_CONTEXTS_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem('yukti_draft_customers')).toBeNull();
    expect(window.localStorage.getItem('yukti_draft_products')).toBeNull();
    expect(assignMock).toHaveBeenCalledWith('/login');
  });

  it('does NOT redirect to /login on a tenant storefront host — guest browsing has no session by design', async () => {
    // A fresh guest visiting a published public catalog never had a session at
    // all — Supabase still emits a SIGNED_OUT-shaped event for that client on
    // first subscribe, and this must not be treated as an expired session.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        pathname: '/',
        hostname: 'wineyard.useyukti.in',
        host: 'wineyard.useyukti.in',
        assign: assignMock,
        replace: replaceMock,
      },
    });
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('signed-out')).toBeInTheDocument();
    });

    await act(async () => {
      await authStateChangeHandler?.('SIGNED_OUT', null);
    });

    expect(assignMock).not.toHaveBeenCalled();
  });

  it('manual logout on a tenant host lands on that tenant public catalog when it is live', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        pathname: '/profile',
        hostname: 'mobilehub.localhost',
        host: 'mobilehub.localhost:3000',
        assign: assignMock,
        replace: replaceMock,
      },
    });
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: `header.${btoa(JSON.stringify({ tenant_id: 'tenant-1', user_role: 'buyer_admin', buyer_id: 'buyer-1' }))}.sig`,
          user: {
            id: 'buyer-user-1',
            email: 'buyer@yukti.so',
            phone: null,
            user_metadata: { phone: '+919999999999' },
          },
        },
      },
      error: null,
    });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        tenant: {
          id: 'tenant-1',
          slug: 'mobilehub',
          business_name: 'MobileHub',
        },
        role: 'buyer_admin',
        public_catalog_live: true,
        storefront_url: 'http://mobilehub.localhost:3000',
      }),
    });
    signOutMock.mockResolvedValue({ error: null });

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/tenant/current', expect.anything());
    });

    fireEvent.click(screen.getByRole('button', { name: 'logout' }));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalled();
      expect(replaceMock).toHaveBeenCalledWith('/');
    });
  });

  it('manual logout on a tenant host lands on catalog login when no public catalog is live', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        pathname: '/profile',
        hostname: 'mobilehub.localhost',
        host: 'mobilehub.localhost:3000',
        assign: assignMock,
        replace: replaceMock,
      },
    });
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: `header.${btoa(JSON.stringify({ tenant_id: 'tenant-1', user_role: 'buyer_admin', buyer_id: 'buyer-1' }))}.sig`,
          user: {
            id: 'buyer-user-1',
            email: 'buyer@yukti.so',
            phone: null,
            user_metadata: { phone: '+919999999999' },
          },
        },
      },
      error: null,
    });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        tenant: {
          id: 'tenant-1',
          slug: 'mobilehub',
          business_name: 'MobileHub',
        },
        role: 'buyer_admin',
        public_catalog_live: false,
        storefront_url: 'http://mobilehub.localhost:3000',
      }),
    });
    signOutMock.mockResolvedValue({ error: null });

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/tenant/current', expect.anything());
    });

    fireEvent.click(screen.getByRole('button', { name: 'logout' }));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalled();
      expect(replaceMock).toHaveBeenCalledWith('http://catalog.localhost:3000/login');
    });
  });
});
