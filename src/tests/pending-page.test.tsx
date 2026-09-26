import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replaceMock = vi.fn();
const useBuyerMeMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));
vi.mock('@/hooks/useBuyerMe', () => ({ useBuyerMe: () => useBuyerMeMock() }));
vi.mock('@/lib/supabase-browser', () => ({ supabaseBrowser: { auth: { signOut: vi.fn() } } }));
vi.mock('@/components/brand/YuktiLogo', () => ({ YuktiLogo: () => null }));

function pendingMe(overrides: Record<string, unknown> = {}, dataOverrides: Record<string, unknown> = {}) {
  return {
    data: {
      mode: 'pending',
      tenant: { name: 'VBS Group' },
      buyer_catalog: {
        id: 'catalog-1',
        pricing_mode: 'base_selling_rate',
        access_mode: 'public_link',
        public_browse_allowed: true,
        collect_target_unit_price_range: false,
      },
      pending: {
        intake_submitted: true,
        seller_whatsapp_number: '9876500000',
        onboarding_status: 'pending_approval',
        ...overrides,
      },
      ...dataOverrides,
    },
    isLoading: false,
  };
}

describe('BuyerPendingPage', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    useBuyerMeMock.mockReset();
  });

  it('offers a link to browse the public catalog while approval is pending', async () => {
    useBuyerMeMock.mockReturnValue(pendingMe());
    const { default: BuyerPendingPage } = await import('../../app/pending/page');
    render(<BuyerPendingPage />);

    const cta = screen.getByRole('link', { name: /browse the public catalog/i });
    expect(cta.getAttribute('href')).toBe('/');
  });

  it('hides the public catalog link for approved-buyers-only catalogs', async () => {
    useBuyerMeMock.mockReturnValue(pendingMe({}, {
      buyer_catalog: {
        id: 'catalog-1',
        pricing_mode: 'base_selling_rate',
        access_mode: 'approved_buyers_only',
        public_browse_allowed: false,
        collect_target_unit_price_range: false,
      },
    }));

    const { default: BuyerPendingPage } = await import('../../app/pending/page');
    render(<BuyerPendingPage />);

    expect(screen.queryByRole('link', { name: /browse the public catalog/i })).toBeNull();
  });

  it('sends a pending buyer who has not submitted details to /onboarding first', async () => {
    useBuyerMeMock.mockReturnValue(pendingMe({ intake_submitted: false }));
    const { default: BuyerPendingPage } = await import('../../app/pending/page');
    render(<BuyerPendingPage />);

    expect(replaceMock).toHaveBeenCalledWith('/onboarding');
    expect(screen.queryByRole('link', { name: /browse the public catalog/i })).toBeNull();
  });
});
