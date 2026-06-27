import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/buy/catalog',
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
}));

vi.mock('@/hooks/useBuyerScrollCollapse', () => ({
  useBuyerScrollCollapse: () => ({ collapsed: false, sentinelRef: { current: null } }),
}));

import { BuyerCatalogLandingHeader } from '@/components/buyer/layout/BuyerCatalogLandingHeader';

describe('buyer catalog landing header', () => {
  it('shows compact selected location and links to selector', () => {
    render(<BuyerCatalogLandingHeader searchValue="" onSearchChange={() => undefined} />);

    const locationLink = screen.getByRole('link', { name: /selected location/i });
    expect(locationLink).toHaveAttribute('href', '/buy/location?returnTo=%2Fbuy%2Fcatalog');
    expect(screen.getByText('Andheri West')).toBeInTheDocument();
  });
});
