import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const useResolvedPriceMock = vi.fn();

vi.mock('@/hooks/useResolvedPrice', () => ({
  useResolvedPrice: (...args: unknown[]) => useResolvedPriceMock(...args),
}));

import { ResolvedPriceLookupCard } from '@/components/seller/pricing/ResolvedPriceLookupCard';

describe('ResolvedPriceLookupCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useResolvedPriceMock.mockReturnValue({
      data: { price: 950 },
      isLoading: false,
    });
  });

  it('calls resolve_price with the selected buyer, product, and qty', () => {
    render(
      <ResolvedPriceLookupCard
        buyerId="buyer-1"
        productOptions={[
          { id: 'tp-1', label: 'Cabernet Reserve', meta: 'SKU-1' },
          { id: 'tp-2', label: 'Merlot Classic', meta: 'SKU-2' },
        ]}
      />,
    );

    expect(useResolvedPriceMock).toHaveBeenCalledWith('tp-1', 'buyer-1', 1);

    const qtyInput = screen.getByDisplayValue('1');
    fireEvent.change(qtyInput, { target: { value: '3' } });

    expect(useResolvedPriceMock).toHaveBeenLastCalledWith('tp-1', 'buyer-1', 3);
  });
});
