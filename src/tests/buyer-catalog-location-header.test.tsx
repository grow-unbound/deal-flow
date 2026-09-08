import { render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useBuyerMeMock = vi.hoisted(() => vi.fn());
const openLoginMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
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

vi.mock('@/hooks/useBuyerMe', () => ({
  useBuyerMe: (...args: unknown[]) => useBuyerMeMock(...args),
}));

vi.mock('@/contexts/StorefrontLoginContext', () => ({
  useStorefrontLogin: () => ({ openLogin: openLoginMock, closeLogin: vi.fn(), loginOpen: false }),
}));

vi.mock('@/contexts/BuyerCartContext', () => ({
  useCart: () => ({ items: [] }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ signOut: vi.fn() }),
}));

vi.mock('@/hooks/useBuyerSession', () => ({
  useBuyerSession: () => ({ effectiveBuyerRole: null, isBuyerProxied: false, currentBuyerId: null }),
}));

vi.mock('@/lib/buyer-switch-account', () => ({
  redirectToBuyerAccountSelector: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useIsFetching: () => 0,
}));

vi.mock('@/components/buyer/layout/BuyerDesktopCartDrawer', () => ({
  BuyerDesktopCartDrawer: () => null,
}));

vi.mock('@/components/buyer/layout/BuyerLocationControl', () => ({
  BuyerLocationControl: () => <div data-testid="buyer-location-control" />,
}));

vi.mock('next/image', () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

import { BuyerCatalogLandingHeader } from '@/components/buyer/layout/BuyerCatalogLandingHeader';
import { BuyerDesktopHeader } from '@/components/buyer/layout/BuyerDesktopHeader';
import { BuyerTabBar } from '@/components/layout/BuyerTabBar';

describe('buyer catalog landing header', () => {
  beforeEach(() => {
    useBuyerMeMock.mockReset();
    openLoginMock.mockReset();
    useBuyerMeMock.mockReturnValue({
      data: {
        mode: 'buyer',
        tenant: { name: 'MobileHub', logo_url: null },
      },
      isLoading: false,
    });
  });

  it('shows location link aligned with title and links to selector', () => {
    render(
      <BuyerCatalogLandingHeader
        searchValue=""
        onSearchChange={vi.fn()}
      />,
    );

    const locationLink = screen.getByRole('link', { name: /selected location/i });
    expect(locationLink).toHaveAttribute('href', '/location?returnTo=%2Fbuy%2Fhome');
    expect(screen.getByText('Andheri West')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /search catalog/i })).toBeInTheDocument();
  });

  it('renders the tenant name and catalog label', () => {
    render(
      <BuyerCatalogLandingHeader
        searchValue=""
        onSearchChange={vi.fn()}
      />,
    );
    expect(screen.getByText('MobileHub')).toBeInTheDocument();
    expect(screen.getByText('Catalog')).toBeInTheDocument();
  });

  it('shows an account-action skeleton instead of Log in while buyer context resolves', () => {
    useBuyerMeMock.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(
      <BuyerCatalogLandingHeader
        searchValue=""
        onSearchChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Loading buyer account action')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log in/i })).not.toBeInTheDocument();
  });

  it('renders the public catalog Login action as the charcoal primary CTA', () => {
    useBuyerMeMock.mockReturnValue({
      data: {
        mode: 'guest',
        tenant: { name: 'MobileHub', logo_url: null },
      },
      isLoading: false,
    });

    render(
      <BuyerCatalogLandingHeader
        searchValue=""
        onSearchChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /log in/i })).toHaveClass('bg-cream-950');
  });

  it('shows desktop account-action skeleton instead of Log in while buyer context resolves', () => {
    useBuyerMeMock.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(<BuyerDesktopHeader />);

    expect(screen.getByLabelText('Loading buyer account actions')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log in/i })).not.toBeInTheDocument();
  });

  it('keeps the mobile Orders tab as a link while buyer context resolves', () => {
    useBuyerMeMock.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(<BuyerTabBar />);

    expect(screen.getByRole('link', { name: /orders/i })).toHaveAttribute('href', '/orders');
    expect(screen.queryByRole('button', { name: /orders/i })).not.toBeInTheDocument();
  });
});
