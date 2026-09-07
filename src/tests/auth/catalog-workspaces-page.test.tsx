import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const fetchMock = vi.fn();
const assignMock = vi.fn();

vi.mock('@/lib/buy-as-storage', () => ({
  writeStoredBuyAsBuyerId: vi.fn(),
}));

vi.mock('@/components/brand/YuktiLogo', () => ({
  YuktiLogo: () => <div data-testid="yukti-logo" />,
}));

vi.mock('@/components/buyer/workspace/WorkspaceLookbook', () => ({
  WorkspaceLookbook: ({ tenants }: { tenants: unknown[] }) => (
    <div data-testid="workspace-lookbook">tenants:{tenants.length}</div>
  ),
}));

const oneTenantOneAccount = [{
  tenant_id: 'tenant-1',
  tenant_name: 'Tenant One',
  tenant_slug: 'tenant-one',
  logo_url: null,
  accounts: [{
    buyer_id: 'buyer-1',
    business_name: 'Buyer One',
    contact_name: 'Rajan',
    role: 'buyer_admin',
  }],
}];

describe('catalog workspaces page', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    assignMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        assign: assignMock,
      },
    });
  });

  it('auto-enters when the buyer has exactly one tenant and one account', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tenants: oneTenantOneAccount }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          handoff_url: 'https://tenant-one.useyukti.in/auth/storefront-handoff?token_hash=abc',
        }),
      });

    const WorkspacesPage = await import('../../../app/(catalog)/workspaces/page').then((mod) => mod.default);
    render(<WorkspacesPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/workspaces/enter', expect.objectContaining({
        method: 'POST',
      }));
    });
    expect(assignMock).toHaveBeenCalledWith('https://tenant-one.useyukti.in/auth/storefront-handoff?token_hash=abc');
    expect(screen.queryByTestId('workspace-lookbook')).not.toBeInTheDocument();
  });

  it('shows the selector when the buyer has multiple tenant choices', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tenants: [
          ...oneTenantOneAccount,
          {
            ...oneTenantOneAccount[0],
            tenant_id: 'tenant-2',
            tenant_name: 'Tenant Two',
            tenant_slug: 'tenant-two',
          },
        ],
      }),
    });

    const WorkspacesPage = await import('../../../app/(catalog)/workspaces/page').then((mod) => mod.default);
    render(<WorkspacesPage />);

    expect(await screen.findByTestId('workspace-lookbook')).toHaveTextContent('tenants:2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(assignMock).not.toHaveBeenCalled();
  });
});
