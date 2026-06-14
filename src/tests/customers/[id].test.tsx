import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: <T,>(value: T) => value,
  };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/customers/buyer-1',
}));

vi.mock('@/components/FeatureGate', () => ({
  FeatureGate: ({ children }: { children: import('react').ReactNode }) => <>{children}</>,
}));

const useRoleMock = vi.fn(() => ({ isSellerAdmin: true, isSellerAssistant: false }));

vi.mock('@/hooks/useRole', () => ({
  useRole: () => useRoleMock(),
}));

vi.mock('@/hooks/useCustomersLanding', () => ({
  useTenantCustomerDetail: () => ({
    isLoading: false,
    isError: false,
    data: {
      header: {
        id: 'buyer-1',
        buyer_name: 'Singh Hospitality',
        initials: 'SH',
        hue: 'teal',
        status_label: 'Active',
        status_tone: 'success',
        tier: 'A',
        city: 'Bengaluru',
        buyer_since: '2021-05-10T00:00:00Z',
        years_label: '5 yrs loyal',
        net_terms_days: 21,
      },
      meta_strip_4: {
        spend_mtd: 250000,
        growth_pct: 12,
        orders_mtd: 4,
        aov_mtd: 62500,
        last_order_label: 'Jun 24',
        last_order_primary_product_qty: 'Cabernet Sauvignon ×24',
        credit_used: 64000,
        credit_limit: 100000,
        credit_used_pct: 64,
      },
      details: {
        business_name: 'Singh Hospitality',
        contact_name: 'R Singh',
        phone: '9876543210',
        email: 'ops@singh.co',
        gstin: '29ABCDE1234F1Z5',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        zone: 'South',
        payment_terms_days: 21,
        credit_limit: 100000,
        external_ref: 'ER-1',
        cohorts: ['Premium'],
        is_active: true,
      },
      performance: {
        monthly_spend_trend: [],
        brand_affinity: [],
        order_frequency: [],
      },
      performance_v2: {
        headline: {
          spend_mtd: 250000,
          growth_pct: 12,
          orders_mtd: 4,
          aov_mtd: 62500,
        },
        brand_mix: {
          total_spend: 250000,
          rows: [
            { brand: 'WineYard', spend: 120000, pct: 48 },
            { brand: 'Khanna Brewing', spend: 55000, pct: 22 },
          ],
        },
        top_skus: [
          { name: 'Cabernet Sauvignon 2021', sku: 'VINO-CAB-750-2021', revenue: 240000, units: 96 },
        ],
        credit_ops: {
          last_order_days_ago: '3d ago',
          last_order_value: 84200,
          catalog_opens_mtd: 14,
          credit_used: 64000,
          credit_limit: 100000,
          credit_util_pct: 64,
          payment_behavior_summary: 'Payment behavior — On time · 2 of 4 invoices',
        },
      },
      orders: {
        badge_count_mtd: 4,
        rows: [],
      },
      estimates: {
        rows: [],
      },
      invoices: {
        rows: [],
      },
      cohorts_summary: {
        rows: [{ id: 'cohort-1', name: 'Premium', member_count: 1 }],
      },
      price_lists: {
        assigned: [
          {
            id: 'pl-1',
            name: 'North Premium Pricing',
            target_type: 'cohort' as const,
            target_label: 'Cohort · Premium',
            valid_from: '2026-06-01T00:00:00Z',
            valid_to: '2026-06-30T00:00:00Z',
            status: 'active' as const,
          },
        ],
        lookup_products: [
          {
            tenant_product_id: 'tp-1',
            name: 'Cabernet Sauvignon 2021',
            sku: 'VINO-CAB-750-2021',
          },
        ],
      },
      activity: [],
      computed: {
        last_order_date_human: '24 Jun',
      },
    },
  }),
  useToggleCustomerStatusOptimistic: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useCreateCustomerOptimistic: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

import CustomerDetailPage from '../../../app/(seller)/customers/[id]/page';

const params = { id: 'buyer-1' } as unknown as Promise<{ id: string }>;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CustomerDetailPage params={params} />
    </QueryClientProvider>,
  );
}

describe('customers/[id] detail shell', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('renders the expanded admin tab set including estimates, invoices, cohorts, and price lists', () => {
    useRoleMock.mockReturnValue({ isSellerAdmin: true, isSellerAssistant: false });
    renderPage();

    expect(screen.getByRole('button', { name: /Details/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Performance/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Orders/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Estimates/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Invoices/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cohorts/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Price Lists/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Activity/i })).toBeInTheDocument();
  });

  it('keeps buyer since in subtitle and not as a meta tile', () => {
    renderPage();

    expect(screen.getByText(/Buyer since May 2021 · 5 yrs loyal/i)).toBeInTheDocument();
    expect(screen.queryByText(/Buyer since/i, { selector: 'p' })).not.toBeInTheDocument();
  });

  it('shows credit used tile with backend percentage and orders badge', () => {
    renderPage();

    expect(screen.getByText('Credit used')).toBeInTheDocument();
    expect(screen.getByText(/of ₹1.00L · 64%/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Orders/i })).toBeInTheDocument();
    const ordersTile = screen.getByText('Orders · MTD').closest('article');
    expect(ordersTile).not.toBeNull();
    expect(within(ordersTile as HTMLElement).getByText('4')).toBeInTheDocument();
  });

  it('defaults to performance tab active', () => {
    useRoleMock.mockReturnValue({ isSellerAdmin: true, isSellerAssistant: false });
    renderPage();

    expect(screen.getByRole('button', { name: /Performance/i })).toHaveClass('border-teal-500');
    expect(screen.getByText('Spend trend')).toBeInTheDocument();
    expect(screen.getByText('Brand mix')).toBeInTheDocument();
    expect(screen.getByText('Top SKUs')).toBeInTheDocument();
    expect(screen.getByText('Credit & ops')).toBeInTheDocument();
  });

  it('hides Performance tab for seller assistants', () => {
    useRoleMock.mockReturnValue({ isSellerAdmin: false, isSellerAssistant: true });
    renderPage();

    expect(screen.queryByRole('button', { name: /Performance/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Details/i })).toHaveClass('border-teal-500');
  });

  it('renders assigned price list cards with source label and validity copy', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Price Lists/i }));

    expect(screen.getByText('Assigned price lists')).toBeInTheDocument();
    expect(screen.getByText('North Premium Pricing')).toBeInTheDocument();
    expect(screen.getByText(/Cohort · Premium/i)).toBeInTheDocument();
    expect(screen.getByText(/Validity/i)).toBeInTheDocument();
    expect(screen.getByText(/Resolved price lookup/i)).toBeInTheDocument();
  });
});
