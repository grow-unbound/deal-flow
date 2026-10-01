import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replaceMock = vi.fn();
const useBuyerMeMock = vi.fn();
const apiFetchMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));
vi.mock('@/lib/api-fetch', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));
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
        self_registered: true,
        access_requested: false,
        seller_whatsapp_number: '9876500000',
        onboarding_status: 'pending_approval',
        ...overrides,
      },
      ...dataOverrides,
    },
    isLoading: false,
    refetch: vi.fn().mockResolvedValue(undefined),
  };
}

describe('BuyerPendingPage', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    useBuyerMeMock.mockReset();
    apiFetchMock.mockReset();
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
    useBuyerMeMock.mockReturnValue(pendingMe({ intake_submitted: false, self_registered: true }));
    const { default: BuyerPendingPage } = await import('../../app/pending/page');
    render(<BuyerPendingPage />);

    expect(replaceMock).toHaveBeenCalledWith('/onboarding');
    expect(screen.queryByRole('link', { name: /browse the public catalog/i })).toBeNull();
  });

  it('sends a needs_more_info buyer to the resubmission form instead of the request-sent screen', async () => {
    useBuyerMeMock.mockReturnValue(pendingMe({ onboarding_status: 'needs_more_info' }));
    const { default: BuyerPendingPage } = await import('../../app/pending/page');
    render(<BuyerPendingPage />);

    expect(replaceMock).toHaveBeenCalledWith('/resubmit-documents');
    expect(screen.queryByText(/request sent/i)).toBeNull();
  });
  it('lets an existing buyer with disabled access request it instead of sending them to /onboarding', async () => {
    const me = pendingMe({ intake_submitted: false, self_registered: false, onboarding_status: 'approved' });
    useBuyerMeMock.mockReturnValue(me);
    apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    const { default: BuyerPendingPage } = await import('../../app/pending/page');
    render(<BuyerPendingPage />);

    expect(replaceMock).not.toHaveBeenCalledWith('/onboarding');
    fireEvent.click(screen.getByRole('button', { name: /request access/i }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/buyer/access/request', { method: 'POST' }));
    await waitFor(() => expect(me.refetch).toHaveBeenCalled());
  });

  it('shows an error and keeps the button when the access request fails', async () => {
    useBuyerMeMock.mockReturnValue(pendingMe({ intake_submitted: false, self_registered: false, onboarding_status: 'approved' }));
    apiFetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Failed to send your request. Please try again.' }) });
    const { default: BuyerPendingPage } = await import('../../app/pending/page');
    render(<BuyerPendingPage />);

    fireEvent.click(screen.getByRole('button', { name: /request access/i }));
    expect(await screen.findByText(/failed to send your request/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /request access/i })).toBeTruthy();
  });

  it('shows "Request sent" (no button) once an existing buyer has requested access', async () => {
    useBuyerMeMock.mockReturnValue(pendingMe({ intake_submitted: false, self_registered: false, access_requested: true, onboarding_status: 'approved' }));
    const { default: BuyerPendingPage } = await import('../../app/pending/page');
    render(<BuyerPendingPage />);

    expect(screen.getByText(/request sent/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /request access/i })).toBeNull();
  });
});
