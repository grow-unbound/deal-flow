import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  invalidateQueriesMock,
  onNewMock,
  onPatchMock,
  removeChannelMock,
  schemaMock,
  fromMock,
  selectMock,
  eqMock,
  maybeSingleMock,
  estimateInsertCallbacks,
  estimateUpdateCallbacks,
  orderInsertCallbacks,
  orderUpdateCallbacks,
  invoiceInsertCallbacks,
  invoiceUpdateCallbacks,
  broadcastUpdateCallbacks,
} = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn(),
  onNewMock: vi.fn(),
  onPatchMock: vi.fn(),
  removeChannelMock: vi.fn(),
  schemaMock: vi.fn(),
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  estimateInsertCallbacks: [] as Array<(payload: { new: Record<string, unknown> }) => void>,
  estimateUpdateCallbacks: [] as Array<(payload: { old: Record<string, unknown>; new: Record<string, unknown> }) => void>,
  orderInsertCallbacks: [] as Array<(payload: { new: Record<string, unknown> }) => void>,
  orderUpdateCallbacks: [] as Array<(payload: { old: Record<string, unknown>; new: Record<string, unknown> }) => void>,
  invoiceInsertCallbacks: [] as Array<(payload: { new: Record<string, unknown> }) => void>,
  invoiceUpdateCallbacks: [] as Array<(payload: { old: Record<string, unknown>; new: Record<string, unknown> }) => void>,
  broadcastUpdateCallbacks: [] as Array<(payload: { new: Record<string, unknown> }) => void>,
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
      } else if (config.table === 'invoices' && config.event === 'UPDATE') {
        invoiceUpdateCallbacks.push(callback as (payload: { old: Record<string, unknown>; new: Record<string, unknown> }) => void);
      } else if (config.table === 'invoices') {
        invoiceInsertCallbacks.push(callback);
      } else if (config.table === 'whatsapp_broadcasts' && config.event === 'UPDATE') {
        broadcastUpdateCallbacks.push(callback);
      }
      return chain;
    }),
    subscribe: vi.fn(() => ({ id: 'channel-1' })),
  };

  return {
    supabaseBrowser: {
      channel: vi.fn(() => chain),
      removeChannel: removeChannelMock,
      schema: schemaMock.mockReturnValue({
        from: fromMock.mockImplementation((table: string) => ({
          select: selectMock.mockImplementation((_fields: string) => ({
            eq: eqMock.mockImplementation((_field: string, id: string) => ({
              maybeSingle: maybeSingleMock.mockImplementation(async () => {
                if (table === 'estimates') {
                  return { data: { estimate_number: id === 'est-link-1' ? 'EST-000123' : null }, error: null };
                }
                if (table === 'orders') {
                  return { data: { order_number: id === 'ord-link-1' ? 'SO-000321' : null }, error: null };
                }
                return { data: null, error: null };
              }),
            })),
          })),
        })),
      }),
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
    invoiceInsertCallbacks.length = 0;
    invoiceUpdateCallbacks.length = 0;
    broadcastUpdateCallbacks.length = 0;
    schemaMock.mockClear();
    fromMock.mockClear();
    selectMock.mockClear();
    eqMock.mockClear();
    maybeSingleMock.mockClear();
  });

  it('skips estimate insert notifications when estimate_number is null', () => {
    renderHook(() =>
      useSellerRealtime({
        tenantId: 'tenant-1',
        locationIds: null,
        locationNamesById: { 'loc-1': 'Mumbai HQ' },
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
        locationNamesById: { 'loc-1': 'Mumbai HQ' },
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
      body: 'Mumbai HQ',
    });
    expect(onNewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'est-1_new_estimate',
        kind: 'new_estimate',
        title: 'New estimate · EST-000045',
        body: 'Mumbai HQ',
      }),
    );
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['tenant-estimates'] });
  });

  it('shows buyer app tag after the location for estimate notifications', () => {
    renderHook(() =>
      useSellerRealtime({
        tenantId: 'tenant-1',
        locationIds: null,
        locationNamesById: { 'loc-1': 'Mumbai HQ' },
        onNew: onNewMock,
      }),
    );

    act(() => {
      estimateInsertCallbacks[0]?.({
        new: {
          id: 'est-2',
          tenant_id: 'tenant-1',
          location_id: 'loc-1',
          estimate_number: 'EST-000046',
          source: 'buyer_app',
          created_at: '2026-07-06T00:00:00.000Z',
        },
      });
    });

    expect(onNewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Mumbai HQ · BUYER APP',
      }),
    );
  });

  it('invalidates order landing keys when order_number becomes available', async () => {
    const { result, unmount } = renderHook(() =>
      useSellerRealtime({
        tenantId: 'tenant-1',
        locationIds: null,
        locationNamesById: { 'loc-1': 'Mumbai HQ' },
        onNew: onNewMock,
      }),
    );

    await act(async () => {
      orderUpdateCallbacks[0]?.({
        old: { id: 'ord-1', order_number: null },
        new: {
          id: 'ord-1',
          tenant_id: 'tenant-1',
          location_id: 'loc-1',
          order_number: 'SO-000045',
          estimate_id: 'est-link-1',
          total_amount: 54321,
          created_at: '2026-07-06T00:00:00.000Z',
        },
      });
      await Promise.resolve();
    });

    expect(onNewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'new_order',
        entityType: 'order',
        entityId: 'ord-1',
        body: 'Mumbai HQ · From EST-000123',
      }),
    );
    expect(result.current.newEntityIds.has('ord-1')).toBe(true);
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['tenant-orders'] });

    unmount();
    expect(removeChannelMock).toHaveBeenCalled();
  });

  it('creates invoice notifications with location first and linked order number', async () => {
    const { result } = renderHook(() =>
      useSellerRealtime({
        tenantId: 'tenant-1',
        locationIds: null,
        locationNamesById: { 'loc-1': 'Mumbai HQ' },
        onNew: onNewMock,
        onPatch: onPatchMock,
      }),
    );

    await act(async () => {
      invoiceInsertCallbacks[0]?.({
        new: {
          id: 'inv-1',
          tenant_id: 'tenant-1',
          location_id: 'loc-1',
          invoice_number: 'INV-000045',
          order_id: 'ord-link-1',
          estimate_id: 'est-link-1',
          created_at: '2026-07-06T00:00:00.000Z',
        },
      });
      await Promise.resolve();
    });

    expect(onNewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'inv-1_new_invoice',
        kind: 'new_invoice',
        entityType: 'invoice',
        entityId: 'inv-1',
        body: 'Mumbai HQ · From SO-000321',
      }),
    );
    expect(result.current.newEntityIds.has('inv-1')).toBe(true);
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['tenant-invoices'] });
  });

  it('falls back to estimate number for invoice notifications when no order exists', async () => {
    renderHook(() =>
      useSellerRealtime({
        tenantId: 'tenant-1',
        locationIds: null,
        locationNamesById: {},
        onNew: onNewMock,
        onPatch: onPatchMock,
      }),
    );

    await act(async () => {
      invoiceUpdateCallbacks[0]?.({
        old: { id: 'inv-2', invoice_number: null },
        new: {
          id: 'inv-2',
          tenant_id: 'tenant-1',
          location_id: null,
          invoice_number: 'INV-000046',
          estimate_id: 'est-link-1',
          created_at: '2026-07-06T00:00:00.000Z',
        },
      });
      await Promise.resolve();
    });

    expect(onPatchMock).toHaveBeenCalledWith('invoice', 'inv-2', {
      title: 'New invoice · INV-000046',
      body: 'Unassigned · From EST-000123',
    });
    expect(onNewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Unassigned · From EST-000123',
      }),
    );
  });

  it('suppresses out-of-scope location notifications', async () => {
    renderHook(() =>
      useSellerRealtime({
        tenantId: 'tenant-1',
        locationIds: ['loc-1'],
        locationNamesById: { 'loc-1': 'Mumbai HQ', 'loc-2': 'Pune Depot' },
        onNew: onNewMock,
      }),
    );

    await act(async () => {
      invoiceInsertCallbacks[0]?.({
        new: {
          id: 'inv-3',
          tenant_id: 'tenant-1',
          location_id: 'loc-2',
          invoice_number: 'INV-000047',
          created_at: '2026-07-06T00:00:00.000Z',
        },
      });
      await Promise.resolve();
    });

    expect(onNewMock).not.toHaveBeenCalled();
  });

  it('invalidates broadcast queries and patches grouped broadcast progress notifications', () => {
    renderHook(() =>
      useSellerRealtime({
        tenantId: 'tenant-1',
        locationIds: null,
        locationNamesById: {},
        onNew: onNewMock,
        onPatch: onPatchMock,
      }),
    );

    act(() => {
      broadcastUpdateCallbacks[0]?.({
        new: {
          id: 'broadcast-1',
          tenant_id: 'tenant-1',
          name: 'July payment reminder',
          status: 'sending',
          actual_recipient_count: 3,
          estimated_recipient_count: 3,
          sent_count: 2,
          delivered_count: 0,
          failed_count: 0,
          updated_at: '2026-07-18T16:45:00.000Z',
        },
      });
    });

    expect(onPatchMock).toHaveBeenCalledWith('broadcast', 'broadcast-1', {
      title: 'Broadcast update · July payment reminder',
      body: '2/3 sent',
    });
    expect(onNewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'broadcast:broadcast-1',
        kind: 'broadcast_updated',
        entityType: 'broadcast',
        body: '2/3 sent',
      }),
    );
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['whatsapp-broadcasts'] });
  });
});
