import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BuyerMeData } from '@/hooks/useBuyerMe';
import WhatsappConsentPage from '../../app/consent/page';

const apiFetchMock = vi.fn();
const useBuyerMeMock = vi.fn();
const routerReplaceMock = vi.fn();

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('@/hooks/useBuyerMe', () => ({
  useBuyerMe: (...args: unknown[]) => useBuyerMeMock(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: routerReplaceMock,
  }),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <WhatsappConsentPage />
      </QueryClientProvider>,
    ),
  };
}

describe('whatsapp consent page', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    useBuyerMeMock.mockReset();
    routerReplaceMock.mockReset();
  });

  it('refreshes buyer-me with a fresh request after consent succeeds', async () => {
    const initialMe: BuyerMeData = {
      mode: 'buyer',
      buyer_id: 'buyer-1',
      business_name: 'Rajan Wine Merchants',
      contact_name: 'Rajan Mehta',
      phone: '9876543210',
      gstin: null,
      credit_limit: 250000,
      credit_used: 0,
      open_orders_count: 0,
      seller_preview: false,
      support_whatsapp_number: null,
      tenant: { id: 'tenant-1', name: 'Tenant One', slug: 'tenant-one' },
      greeting_name: 'Rajan',
      order_features: {
        enquiries: false,
        sales_orders: true,
        invoices: true,
        create_enquiries: true,
        create_sales_orders: true,
      },
      business_policy: {
        credit_enabled: true,
        gst_inclusive: false,
        gst_rate: 18,
      },
      whatsapp_consent_required: true,
    };

    const refreshedMe: BuyerMeData = {
      ...initialMe,
      whatsapp_consent_required: false,
    };

    useBuyerMeMock.mockReturnValue({
      data: initialMe,
      isLoading: false,
    });

    apiFetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => refreshedMe,
      });

    const { queryClient } = renderPage();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenNthCalledWith(
        1,
        '/api/buyer/whatsapp-consent',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(apiFetchMock).toHaveBeenNthCalledWith(
        2,
        '/api/buyer/me',
        expect.objectContaining({ fresh: true }),
      );
      expect(queryClient.getQueryData(['buyer-me'])).toEqual(refreshedMe);
      expect(routerReplaceMock).toHaveBeenCalledWith('/buy/catalog');
    });
  });
});
