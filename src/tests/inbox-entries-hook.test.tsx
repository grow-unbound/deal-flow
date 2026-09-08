import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const apiFetchMock = vi.fn();
const apiPostMock = vi.fn();

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  apiPost: (...args: unknown[]) => apiPostMock(...args),
}));

import { useInboxEntries, useApplyGenericEntryAction, useInboxActiveCount } from '@/hooks/useInboxEntries';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useInboxEntries', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiPostMock.mockReset();
  });

  it('fetches active entries', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({ entries: [{ id: 'e1' }], nextCursor: null }) });
    const { result } = renderHook(() => useInboxEntries('active'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining('status=active'), expect.anything());
    expect(result.current.data?.entries).toHaveLength(1);
  });

  it('posts a generic action', async () => {
    apiPostMock.mockResolvedValue({ ok: true, json: async () => ({ data: { id: 'e1', status: 'waiting' } }) });
    const { result } = renderHook(() => useApplyGenericEntryAction(), { wrapper });
    await result.current.mutateAsync({ entryId: 'e1', action: 'remind_later', remind_at: '2026-09-08T00:00:00Z' });
    expect(apiPostMock).toHaveBeenCalledWith(
      '/api/tenant/entries/e1/actions',
      { action: 'remind_later', remind_at: '2026-09-08T00:00:00Z' },
    );
  });

  it('fetches the active count', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({ count: 11 }) });
    const { result } = renderHook(() => useInboxActiveCount(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.count).toBe(11);
  });
});
