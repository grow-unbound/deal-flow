import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import React from 'react';

const mockPathname = vi.fn(() => '/dashboard');

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
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
import type { SellerShellFeatureAvailability } from '@/lib/server/seller-features';

function makeFeatures(overrides: Partial<SellerShellFeatureAvailability> = {}): SellerShellFeatureAvailability {
  return {
    brandProductMaster: true,
    customerMaster: true,
    cohorts: true,
    pricingEngine: true,
    catalogPublishing: true,
    estimates: true,
    salesOrders: true,
    invoices: true,
    tallyExport: true,
    integrations: true,
    ...overrides,
  };
}

describe('SellerSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue('/dashboard');
    mockUseAuth.mockReturnValue(makeAuth('seller_admin'));
    try {
      localStorage.removeItem('df_sidebar_settings_expanded');
    } catch {
      // non-browser test env
    }
  });

  it('renders four section headers in expanded mode', () => {
    render(<SellerSidebar isCollapsed={false} featureAvailability={makeFeatures()} />);
    expect(screen.getByText('OPERATIONS')).toBeInTheDocument();
    expect(screen.getByText('CUSTOMERS')).toBeInTheDocument();
    expect(screen.getByText('CATALOG')).toBeInTheDocument();
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
  });

  it('hides section headers when collapsed', () => {
    render(<SellerSidebar isCollapsed featureAvailability={makeFeatures()} />);
    expect(screen.queryByText('OPERATIONS')).not.toBeInTheDocument();
    expect(screen.queryByText('CUSTOMERS')).not.toBeInTheDocument();
    expect(screen.queryByText('CATALOG')).not.toBeInTheDocument();
    expect(screen.queryByText('ADMIN')).not.toBeInTheDocument();
  });

  it('hides Estimates when df_estimates flag is off', () => {
    render(<SellerSidebar featureAvailability={makeFeatures({ estimates: false })} />);
    expect(screen.queryByText('Estimates')).not.toBeInTheDocument();
    expect(screen.getByText('OPERATIONS')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('does not render notifications in the sidebar footer', () => {
    render(<SellerSidebar featureAvailability={makeFeatures()} />);
    expect(screen.queryByRole('link', { name: /notifications/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
  });

  it('has Log out as the last interactive control before the avatar block', () => {
    render(<SellerSidebar featureAvailability={makeFeatures()} />);
    const footer = screen.getByRole('button', { name: /log out/i }).closest('.mt-auto');
    expect(footer).toBeTruthy();
    const buttons = within(footer as HTMLElement).queryAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(/log out/i);
    expect(within(footer as HTMLElement).getByText('seller@example.com')).toBeInTheDocument();
  });

  it('derives idle prefetch hrefs from navGroups for admin with flags on', () => {
    render(<SellerSidebar featureAvailability={makeFeatures()} />);
    expect(prefetchSpy).toHaveBeenCalled();
    const paths = prefetchSpy.mock.calls[0][0] as string[];
    expect(paths).toContain('/dashboard');
    expect(paths).toContain('/estimates');
    expect(paths).toContain('/sales-orders');
    expect(paths).toContain('/settings');
    expect(paths).toContain('/settings/team');
    expect(paths).toContain('/settings/modules');
    expect(paths).toContain('/settings/locations');
    expect(paths).toContain('/settings/integrations');
    expect(paths).toContain('/settings/billing');
  });

  it('hides Integrations when df_integrations is off', () => {
    render(<SellerSidebar featureAvailability={makeFeatures({ integrations: false })} />);
    expect(screen.queryByRole('link', { name: 'Integrations' })).not.toBeInTheDocument();
  });

  it('shows settings children when pathname is under /settings', () => {
    mockPathname.mockReturnValue('/settings/team');
    render(<SellerSidebar featureAvailability={makeFeatures()} />);
    expect(screen.getByRole('link', { name: 'Team' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Billing & Plan' })).toBeInTheDocument();
  });

  it('toggles settings submenu via chevron on dashboard', () => {
    mockPathname.mockReturnValue('/dashboard');
    render(<SellerSidebar featureAvailability={makeFeatures()} />);
    expect(screen.getByRole('link', { name: 'Team' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Collapse settings sections/i }));
    expect(screen.queryByRole('link', { name: 'Team' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Expand settings sections/i }));
    expect(screen.getByRole('link', { name: 'Team' })).toBeInTheDocument();
  });

  it('excludes admin-only and flag-off routes from prefetch for assistant', () => {
    mockUseAuth.mockReturnValue(makeAuth('seller_assistant'));
    render(<SellerSidebar featureAvailability={makeFeatures({ estimates: false })} />);
    const paths = prefetchSpy.mock.calls[0][0] as string[];
    expect(paths).not.toContain('/cohorts');
    expect(paths).toContain('/price-lists');
    expect(paths).not.toContain('/exports');
    expect(paths).not.toContain('/settings');
    expect(paths).not.toContain('/settings/modules');
    expect(paths).not.toContain('/settings/integrations');
    expect(paths).not.toContain('/settings/billing');
    expect(paths).not.toContain('/estimates');
    expect(paths).toContain('/dashboard');
  });

  it('renders assistant nav as a flat ordered list with no section headings', () => {
    mockUseAuth.mockReturnValue(makeAuth('seller_assistant'));
    render(<SellerSidebar featureAvailability={makeFeatures()} />);

    expect(screen.queryByText('OPERATIONS')).not.toBeInTheDocument();
    expect(screen.queryByText('CUSTOMERS')).not.toBeInTheDocument();
    expect(screen.queryByText('CATALOG')).not.toBeInTheDocument();
    expect(screen.queryByText('ADMIN')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Invoices/i })).toBeInTheDocument();
    const orderedItems = ['Dashboard', 'Estimates', 'Sales Orders', 'Customers', 'Products', 'Price Lists'];
    orderedItems.forEach((label) => {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: 'Brands' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Catalogs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });
});

describe('collectPrefetchHrefs', () => {
  it('matches navGroups flattening with flag and admin gates', () => {
    const hrefs = collectPrefetchHrefs(navGroups, {
      role: 'seller_admin',
      getFlag: () => true,
    });
    expect(hrefs).toContain('/estimates');
    expect(hrefs).toContain('/settings');
    expect(hrefs).toContain('/settings/team');
    expect(hrefs).toContain('/settings/billing');
  });

  it('excludes paths when getFlag returns false', () => {
    const hrefs = collectPrefetchHrefs(navGroups, {
      role: 'seller_admin',
      getFlag: (k) => k !== 'df_estimates',
    });
    expect(hrefs).not.toContain('/estimates');
    expect(hrefs).toContain('/sales-orders');
  });

  it('excludes integrations path when integrations flag is off', () => {
    const hrefs = collectPrefetchHrefs(navGroups, {
      role: 'seller_admin',
      getFlag: (k) => k !== 'df_integrations',
    });
    expect(hrefs).not.toContain('/settings/integrations');
  });

  it('includes price lists but excludes admin-only routes for assistants', () => {
    const hrefs = collectPrefetchHrefs(navGroups, {
      role: 'seller_assistant',
      getFlag: () => true,
    });
    expect(hrefs).toContain('/price-lists');
    expect(hrefs).not.toContain('/brands');
    expect(hrefs).not.toContain('/catalogs');
    expect(hrefs).not.toContain('/settings');
  });
});
