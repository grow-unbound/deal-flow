import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  removeChannelMock,
  onNewMock,
  onPatchMock,
  onRefreshMock,
  realtimeCallbacks,
} = vi.hoisted(() => ({
  removeChannelMock: vi.fn(),
  onNewMock: vi.fn(),
  onPatchMock: vi.fn(),
  onRefreshMock: vi.fn(),
  realtimeCallbacks: [] as Array<(payload: { payload: Record<string, unknown> }) => void>,
}));

const { channelMock } = vi.hoisted(() => ({ channelMock: vi.fn() }));

vi.mock('@/lib/supabase-browser', () => {
  const chain = {
    on: vi.fn((
      event: string,
      config: { event?: string },
      callback: (payload: { payload: Record<string, unknown> }) => void,
    ) => {
      if (event === 'broadcast' && config.event === 'notification') {
        realtimeCallbacks.push(callback);
      }
      return chain;
    }),
    subscribe: vi.fn(() => ({ id: 'buyer-channel-1' })),
  };

  return {
    supabaseBrowser: {
      channel: channelMock.mockImplementation(() => chain),
      removeChannel: removeChannelMock,
    },
  };
});

import { useBuyerRealtime } from '@/hooks/useBuyerRealtime';

describe('useBuyerRealtime', () => {
  beforeEach(() => {
    removeChannelMock.mockReset();
    onNewMock.mockReset();
    onPatchMock.mockReset();
    onRefreshMock.mockReset();
    realtimeCallbacks.length = 0;
    channelMock.mockClear();
  });

  it('notifies buyers when their estimate is first inserted', () => {
    renderHook(() =>
      useBuyerRealtime({
        tenantId: 'tenant-1',
        buyerId: 'buyer-1',
        onNew: onNewMock,
        onPatch: onPatchMock,
        onRefresh: onRefreshMock,
      }),
    );

    act(() => {
      realtimeCallbacks[0]?.({
        payload: {
          entity_type: 'estimates',
          event_type: 'insert',
          buyer_id: 'buyer-1',
          payload: {
            id: 'est-1',
            status: 'draft',
            created_at: '2026-07-27T06:51:54.449Z',
          },
          old_payload: null,
        },
      });
    });

    expect(onNewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'new_estimate',
        id: 'est-1_new_estimate',
        title: 'New estimate',
        body: 'Status: draft',
      }),
    );
    expect(onPatchMock).not.toHaveBeenCalled();
    expect(onRefreshMock).toHaveBeenCalledTimes(1);
  });

  it('notifies once when an estimate changes to a new buyer-visible status', () => {
    renderHook(() =>
      useBuyerRealtime({
        tenantId: 'tenant-1',
        buyerId: 'buyer-1',
        onNew: onNewMock,
        onPatch: onPatchMock,
        onRefresh: onRefreshMock,
      }),
    );

    act(() => {
      realtimeCallbacks[0]?.({
        payload: {
          entity_type: 'estimates',
          event_type: 'update',
          buyer_id: 'buyer-1',
          payload: {
            id: 'est-1',
            status: 'sent',
            estimate_number: 'EST-001',
            updated_at: '2026-07-20T10:00:00.000Z',
          },
          old_payload: {
            id: 'est-1',
            status: 'draft',
            estimate_number: null,
          },
        },
      });
    });

    expect(onNewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'estimate_updated',
        id: 'est-1_estimate_updated',
        title: 'Estimate updated · EST-001',
        body: 'Status: sent',
      }),
    );
    expect(onPatchMock).toHaveBeenCalledWith('estimate', 'est-1', {
      title: 'Estimate updated · EST-001',
      body: 'Status: sent',
    });
    expect(onRefreshMock).toHaveBeenCalledTimes(1);
  });

  it('skips duplicate estimate toasts when only non-visible fields update afterward', () => {
    renderHook(() =>
      useBuyerRealtime({
        tenantId: 'tenant-1',
        buyerId: 'buyer-1',
        onNew: onNewMock,
        onPatch: onPatchMock,
        onRefresh: onRefreshMock,
      }),
    );

    act(() => {
      realtimeCallbacks[0]?.({
        payload: {
          entity_type: 'estimates',
          event_type: 'update',
          buyer_id: 'buyer-1',
          payload: {
            id: 'est-1',
            status: 'sent',
            estimate_number: 'EST-001',
            document_url: 'https://example.com/estimate.pdf',
            updated_at: '2026-07-20T10:01:00.000Z',
          },
          old_payload: {
            id: 'est-1',
            status: 'sent',
            estimate_number: 'EST-001',
            document_url: null,
          },
        },
      });
    });

    expect(onNewMock).not.toHaveBeenCalled();
    expect(onPatchMock).not.toHaveBeenCalled();
    expect(onRefreshMock).not.toHaveBeenCalled();
  });

  it('dedupes identical estimate updates delivered twice in the same window', () => {
    renderHook(() =>
      useBuyerRealtime({
        tenantId: 'tenant-1',
        buyerId: 'buyer-1',
        onNew: onNewMock,
        onPatch: onPatchMock,
        onRefresh: onRefreshMock,
      }),
    );

    const payload = {
      payload: {
        entity_type: 'estimates',
        event_type: 'update',
        buyer_id: 'buyer-1',
        payload: {
          id: 'est-dup',
          status: 'sent',
          estimate_number: 'EST-999',
          updated_at: '2026-07-20T10:00:00.000Z',
        },
        old_payload: {
          id: 'est-dup',
          status: 'draft',
          estimate_number: null,
        },
      },
    };

    act(() => {
      realtimeCallbacks[0]?.(payload);
      realtimeCallbacks[0]?.(payload);
    });

    expect(onNewMock).toHaveBeenCalledTimes(1);
    expect(onPatchMock).toHaveBeenCalledTimes(1);
    expect(onRefreshMock).toHaveBeenCalledTimes(1);
  });

  it('subscribes only to the buyer-scoped and catalog-updates private topics, never the tenant-wide one', () => {
    renderHook(() =>
      useBuyerRealtime({ tenantId: 'tenant-1', buyerId: 'buyer-1', onNew: onNewMock, onPatch: onPatchMock, onRefresh: onRefreshMock }),
    );

    const topics = channelMock.mock.calls.map((call) => call[0]);
    expect(topics).toEqual(['buyer-notifications:tenant-1:buyer-1', 'catalog-updates:tenant-1']);
    for (const call of channelMock.mock.calls) {
      expect(call[1]).toEqual({ config: { private: true } });
    }
  });

  it('opens no socket for anonymous visitors (no buyer id)', () => {
    renderHook(() =>
      useBuyerRealtime({ tenantId: 'tenant-1', buyerId: '', onNew: onNewMock, onPatch: onPatchMock, onRefresh: onRefreshMock }),
    );
    expect(channelMock).not.toHaveBeenCalled();
  });

  it('announces a published catalog delivered on the server-scoped topic without a client scope check', () => {
    renderHook(() =>
      useBuyerRealtime({ tenantId: 'tenant-1', buyerId: 'buyer-1', onNew: onNewMock, onPatch: onPatchMock, onRefresh: onRefreshMock }),
    );

    act(() => {
      realtimeCallbacks[1]?.({
        payload: {
          entity_type: 'campaigns',
          event_type: 'update',
          buyer_id: null,
          payload: {
            id: 'cat-1',
            name: 'Diwali range',
            status: 'published',
            share_token: 'tok-1',
            created_at: '2026-09-20T00:00:00.000Z',
            updated_at: '2026-09-20T01:00:00.000Z',
          },
          old_payload: null,
        },
      });
    });

    expect(onNewMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'new_catalog', title: 'New catalog: Diwali range', href: '/buy/home?share_token=tok-1' }),
    );
    expect(onRefreshMock).toHaveBeenCalledTimes(1);
  });

  it('ignores unpublished catalogs and rows addressed to another buyer', () => {
    renderHook(() =>
      useBuyerRealtime({ tenantId: 'tenant-1', buyerId: 'buyer-1', onNew: onNewMock, onPatch: onPatchMock, onRefresh: onRefreshMock }),
    );

    act(() => {
      realtimeCallbacks[1]?.({
        payload: { entity_type: 'campaigns', event_type: 'update', buyer_id: null, payload: { id: 'cat-2', name: 'Draft', status: 'draft', share_token: 't', updated_at: 'x' }, old_payload: null },
      });
      realtimeCallbacks[0]?.({
        payload: { entity_type: 'orders', event_type: 'update', buyer_id: 'buyer-2', payload: { id: 'o-1', order_number: 'SO-1', status: 'confirmed', updated_at: 'x' }, old_payload: { status: 'draft' } },
      });
    });

    expect(onNewMock).not.toHaveBeenCalled();
    expect(onRefreshMock).not.toHaveBeenCalled();
  });
});
