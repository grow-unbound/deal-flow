import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replaceMock = vi.fn();
const useBuyerMeMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('@/hooks/useBuyerMe', () => ({ useBuyerMe: () => useBuyerMeMock() }));
vi.mock('@/hooks/useBuyerSiblings', () => ({ prefetchBuyerSiblings: vi.fn(), useBuyerSiblings: () => ({ data: undefined }) }));
vi.mock('@/lib/supabase-browser', () => ({ supabaseBrowser: { auth: { setSession: vi.fn() } } }));
vi.mock('@/contexts/BuyerRealtimeContext', () => ({
  BuyerRealtimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useBuyerRealtimeContext: () => ({}),
}));
vi.mock('@/contexts/BuyerScrollChromeContext', () => ({
  BuyerScrollChromeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useBuyerScrollChromeState: () => ({}),
}));
vi.mock('@/components/layout/BuyerPreviewBootstrap', () => ({ BuyerPreviewBootstrap: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/layout/BuyerTabBar', () => ({ BuyerTabBar: () => null }));
vi.mock('@/components/buyer/cart/CartBar', () => ({ CartBar: () => null }));
vi.mock('@/components/buyer/layout/BuyerPullToRefresh', () => ({ BuyerPullToRefresh: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/buyer/layout/BuyerDesktopHeader', () => ({ BuyerDesktopHeader: () => null }));
vi.mock('@/components/buyer/layout/BuyerDesktopBreadcrumbs', () => ({ BuyerDesktopBreadcrumbs: () => null }));
vi.mock('@/components/buyer/auth/StorefrontLoginOverlay', () => ({ StorefrontLoginOverlay: () => null }));

const pendingMe = (p: Record<string, unknown>) => ({ data: { mode: 'pending', pending: p } });

describe('BuyerShell pending gate', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    useBuyerMeMock.mockReset();
  });

  it('redirects needs_more_info to /resubmit-documents and never renders the catalog', async () => {
    useBuyerMeMock.mockReturnValue(pendingMe({ onboarding_status: 'needs_more_info', intake_submitted: false }));
    const { BuyerShell } = await import('@/components/layout/BuyerShell');
    render(<BuyerShell><div>catalog-content</div></BuyerShell>);
    expect(replaceMock).toHaveBeenCalledWith('/resubmit-documents');
    expect(screen.queryByText('catalog-content')).toBeNull();
  });

  it('keeps sending a fresh pending buyer to /onboarding', async () => {
    useBuyerMeMock.mockReturnValue(pendingMe({ onboarding_status: 'pending_approval', intake_submitted: false, self_registered: true }));
    const { BuyerShell } = await import('@/components/layout/BuyerShell');
    render(<BuyerShell><div>catalog-content</div></BuyerShell>);
    expect(replaceMock).toHaveBeenCalledWith('/onboarding');
  });

  it('leaves an approved buyer alone', async () => {
    useBuyerMeMock.mockReturnValue({ data: { mode: 'buyer', buyer_id: 'b1', tenant: { id: 't1' } } });
    const { BuyerShell } = await import('@/components/layout/BuyerShell');
    render(<BuyerShell><div>catalog-content</div></BuyerShell>);
    expect(screen.getByText('catalog-content')).toBeTruthy();
    expect(replaceMock).not.toHaveBeenCalledWith('/resubmit-documents');
  });
});
