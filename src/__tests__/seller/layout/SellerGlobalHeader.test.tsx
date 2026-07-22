import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SellerGlobalHeader } from '@/components/layout/SellerGlobalHeader';

vi.setConfig({ testTimeout: 15_000 });

const mockSignOut = vi.fn().mockResolvedValue(undefined);
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      displayName: 'Priya Shah',
      email: 'priya@example.com',
      phone: '+91 98765 43210',
    },
    signOut: mockSignOut,
  }),
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ currentTenant: { business_name: 'Acme Dist' } }),
}));

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({
    isSellerAdmin: true,
    isSellerAssistant: false,
    isBuyerAdmin: false,
    isBuyerAssistant: false,
    isSeller: true,
    isBuyer: false,
    can: () => true,
  }),
}));

vi.mock('@/contexts/SellerRealtimeContext', () => ({
  useSellerRealtimeContext: () => ({
    unreadCount: 3,
    notifications: [],
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    newEntityIds: new Map(),
    markSeen: vi.fn(),
  }),
}));

describe('SellerGlobalHeader', () => {
  beforeEach(() => {
    mockSignOut.mockClear();
    mockPush.mockClear();
  });

  it('renders the inline search field and right-side actions', async () => {
    await act(async () => {
      render(<SellerGlobalHeader tenantBrandingPromise={Promise.resolve({ tenantName: 'Acme Dist', tenantLogoUrl: null })} />);
    });

    expect(screen.getByRole('searchbox', { name: /Search seller entities/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Buyer App/i })).toHaveAttribute('href', '/api/buyer/preview/launch');
    expect(screen.getByRole('button', { name: /Notifications/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open account menu for Priya Shah/i })).toBeInTheDocument();
  });

  it('opens the inline search dropdown from the search field', async () => {
    await act(async () => {
      render(<SellerGlobalHeader tenantBrandingPromise={Promise.resolve({ tenantName: 'Acme Dist', tenantLogoUrl: null })} />);
    });

    fireEvent.focus(screen.getByRole('searchbox', { name: /Search seller entities/i }));

    expect(
      screen.getByText(/Start typing to search products/i),
    ).toBeInTheDocument();
  });

  it('shows account details and logout actions in the avatar popover', async () => {
    await act(async () => {
      render(<SellerGlobalHeader tenantBrandingPromise={Promise.resolve({ tenantName: 'Acme Dist', tenantLogoUrl: null })} />);
    });

    fireEvent.click(screen.getByRole('button', { name: /Open account menu for Priya Shah/i }));

    expect(await screen.findByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('Admin · Acme Dist')).toBeInTheDocument();
    expect(screen.getByText('+91 98765 43210')).toBeInTheDocument();
    expect(screen.getByText('priya@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Logout/i }));
    expect(mockSignOut).toHaveBeenCalledOnce();
  });
});
