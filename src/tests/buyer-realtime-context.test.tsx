import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastInfoMock = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    info: (...args: unknown[]) => toastInfoMock(...args),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    currentTenantId: 'tenant-1',
    currentBuyerId: 'buyer-1',
  }),
}));

vi.mock('@/hooks/useBuyerRealtime', async () => {
  const ReactModule = await import('react');
  return {
    useBuyerRealtime: ({
      onNew,
      onPatch,
    }: {
      onNew: (notification: any) => void;
      onPatch?: (entityType: string, entityId: string, patch: { title: string; body: string }) => void;
    }) => {
      ReactModule.useEffect(() => {
        const notification = {
          id: 'estimate-1_estimate_updated',
          kind: 'estimate_updated',
          title: 'Estimate updated · EST-001',
          body: 'Status: draft',
          entityType: 'estimate',
          entityId: 'estimate-1',
          href: '/buy/orders?tab=enquiries&highlight=estimate-1',
          readAt: null,
          createdAt: '2026-07-20T10:00:00.000Z',
        };
        onNew(notification);
        onPatch?.('estimate', 'estimate-1', {
          title: 'Estimate updated · EST-001',
          body: 'Status: sent',
        });
        onNew({
          ...notification,
          title: 'Estimate updated · EST-001',
          body: 'Status: sent',
        });
      }, [onNew]);

      return {
        updatedEntityIds: new Map(),
        markSeen: vi.fn(),
      };
    },
  };
});

import { BuyerRealtimeProvider, useBuyerRealtimeContext } from '@/contexts/BuyerRealtimeContext';

function Probe() {
  const { notifications } = useBuyerRealtimeContext();
  return <div>{notifications.length}</div>;
}

describe('BuyerRealtimeProvider', () => {
  beforeEach(() => {
    toastInfoMock.mockReset();
    globalThis.localStorage?.clear?.();
  });

  it('shows only one toast when the same estimate notification is updated twice', async () => {
    render(
      <BuyerRealtimeProvider>
        <Probe />
      </BuyerRealtimeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    expect(toastInfoMock).toHaveBeenCalledTimes(1);
    expect(toastInfoMock).toHaveBeenCalledWith(
      'Estimate updated · EST-001',
      expect.objectContaining({
        description: 'Status: draft',
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });
});
