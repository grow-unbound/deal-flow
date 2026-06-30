import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const useRouterMock = vi.fn();
const useCartMock = vi.fn();
const useBuyerDeliveryOptionalMock = vi.fn();
const apiFetchMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => useRouterMock(),
}));

vi.mock('@/contexts/BuyerCartContext', () => ({
  useCart: (...args: unknown[]) => useCartMock(...args),
}));

vi.mock('@/contexts/BuyerDeliveryContext', () => ({
  useBuyerDeliveryOptional: (...args: unknown[]) => useBuyerDeliveryOptionalMock(...args),
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

describe('buyer cart location details', () => {
  it('reuses the compact selected location label in cart details', async () => {
    useRouterMock.mockReturnValue({ back: vi.fn(), push: vi.fn(), replace: vi.fn() });
    useCartMock.mockReturnValue({
      items: [
        {
          tenant_product_id: 'tp-1',
          name: 'Camera',
          quantity: 1,
          line_total: 5000,
          unit_price: 5000,
        },
      ],
      itemCount: 1,
      subtotal: 5000,
      removeItem: vi.fn(),
      updateQty: vi.fn(),
      clearCart: vi.fn(),
    });
    useBuyerDeliveryOptionalMock.mockReturnValue({
      selected: {
        place_id: 'place-1',
        label: 'Andheri West',
        formatted_address: 'Andheri West, Mumbai, Maharashtra',
        city: 'Mumbai',
        pincode: '400058',
        lat: 19.12,
        lng: 72.84,
      },
    });
    apiFetchMock.mockResolvedValue({
      json: async () => ({ location_id: 'loc-1', name: 'Mumbai Warehouse', distance_km: 4, fallback: false }),
    });

    const { default: CartPage } = await import('../../app/(buyer)/buy/cart/page');
    render(<CartPage />);

    expect(screen.getByText('Andheri West')).toBeInTheDocument();
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
  });
});
