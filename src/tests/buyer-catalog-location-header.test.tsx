import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/buy/home',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/contexts/BuyerDeliveryContext', () => ({
  useBuyerDeliveryOptional: () => ({
    selected: {
      place_id: 'place-1',
      label: 'Andheri West',
      formatted_address: 'Andheri West, Mumbai, Maharashtra',
      city: 'Mumbai',
      lat: 19.1,
      lng: 72.8,
    },
  }),
}));

vi.mock('@/hooks/useBuyerNavigationDirection', () => ({
  markBuyerNavigationForward: vi.fn(),
  navigateBuyerBack: vi.fn(),
}));

vi.mock('@/hooks/useBuyerScrollCollapse', () => ({
  useBuyerScrollCollapse: () => ({ collapsed: false, sentinelRef: { current: null } }),
}));

import { BuyerCatalogLandingHeader } from '@/components/buyer/layout/BuyerCatalogLandingHeader';

describe('buyer catalog landing header', () => {
  it('shows location link aligned with title and links to selector', () => {
    render(
      <BuyerCatalogLandingHeader
        searchValue=""
        onSearchChange={vi.fn()}
      />,
    );

    const locationLink = screen.getByRole('link', { name: /selected location/i });
    expect(locationLink).toHaveAttribute('href', '/buy/location?returnTo=%2Fbuy%2Fcatalog');
    expect(screen.getByText('Andheri West')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /search catalog/i })).toBeInTheDocument();
  });

  it('renders Catalog as the page title', () => {
    render(
      <BuyerCatalogLandingHeader
        searchValue=""
        onSearchChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Browse')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Catalog' })).toBeInTheDocument();
  });
});
