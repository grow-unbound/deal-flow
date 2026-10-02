import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
const setSessionMock = vi.fn();
vi.mock('@/lib/api-fetch', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));
vi.mock('@/lib/supabase-browser', () => ({
  supabaseBrowser: { auth: { setSession: (...args: unknown[]) => setSessionMock(...args) } },
}));

const acct = (buyer_id: string, business_name: string, state: string) => ({ buyer_id, business_name, contact_name: null, state });

function mockAccounts(accounts: unknown[], current = 'own-1') {
  apiFetchMock.mockImplementation(async (url: string, init?: Record<string, unknown>) => {
    if (url === '/api/buyer/access/accounts') return { ok: true, json: async () => ({ accounts, current_buyer_id: current }) };
    if (url === '/api/auth/switch-buyer') return { ok: true, json: async () => ({ session: { access_token: 'a', refresh_token: 'r' } }) };
    return { ok: true, json: async () => ({ success: true, init }) };
  });
}

describe('OtherAccountsPanel', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    setSessionMock.mockReset();
  });

  it('renders nothing when the phone has no other account', async () => {
    mockAccounts([acct('own-1', 'Own Shop', 'declined')]);
    const { OtherAccountsPanel } = await import('@/components/buyer/onboarding/OtherAccountsPanel');
    const { container } = render(<OtherAccountsPanel tenantId="t1" />);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/buyer/access/accounts'));
    expect(container).toBeEmptyDOMElement();
  });

  it("lists the other accounts (not the one the buyer is on) with their status", async () => {
    mockAccounts([acct('own-1', 'Own Shop', 'declined'), acct('a1', 'Active Shop', 'active'), acct('c1', 'Sent Shop', 'requested')]);
    const { OtherAccountsPanel } = await import('@/components/buyer/onboarding/OtherAccountsPanel');
    render(<OtherAccountsPanel tenantId="t1" />);

    expect(await screen.findByText('Other accounts for this number')).toBeTruthy();
    expect(screen.getByText('Active Shop')).toBeTruthy();
    expect(screen.getByText('Sent Shop')).toBeTruthy();
    expect(screen.queryByText('Own Shop')).toBeNull();
  });

  it('opens an enabled sibling through switch-buyer', async () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { assign }, writable: true });
    mockAccounts([acct('own-1', 'Own Shop', 'declined'), acct('a1', 'Active Shop', 'active')]);
    const { OtherAccountsPanel } = await import('@/components/buyer/onboarding/OtherAccountsPanel');
    render(<OtherAccountsPanel tenantId="t1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    expect(apiFetchMock).toHaveBeenCalledWith('/api/auth/switch-buyer', expect.objectContaining({ body: JSON.stringify({ buyer_id: 'a1' }) }));
    expect(setSessionMock).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' });
  });

  it('requests access for a switched-off sibling inline, then refreshes the list', async () => {
    mockAccounts([acct('own-1', 'Own Shop', 'declined'), acct('b1', 'Off Shop', 'can_request')]);
    const { OtherAccountsPanel } = await import('@/components/buyer/onboarding/OtherAccountsPanel');
    render(<OtherAccountsPanel tenantId="t1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Request access' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/buyer/access/request',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ buyer_id: 'b1' }) }),
    ));
    await waitFor(() => expect(apiFetchMock.mock.calls.filter((c) => c[0] === '/api/buyer/access/accounts').length).toBe(2));
  });

  it('shows the server error when the request is refused', async () => {
    apiFetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/buyer/access/accounts') return { ok: true, json: async () => ({ accounts: [acct('own-1', 'Own', 'declined'), acct('b1', 'Off Shop', 'can_request')], current_buyer_id: 'own-1' }) };
      return { ok: false, json: async () => ({ error: 'That account is not available to request access for.' }) };
    });
    const { OtherAccountsPanel } = await import('@/components/buyer/onboarding/OtherAccountsPanel');
    render(<OtherAccountsPanel tenantId="t1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Request access' }));
    expect(await screen.findByText(/not available to request access for/i)).toBeTruthy();
  });
});
