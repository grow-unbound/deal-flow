import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    buyerApp: true,
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

  it('renders three section headers in expanded mode', () => {
    render(<SellerSidebar isCollapsed={false} featureAvailability={makeFeatures()} />);
    expect(screen.getByText('OPERATIONS')).toBeInTheDocument();
    expect(screen.getByText('GROWTH')).toBeInTheDocument();
    expect(screen.getByText('SETUP')).toBeInTheDocument();
  });

  it('hides section headers when collapsed', () => {
    render(<SellerSidebar isCollapsed featureAvailability={makeFeatures()} />);
    expect(screen.queryByText('OPERATIONS')).not.toBeInTheDocument();
    expect(screen.queryByText('GROWTH')).not.toBeInTheDocument();
    expect(screen.queryByText('SETUP')).not.toBeInTheDocument();
  });

  it('hides Estimates when df_estimates flag is off', () => {
    render(<SellerSidebar featureAvailability={makeFeatures({ estimates: false })} />);
    expect(screen.queryByText('Estimates')).not.toBeInTheDocument();
    expect(screen.getByText('OPERATIONS')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('does not render the account footer in the sidebar', () => {
    render(<SellerSidebar featureAvailability={makeFeatures()} />);
    expect(screen.queryByRole('button', { name: /log out/i })).not.toBeInTheDocument();
    expect(screen.queryByText('seller@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('Acme Dist')).not.toBeInTheDocument();
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
    expect(paths).not.toContain('/settings/modules');
    expect(paths).toContain('/locations');
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

  it('excludes admin-only and flag-off routes from prefetch for assistant', () => {
    mockUseAuth.mockReturnValue(makeAuth('seller_assistant'));
    render(<SellerSidebar featureAvailability={makeFeatures({ estimates: false })} />);
    const paths = prefetchSpy.mock.calls[0][0] as string[];
    expect(paths).not.toContain('/cohorts');
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
    expect(screen.queryByText('GROWTH')).not.toBeInTheDocument();
    expect(screen.queryByText('SETUP')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Invoices/i })).toBeInTheDocument();
    const orderedItems = ['Dashboard', 'Estimates', 'Sales Orders', 'Customers', 'Products'];
    orderedItems.forEach((label) => {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: 'Brands' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Catalogs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('renders collapse toggle in footer when canCollapse is true', () => {
    render(<SellerSidebar isCollapsed={false} canCollapse featureAvailability={makeFeatures()} />);
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(toggle).toBeInTheDocument();
    expect(toggle.closest('footer')).not.toBeNull();
  });

  it('hides collapse toggle when canCollapse is false', () => {
    render(<SellerSidebar isCollapsed={false} canCollapse={false} featureAvailability={makeFeatures()} />);
    expect(screen.queryByRole('button', { name: /sidebar/i })).not.toBeInTheDocument();
  });

  it('renders copper mark logo in collapsed mode (not charcoal app-icon)', () => {
    render(<SellerSidebar isCollapsed featureAvailability={makeFeatures()} />);
    const logo = screen.getByRole('img', { name: 'Yukti' });
    expect(logo).toHaveAttribute('src', expect.stringContaining('mark-copper.svg'));
  });

  it('keeps collapsed nav links left-aligned without justify-center', () => {
    render(<SellerSidebar isCollapsed featureAvailability={makeFeatures()} />);
    const dashboardLink = screen.getByRole('link', { name: 'Dashboard' });
    expect(dashboardLink.className).not.toContain('justify-center');
    expect(dashboardLink.className).toContain('gap-3');
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
    expect(hrefs).not.toContain('/brands');
    expect(hrefs).not.toContain('/catalogs');
    expect(hrefs).not.toContain('/settings');
    expect(hrefs).not.toContain('/price-lists');
  });
});
