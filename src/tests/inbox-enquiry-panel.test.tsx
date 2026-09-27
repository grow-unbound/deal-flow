import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const substituteMutateAsync = vi.fn().mockResolvedValue({});

vi.mock('@/hooks/useInboxEntries', () => ({
  useEnquiryTriage: () => ({
    data: {
      estimateId: 'est-1',
      estimateNumber: 'EST-016127',
      status: 'sent',
      hiddenPricing: false,
      totalAmount: 5000,
      notes: 'Please ship by Friday',
      lines: [
        {
          id: 'l1', tenantProductId: 'p1', name: 'CAT6 Cable', sku: 'SKU-1', brandName: 'Brand A',
          qty: 10, unitPrice: 500, targetMin: null, targetMax: null, buyerNote: 'urgent for install',
          onHand: 2, stock: { tone: 'danger', label: 'Out of stock', shortBy: 10 }, priceState: 'priced_oos',
          velocity: { unitsPerWeek: 3, daysCover: 12, lastInvoiceAt: null },
          alternates: [
            {
              tenantProductId: 'alt-1', name: 'CAT6 Cable (Brand B)', sku: 'SKU-2', brandName: 'Brand B',
              available: 40, velocity: { unitsPerWeek: 5, daysCover: 8, lastInvoiceAt: null },
              sameBrand: false, sameCategory: true, buyerPrice: 480,
            },
          ],
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
  useSubstituteEnquiryLine: () => ({ mutateAsync: substituteMutateAsync, isPending: false }),
}));

vi.mock('@/hooks/useEstimates', () => ({
  useEstimateComposer: () => ({
    data: { items: [{ id: 'l1', image_url: null }], subtotal: 5000, tax_amount: 900, total_amount: 5900, seller_note: 'Ships Friday' },
  }),
}));

import { InboxEnquiryPanel } from '@/components/seller/inbox/InboxEnquiryPanel';

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InboxEnquiryPanel entryId="e1" />
    </QueryClientProvider>,
  );
}

describe('InboxEnquiryPanel', () => {
  it('shows read-only buyer quantity, the seller draft quote, totals and the seller note', () => {
    renderPanel();
    expect(screen.getByText('Buyer quantity')).toBeInTheDocument();
    expect(screen.getByText('Your quote')).toBeInTheDocument();
    expect(screen.getByText('₹500')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('₹5,900')).toBeInTheDocument();
    expect(screen.getByText('Ships Friday')).toBeInTheDocument();
  });

  it('drops the estimate-number/total header row and the estimate-level buyer note', () => {
    renderPanel();
    expect(screen.queryByText('EST-016127')).not.toBeInTheDocument();
    expect(screen.queryByText(/Please ship by Friday/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Open full enquiry/)).not.toBeInTheDocument();
  });

  it('keeps the per-line buyer note', () => {
    renderPanel();
    expect(screen.getByText('“urgent for install”')).toBeInTheDocument();
  });

  it('shows the alternate’s buyer-resolved price and substitutes inline on click', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('1 alternative'));
    expect(screen.getByText('₹480')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Substitute' }));
    expect(substituteMutateAsync).toHaveBeenCalledWith({ estimateId: 'est-1', lineId: 'l1', tenantProductId: 'alt-1' });
  });
});
