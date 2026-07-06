import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  invalidateQueriesMock,
  onNewMock,
  onPatchMock,
  removeChannelMock,
  estimateInsertCallbacks,
  estimateUpdateCallbacks,
  orderInsertCallbacks,
  orderUpdateCallbacks,
} = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn(),
  onNewMock: vi.fn(),
  onPatchMock: vi.fn(),
  removeChannelMock: vi.fn(),
  estimateInsertCallbacks: [] as Array<(payload: { new: Record<string, unknown> }) => void>,
  estimateUpdateCallbacks: [] as Array<(payload: { old: Record<string, unknown>; new: Record<string, unknown> }) => void>,
  orderInsertCallbacks: [] as Array<(payload: { new: Record<string, unknown> }) => void>,
  orderUpdateCallbacks: [] as Array<(payload: { old: Record<string, unknown>; new: Record<string, unknown> }) => void>,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}));

vi.mock('@/lib/supabase-browser', () => {
  const chain = {
    on: vi.fn((
      event: string,
      config: { table?: string; event?: string },
      callback: (payload: { new: Record<string, unknown>; old?: Record<string, unknown> }) => void,
    ) => {
      if (config.table === 'estimates' && config.event === 'UPDATE') {
        estimateUpdateCallbacks.push(callback as (payload: { old: Record<string, unknown>; new: Record<string, unknown> }) => void);
      } else if (config.table === 'estimates') {
        estimateInsertCallbacks.push(callback);
      } else if (config.table === 'orders' && config.event === 'UPDATE') {
        orderUpdateCallbacks.push(callback as (payload: { old: Record<string, unknown>; new: Record<string, unknown> }) => void);
      } else if (config.table === 'orders') {
        orderInsertCallbacks.push(callback);
      }
      return chain;
    }),
    subscribe: vi.fn(() => ({ id: 'channel-1' })),
  };

  return {
    supabaseBrowser: {
      channel: vi.fn(() => chain),
      removeChannel: removeChannelMock,
    },
  };
});

import { useSellerRealtime } from '@/hooks/useSellerRealtime';

describe('useSellerRealtime', () => {
  beforeEach(() => {
    invalidateQueriesMock.mockReset();
    onNewMock.mockReset();
    onPatchMock.mockReset();
    removeChannelMock.mockReset();
    estimateInsertCallbacks.length = 0;
    estimateUpdateCallbacks.length = 0;
    orderInsertCallbacks.length = 0;
    orderUpdateCallbacks.length = 0;
  });

  it('skips estimate insert notifications when estimate_number is null', () => {
    renderHook(() =>
      useSellerRealtime({
        tenantId: 'tenant-1',
        locationIds: null,
        onNew: onNewMock,
        onPatch: onPatchMock,
      }),
    );

    act(() => {
      estimateInsertCallbacks[0]?.({
        new: {
          id: 'est-1',
          tenant_id: 'tenant-1',
          location_id: 'loc-1',
          estimate_number: null,
          total_amount: 12345,
          created_at: '2026-07-06T00:00:00.000Z',
        },
      });
    });

    expect(onNewMock).not.toHaveBeenCalled();
    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });

  it('notifies on estimate update when estimate_number becomes available', () => {
    renderHook(() =>
      useSellerRealtime({
        tenantId: 'tenant-1',
        locationIds: null,
        onNew: onNewMock,
        onPatch: onPatchMock,
      }),
    );

    act(() => {
      estimateUpdateCallbacks[0]?.({
        old: {
          id: 'est-1',
          estimate_number: null,
        },
        new: {
          id: 'est-1',
          tenant_id: 'tenant-1',
          location_id: 'loc-1',
          estimate_number: 'EST-000045',
          total_amount: 12345,
          created_at: '2026-07-06T00:00:00.000Z',
        },
      });
    });

    expect(onPatchMock).toHaveBeenCalledWith('estimate', 'est-1', {
      title: 'New estimate · EST-000045',
      body: '₹12,345',
    });
    expect(onNewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'est-1_new_estimate',
        kind: 'new_estimate',
        title: 'New estimate · EST-000045',
      }),
    );
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['tenant-estimates'] });
  });

  it('invalidates order landing keys when order_number becomes available', () => {
    const { result, unmount } = renderHook(() =>
      useSellerRealtime({
        tenantId: 'tenant-1',
        locationIds: null,
        onNew: onNewMock,
      }),
    );

    act(() => {
      orderUpdateCallbacks[0]?.({
        old: { id: 'ord-1', order_number: null },
        new: {
          id: 'ord-1',
          tenant_id: 'tenant-1',
          location_id: 'loc-1',
          order_number: 'SO-000045',
          total_amount: 54321,
          created_at: '2026-07-06T00:00:00.000Z',
        },
      });
    });

    expect(onNewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'new_order',
        entityType: 'order',
        entityId: 'ord-1',
      }),
    );
    expect(result.current.newEntityIds.has('ord-1')).toBe(true);
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['tenant-orders'] });

    unmount();
    expect(removeChannelMock).toHaveBeenCalled();
  });
});
