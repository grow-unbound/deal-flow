import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useBuyerRealtimeMock = vi.fn();
const useBuyerMeMock = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'seller-user-1' },
    currentTenantId: 'tenant-1',
    currentBuyerId: null,
  }),
}));

vi.mock('@/hooks/useBuyerMe', () => ({
  useBuyerMe: (...args: unknown[]) => useBuyerMeMock(...args),
}));

vi.mock('@/hooks/useBuyerRealtime', () => ({
  useBuyerRealtime: (...args: unknown[]) => useBuyerRealtimeMock(...args),
}));

import { BuyerRealtimeProvider } from '@/contexts/BuyerRealtimeContext';

describe('BuyerRealtimeProvider preview fallback', () => {
  beforeEach(() => {
    useBuyerMeMock.mockReset();
    useBuyerRealtimeMock.mockReset();

    useBuyerMeMock.mockReturnValue({
      data: {
        mode: 'preview',
        buyer_id: 'buyer-preview-1',
        business_name: 'Preview Buyer',
        contact_name: 'Preview',
        phone: '9999999999',
        gstin: null,
        credit_limit: 0,
        credit_used: 0,
        open_orders_count: 0,
        seller_preview: false,
        support_whatsapp_number: null,
        tenant: { id: 'tenant-1', name: 'Tenant', slug: 'tenant' },
        order_features: {
          enquiries: true,
          sales_orders: true,
          invoices: true,
          create_enquiries: true,
          create_sales_orders: true,
        },
        business_policy: { credit_enabled: true, gst_inclusive: false, gst_rate: 18 },
        whatsapp_consent_required: false,
      },
    });

    useBuyerRealtimeMock.mockReturnValue({
      updatedEntityIds: new Map(),
      markSeen: vi.fn(),
    });
  });

  it('subscribes with buyer id from buyer me when auth context is seller preview', async () => {
    render(
      <BuyerRealtimeProvider>
        <div>child</div>
      </BuyerRealtimeProvider>,
    );

    await waitFor(() => {
      expect(useBuyerRealtimeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          buyerId: 'buyer-preview-1',
        }),
      );
    });
  });
});
