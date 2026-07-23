import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

vi.mock('@/components/seller/customers/AddCustomerDialog', () => ({
  AddCustomerDialog: () => null,
}));

const useRoleMock = vi.fn(() => ({ isSellerAdmin: true, isSellerAssistant: false }));
const useTenantSettingsMock = vi.fn(() => ({
  data: {
    modules: {
      orders: {
        features: {
          enquiries: true,
          sales_orders: true,
          invoices: true,
        },
      },
      catalog: {
        price_lists_enabled: true,
      },
    },
  },
}));
const useCustomerPriceListsMock = vi.fn(() => ({
  isLoading: false,
  isFetching: false,
  data: {
    total: 1,
    assigned: [
      {
        id: 'pl-1',
        name: 'North Premium Pricing',
        priority: 20,
        target_type: 'cohort' as const,
        target_label: 'Cohort · Premium',
        valid_from: '2026-06-01T00:00:00Z',
        valid_to: '2026-06-30T00:00:00Z',
        status: 'active' as const,
      },
    ],
  },
}));
const useCustomerOutstandingInvoicesMock = vi.fn(() => ({
  isLoading: false,
  isFetching: false,
  data: {
    invoices: [
      {
        id: 'inv-1',
        invoice_number: 'INV-001',
        invoice_date: '2026-07-10T00:00:00Z',
        due_date: '2026-07-18T00:00:00Z',
        total_amount: 1000,
        outstanding_amount: 400,
        location_id: 'loc-2',
        location_name: 'Warehouse South',
        place_of_supply: 'Karnataka',
        status: 'overdue' as const,
      },
    ],
  },
}));
const useCollectCustomerInvoicePaymentMock = vi.fn(() => ({
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
}));

function createCustomerDetail() {
  return {
  header: {
    id: 'buyer-1',
    buyer_name: 'Singh Hospitality',
    initials: 'SH',
    hue: 'teal',
    status_label: 'Active',
    status_tone: 'success',
    buyer_app_enabled: true,
    whatsapp_opted_out: false,
    city: 'Bengaluru',
    buyer_since: '2021-05-10T00:00:00Z',
    years_label: '5 yrs loyal',
    net_terms_days: 21,
    subtitle_meta: {
      buyer_app_status_label: 'Buyer App enabled',
      city: 'Bengaluru',
      phone: '9876543210',
      last_activity_at: '2026-07-16T00:00:00Z',
      last_activity_kind: 'sale',
      last_activity_days_ago: 3,
      last_activity_date_label: '16 Jul 2026',
    },
  },
  meta_strip_4: {
    invoiced_sales_90d: 250000,
    invoice_count_90d: 4,
    primary_demand_kind: 'orders' as const,
    demand_90d: 188000,
    demand_order_count_90d: 3,
    demand_estimate_count_90d: 1,
    credit_used: 64000,
    credit_available: 36000,
    credit_limit: 100000,
    credit_used_pct: 64,
    last_invoice_value: 84200,
    last_invoice_date: '2026-07-16T00:00:00Z',
  },
  details: {
    business_name: 'Singh Hospitality',
    contact_name: 'R Singh',
    phone: '9876543210',
    email: 'ops@singh.co',
    gstin: '29ABCDE1234F1Z5',
    gst_treatment: 'regular',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    zone: 'South',
    billing_address: null,
    shipping_address: null,
    payment_terms_days: 21,
    credit_limit: 100000,
    default_price_list_id: 'pl-1',
    assigned_price_list: 'North Premium Pricing',
    buyer_app_enabled: true,
    cohorts: ['Premium'],
    is_active: true,
    buyer_users: [
      {
        id: 'user-1',
        user_id: 'auth-1',
        first_name: 'Amit',
        last_name: 'Sharma',
        full_name: 'Amit Sharma',
        phone: '9876543210',
        email: 'amit@example.com',
        designation: 'Owner',
        department: null,
        is_active: true,
        status: 'Active',
      },
    ],
    contacts: [],
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
    brand_mix: { total_spend: 0, rows: [] },
    top_skus: [],
    credit_ops: {
      last_order_days_ago: '3d ago',
      last_order_value: 84200,
      catalog_opens_mtd: 0,
      credit_used: 64000,
      credit_limit: 100000,
      credit_util_pct: 64,
      payment_behavior_summary: 'Payment behavior - current',
    },
  },
  performance_cards: [],
  detail_v2: {},
  tab_badges: {
    orders_90d: 3,
    estimates_90d: 1,
    invoices_90d: 4,
    price_lists_assigned: 1,
  },
  cohorts_summary: {
    rows: [{ id: 'cohort-1', name: 'Premium', member_count: 1 }],
  },
  price_lists: {
    assigned_count: 1,
  },
  role: 'seller_admin',
  };
}

