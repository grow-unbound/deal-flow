import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
const apiPatchMock = vi.fn();

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    currentTenant: {
      storefront_url: 'https://acme.useyukti.in',
    },
  }),
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  apiPatch: (...args: unknown[]) => apiPatchMock(...args),
}));

vi.mock('@/components/seller/onboarding/OnboardingPreviewFrame', () => ({
  OnboardingPreviewFrame: (props: {
    pricingMode?: string;
    collectTargetUnitPriceRange?: boolean;
    productDisplayMode?: string;
  }) => (
    <div data-testid="buyer-preview">
      <p>Preview pricing: {props.pricingMode}</p>
      <p>Preview target: {props.collectTargetUnitPriceRange ? 'on' : 'off'}</p>
      <p>Preview display: {props.productDisplayMode}</p>
    </div>
  ),
}));

import { CatalogControlCenterClient } from '@/components/seller/catalog/CatalogControlCenterClient';

const baseState = {
  productCount: 12,
  catalogUpdatedAt: '2026-09-11T06:30:00.000Z',
  productReadiness: {
    activeProductCount: 12,
    anomalyCount: 2,
    missingProductImageCount: 3,
  },
  brandRestrictionSummary: {
    totalCustomerGroups: 4,
    restrictedCustomerGroups: 2,
    restrictedBrandCount: 3,
    sampleCustomerGroups: ['Retailers', 'Dealers'],
  },
  items: [],
  brands: [],
  categories: [],
  anomalies: [],
  slug: 'acme',
  storefrontHost: 'acme.useyukti.in',
  businessName: 'Acme',
  live: true,
  pricingMode: 'hide_price_collect_enquiry',
  priceListId: null,
  accessMode: 'public_link',
  collectTargetUnitPriceRange: true,
  productDisplayMode: 'sku_list',
  priceLists: [{ id: 'pl-1', name: 'Retail list' }],
  photoTargets: [],
  settings: {},
};

function jsonResponse(data: unknown) {
  return {
    ok: true,
    json: async () => data,
  };
}

describe('CatalogControlCenterClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue(jsonResponse(baseState));
    apiPatchMock.mockResolvedValue(jsonResponse({ ok: true, state: baseState }));
  });

  it('renders compact summary, readiness, and brand restriction cards', async () => {
    render(<CatalogControlCenterClient />);

    await screen.findByText('Setup summary');

    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Hide prices and collect enquiries')).toBeInTheDocument();
    expect(screen.getByText('Target rate')).toBeInTheDocument();
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(screen.getByText(/Last updated/i)).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('2 rows need review')).toBeInTheDocument();
    expect(screen.getByText('products are missing images')).toBeInTheDocument();
    expect(screen.getByText(/2 groups restrict 3 brands: Retailers, Dealers/)).toBeInTheDocument();
  });

  it('opens inline access editing and saves through the shared setup API', async () => {
    render(<CatalogControlCenterClient />);

    await screen.findByText('Setup summary');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Access' }));
    fireEvent.click(screen.getByText('Approved buyers only'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);

    await waitFor(() => {
      expect(apiPatchMock).toHaveBeenCalledWith('/api/tenant/catalog/setup', expect.objectContaining({
        access_mode: 'approved_buyers_only',
        pricing_mode: 'hide_price_collect_enquiry',
        collect_target_unit_price_range: true,
        product_display_mode: 'sku_list',
      }));
    });
  });

  it('keeps hidden-price target-rate controls wired into the buyer preview', async () => {
    render(<CatalogControlCenterClient />);

    await screen.findByText('Setup summary');
    expect(screen.getByText('Preview pricing: hide_price_collect_enquiry')).toBeInTheDocument();
    expect(screen.getByText('Preview target: on')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Pricing' }));
    expect(screen.getByText('Ask for target unit price range')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Ask for target unit price range'));
    expect(screen.getByText('Preview target: off')).toBeInTheDocument();
  });
});
