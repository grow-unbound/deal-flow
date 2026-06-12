import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AUTH_CONTEXTS_STORAGE_KEY } from '@/lib/auth-session';

const {
  assignMock,
  getSessionMock,
  identifyMock,
  onAuthStateChangeMock,
  reloadFeatureFlagsMock,
  rpcMock,
  signOutMock,
} = vi.hoisted(() => ({
  assignMock: vi.fn(),
  getSessionMock: vi.fn(),
  identifyMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  reloadFeatureFlagsMock: vi.fn(),
  rpcMock: vi.fn(),
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
    rpc: rpcMock,
  },
}));

vi.mock('posthog-js', () => ({
  default: {
    identify: identifyMock,
    reloadFeatureFlags: reloadFeatureFlagsMock,
  },
}));

function AuthProbe() {
  const { user } = useAuth();
  return <div>{user?.email ?? 'signed-out'}</div>;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    authStateChangeHandler = null;
    getSessionMock.mockReset();
    onAuthStateChangeMock.mockReset();
    signOutMock.mockReset();
    rpcMock.mockReset();
    identifyMock.mockReset();
    reloadFeatureFlagsMock.mockReset();
    assignMock.mockReset();

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
          access_token: 'token',
          user: {
            id: 'user-1',
            email: 'owner@yukti.so',
            phone: '+919999999999',
          },
        },
      },
      error: null,
    });

    rpcMock.mockResolvedValue({
      data: [
        {
          tenant_id: 'tenant-1',
          tenant_name: 'yukti demo',
          tenant_slug: 'yukti-demo',
          role: 'seller_admin',
        },
      ],
      error: null,
    });

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
        assign: assignMock,
      },
    });
  });

  it('clears client auth storage and auth state when Supabase emits SIGNED_OUT', async () => {
    window.sessionStorage.setItem(AUTH_CONTEXTS_STORAGE_KEY, JSON.stringify([{ tenant_id: 'tenant-1' }]));
    window.sessionStorage.setItem('yukti_draft_customers', '{"field":"value"}');
    window.localStorage.setItem('yukti_draft_products', '{"field":"value"}');

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('owner@yukti.so')).toBeInTheDocument();
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
    expect(assignMock).toHaveBeenCalledWith('/login?reason=session_expired');
  });
});
