import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn().mockResolvedValue({}),
    },
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ currentTenant: { business_name: 'Acme Dist' } }),
}));

const useFlagStateMock = vi.fn();
vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlagState: (flag: string) => useFlagStateMock(flag),
}));

const prefetchSpy = vi.fn();
vi.mock('@/hooks/useIdleRoutePrefetch', () => ({
  useIdleRoutePrefetch: (paths: string[]) => prefetchSpy(paths),
}));

function makeAuth(role: string) {
  return {
    session: null,
    user: { id: 'u1', email: 'seller@example.com' },
    tenantProfile: { id: 'tp-1', tenant_id: 't1', user_id: 'u1', role, is_active: true },
    buyerProfiles: [],
    currentTenantId: 't1',
    currentBuyerId: null,
    isLoading: false,
    isError: false,
    error: null,
    signOut: vi.fn(),
    switchTenant: vi.fn(),
    switchBuyer: vi.fn(),
  };
}

import { SellerSidebar, collectPrefetchHrefs, navGroups } from '@/components/layout/SellerSidebar';

describe('SellerSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(makeAuth('seller_admin'));
    useFlagStateMock.mockReturnValue(true);
  });

  it('renders four section headers in expanded mode', () => {
    render(<SellerSidebar isCollapsed={false} />);
    expect(screen.getByText('OPERATIONS')).toBeInTheDocument();
    expect(screen.getByText('CUSTOMERS')).toBeInTheDocument();
    expect(screen.getByText('CATALOG')).toBeInTheDocument();
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
  });

  it('hides section headers when collapsed', () => {
    render(<SellerSidebar isCollapsed />);
    expect(screen.queryByText('OPERATIONS')).not.toBeInTheDocument();
    expect(screen.queryByText('CUSTOMERS')).not.toBeInTheDocument();
    expect(screen.queryByText('CATALOG')).not.toBeInTheDocument();
    expect(screen.queryByText('ADMIN')).not.toBeInTheDocument();
  });

  it('hides Estimates when df_estimates flag is off', () => {
    useFlagStateMock.mockImplementation((key: string) => (key === 'ESTIMATES' ? false : true));
    render(<SellerSidebar />);
    expect(screen.queryByText('Estimates')).not.toBeInTheDocument();
    expect(screen.getByText('OPERATIONS')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('does not render notifications in the sidebar footer', () => {
    render(<SellerSidebar />);
    expect(screen.queryByRole('link', { name: /notifications/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
  });

  it('has Log out as the last interactive control before the avatar block', () => {
    render(<SellerSidebar />);
    const footer = screen.getByRole('button', { name: /log out/i }).closest('.mt-auto');
    expect(footer).toBeTruthy();
    const buttons = within(footer as HTMLElement).queryAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(/log out/i);
    expect(within(footer as HTMLElement).getByText('seller@example.com')).toBeInTheDocument();
  });

  it('derives idle prefetch hrefs from navGroups for admin with flags on', () => {
    render(<SellerSidebar />);
    expect(prefetchSpy).toHaveBeenCalled();
    const paths = prefetchSpy.mock.calls[0][0] as string[];
    expect(paths).toContain('/dashboard');
    expect(paths).toContain('/estimates');
    expect(paths).toContain('/sales-orders');
    expect(paths).toContain('/settings/team');
  });

  it('excludes admin-only and flag-off routes from prefetch for assistant', () => {
    mockUseAuth.mockReturnValue(makeAuth('seller_assistant'));
    useFlagStateMock.mockImplementation((key: string) => (key === 'ESTIMATES' ? false : true));
    render(<SellerSidebar />);
    const paths = prefetchSpy.mock.calls[0][0] as string[];
    expect(paths).not.toContain('/cohorts');
    expect(paths).not.toContain('/price-lists');
    expect(paths).not.toContain('/settings');
    expect(paths).not.toContain('/settings/team');
    expect(paths).not.toContain('/estimates');
    expect(paths).toContain('/dashboard');
  });
});

describe('collectPrefetchHrefs', () => {
  it('matches navGroups flattening with flag and admin gates', () => {
    const hrefs = collectPrefetchHrefs(navGroups, {
      isSellerAdmin: true,
      getFlag: () => true,
    });
    expect(hrefs).toContain('/estimates');
    expect(hrefs).toContain('/settings/team');
  });

  it('excludes paths when getFlag returns false', () => {
    const hrefs = collectPrefetchHrefs(navGroups, {
      isSellerAdmin: true,
      getFlag: (k) => k !== 'df_estimates',
    });
    expect(hrefs).not.toContain('/estimates');
    expect(hrefs).toContain('/sales-orders');
  });
});