let currentCustomerDetail = createCustomerDetail();

vi.mock('@/hooks/useRole', () => ({
  useRole: () => useRoleMock(),
}));

vi.mock('@/hooks/useTenantSettings', () => ({
  useTenantSettings: () => useTenantSettingsMock(),
}));

vi.mock('@/hooks/useBusinessPolicy', () => ({
  useBusinessPolicy: () => ({ creditEnabled: true }),
}));

vi.mock('@/hooks/useCustomersLanding', () => ({
  useTenantCustomerDetail: () => ({
    isLoading: false,
    isError: false,
    data: currentCustomerDetail,
  }),
  useToggleCustomerStatusOptimistic: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useCreateCustomerOptimistic: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useCustomerPriceLists: () => useCustomerPriceListsMock(),
  useCustomerOutstandingInvoices: () => useCustomerOutstandingInvoicesMock(),
  useCollectCustomerInvoicePayment: () => useCollectCustomerInvoicePaymentMock(),
  useCustomerDocuments: () => ({
    isLoading: false,
    isFetching: false,
    data: { rows: [], total: 0, limit: 50, offset: 0 },
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
    currentCustomerDetail = createCustomerDetail();
    useRoleMock.mockReturnValue({ isSellerAdmin: true, isSellerAssistant: false });
    useTenantSettingsMock.mockReturnValue({
      data: {
        modules: {
          orders: {
            features: {
              enquiries: true,
              sales_orders: true,
              invoices: true,
            },
          },
          catalog: {
            price_lists_enabled: true,
          },
        },
      },
    });
  });

  it('renders settings-enabled tabs and omits activity', () => {
    renderPage();

    expect(screen.getByRole('tab', { name: /Details/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Performance/i })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Estimates/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Orders/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Invoices/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Customer Groups/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Price Lists/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Activity/i })).not.toBeInTheDocument();
  });

  it('renders the compact subtitle and updated KPI order', () => {
    renderPage();

    expect(screen.getByText(/Buyer App enabled/i)).toBeInTheDocument();
    expect(screen.getByText(/Bengaluru/i)).toBeInTheDocument();
    expect(screen.getByText(/9876543210/i)).toBeInTheDocument();
    expect(screen.getByText(/Last sale 3d ago/i)).toBeInTheDocument();
    expect(screen.getByText('Invoiced sales · 90D')).toBeInTheDocument();
    expect(screen.getByText('Demand · 90D')).toBeInTheDocument();
    expect(screen.getByText('Credit used / available')).toBeInTheDocument();
    expect(screen.getByText('Last sale')).toBeInTheDocument();
  });

  it('hides module tabs when tenant settings disable them', () => {
    useTenantSettingsMock.mockReturnValue({
      data: {
        modules: {
          orders: {
            features: {
              enquiries: false,
              sales_orders: true,
              invoices: false,
            },
          },
          catalog: {
            price_lists_enabled: false,
          },
        },
      },
    });

    renderPage();

    expect(screen.queryByRole('tab', { name: /^Estimates/i })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Orders/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^Invoices/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Price Lists/i })).not.toBeInTheDocument();
  });

  it('lazy-loads the price lists tab content', () => {
    renderPage();

    fireEvent.click(screen.getByRole('tab', { name: /Price Lists/i }));

    expect(screen.getByText('Assigned price lists')).toBeInTheDocument();
    expect(screen.getByText('North Premium Pricing')).toBeInTheDocument();
    expect(screen.getByText(/Cohort · Premium/i)).toBeInTheDocument();
    expect(screen.getByText(/Validity/i)).toBeInTheDocument();
  });

  it('shows details tab content and buyer user data', () => {
    renderPage();

    fireEvent.click(screen.getByRole('tab', { name: /Details/i }));

    expect(screen.getByText('Buyer details')).toBeInTheDocument();
    expect(screen.getByText('Default pricelist')).toBeInTheDocument();
    expect(screen.getByText('Buyer users')).toBeInTheDocument();
    expect(screen.getByText('Amit Sharma')).toBeInTheDocument();
  });

  it('shows collect payment when the customer has outstanding dues', () => {
    renderPage();

    expect(screen.getByRole('button', { name: /Collect payment/i })).toBeInTheDocument();
  });

  it('hides collect payment when the customer has no outstanding dues', () => {
    currentCustomerDetail = {
      ...currentCustomerDetail,
      meta_strip_4: {
        ...currentCustomerDetail.meta_strip_4,
        credit_used: 0,
      },
    };

    renderPage();

    expect(screen.queryByRole('button', { name: /Collect payment/i })).not.toBeInTheDocument();
  });
});
