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
    logoUrl?: string | null;
  }) => (
    <div data-testid="buyer-preview">
      <p>Preview pricing: {props.pricingMode}</p>
      <p>Preview target: {props.collectTargetUnitPriceRange ? 'on' : 'off'}</p>
      <p>Preview display: {props.productDisplayMode}</p>
      <p>Preview logo: {props.logoUrl ?? 'none'}</p>
    </div>
  ),
}));

import { CatalogControlCenterClient } from '@/components/seller/catalog/CatalogControlCenterClient';

const baseState = {
  productCount: 12,
  catalogUpdatedAt: '2026-09-11T06:30:00.000Z',
  liveAt: '2026-09-10T06:30:00.000Z',
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
  tagline: 'Security distribution made simple',
  logoUrl: 'https://cdn.example.com/acme-logo.png',
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

  it('renders the catalog banner, top actions, and compact readiness cards', async () => {
    render(<CatalogControlCenterClient />);

    await screen.findByText('Setup summary');

    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Your catalog is live')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy catalog link' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save settings/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Update live catalog/i })).toBeDisabled();
    expect(screen.queryByText('Saved changes unpublished')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open catalog/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Preview as buyer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reconfigure catalog/i })).not.toBeInTheDocument();
    expect(screen.getByText('Hide prices and collect enquiries')).toBeInTheDocument();
    expect(screen.getByText('Security distribution made simple')).toBeInTheDocument();
    expect(screen.queryByText('Target rate')).not.toBeInTheDocument();
    expect(screen.getByText(/Last updated/i)).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('2 rows need review')).toBeInTheDocument();
    expect(screen.getByText('Missing images')).toBeInTheDocument();
    expect(screen.queryByText('Customer groups')).not.toBeInTheDocument();
    expect(screen.queryByText(/2 groups restrict 3 brands: Retailers, Dealers/)).not.toBeInTheDocument();
    expect(screen.getByText('Preview logo: https://cdn.example.com/acme-logo.png')).toBeInTheDocument();
  });

  it('opens inline access editing and saves through the shared setup API', async () => {
    render(<CatalogControlCenterClient />);

    await screen.findByText('Setup summary');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Access' }));
    fireEvent.click(screen.getByText('Approved buyers only'));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(apiPatchMock).toHaveBeenCalledWith('/api/tenant/catalog/setup', expect.objectContaining({
        access_mode: 'approved_buyers_only',
        pricing_mode: 'hide_price_collect_enquiry',
        collect_target_unit_price_range: true,
        product_display_mode: 'sku_list',
      }));
    });
    expect(screen.getByText('Saved changes unpublished')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Update live catalog/i })).toBeEnabled();
  });

  it('edits the tagline inline and saves it through tenant settings', async () => {
    render(<CatalogControlCenterClient />);

    await screen.findByText('Setup summary');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Tagline' }));
    fireEvent.change(screen.getByLabelText('Tagline'), {
      target: { value: 'Premium surveillance supplies' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(apiPatchMock).toHaveBeenCalledWith('/api/tenant/catalog/setup', expect.objectContaining({
        settings: {
          business: {
            tagline: 'Premium surveillance supplies',
          },
        },
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
