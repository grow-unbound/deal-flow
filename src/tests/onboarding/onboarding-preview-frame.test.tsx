import type { ImgHTMLAttributes, ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: { alt?: string; [key: string]: unknown }) => (
    <img alt={alt} {...(props as ImgHTMLAttributes<HTMLImageElement>)} />
  ),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock('@/hooks/useBuyerMe', () => ({
  useBuyerMe: () => ({ data: undefined, isLoading: false }),
}));

vi.mock('@/lib/analytics-identity', () => ({
  useBuyerAnalyticsIds: () => ({ buyer_id: null, tenant_id: null }),
  useSellerAnalyticsIds: () => ({ seller_id: null, tenant_id: null }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, currentTenantId: null }),
}));

vi.mock('@/contexts/BuyerCartContext', () => ({
  BuyerCartProvider: ({ children }: { children: React.ReactNode }) => children,
  useCart: () => ({ items: [], addItem: vi.fn(), updateQty: vi.fn() }),
}));

import { OnboardingPreviewFrame } from '@/components/seller/onboarding/OnboardingPreviewFrame';

function renderPreview(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('onboarding catalog preview', () => {
  it('renders browser chrome and catalog sections without an item count on All products', () => {
    renderPreview(
      <OnboardingPreviewFrame
        slug="mehta-electricals"
        businessName="Mehta Electricals"
        items={[]}
        brands={[{ id: 'b1', name: 'CP Plus', logo_url: null }]}
        categories={[{ id: 'c1', name: 'IP Camera', slug: 'ip', product_count: 1, image_url: null }]}
      />,
    );

    expect(screen.getByText('mehta-electricals.useyukti.in')).toBeInTheDocument();
    expect(screen.getByText('Brands')).toBeInTheDocument();
    expect(screen.getByText('Categories')).toBeInTheDocument();
    expect(screen.getByText('All products')).toBeInTheDocument();
    expect(screen.queryByText(/items/i)).not.toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
  });
});
