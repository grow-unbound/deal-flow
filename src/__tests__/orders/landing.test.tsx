import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const pushMock = vi.fn();
const useTenantOrdersMock = vi.fn();
const useSyncToTallyMock = vi.fn();
const useFlagMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/hooks/useOrders', () => ({
  useTenantOrders: () => useTenantOrdersMock(),
  useSyncToTally: () => useSyncToTallyMock(),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlag: (...args: unknown[]) => useFlagMock(...args),
}));

import OrdersPage from '../../../app/(seller)/orders/page';

function mockOrdersData() {
  return {
    period: {
      timezone: 'Asia/Kolkata',
      current_month_start: '2026-05-01',
      current_month_end_exclusive: '2026-06-01',
      previous_mtd_start: '2026-04-01',
      previous_mtd_end_exclusive: '2026-04-30',
    },
    kpis: {
      orders_mtd: 4,
      orders_prev_mtd: 2,
      orders_growth_pct: 100,
      gmv_mtd: 100000,
      gmv_prev_mtd: 50000,
      aov: 25000,
      pending_dispatch_count: 1,
      on_hold_count: 1,
      delivered_count: 1,
      buyers_mtd: 3,
    },
    todays_read: {
      needs_attention: [],
      biggest_tickets: [],
      in_motion: [],
    },
    orders: [
      {
        id: 'o-new',
        order_id: 'DF-NEW',
        buyer_id: 'b1',
        buyer_name: 'Buyer One',
        buyer_initials: 'BO',
        buyer_hue: 'teal',
        delivery_city: 'Bengaluru',
        delivery_label: 'Bengaluru',
        items_count: 1,
        gmv: 22000,
        status: { value: 'received', label: 'On hold', tone: 'danger', filter_chip: 'Hold' },
        placed_at: '2026-05-29T11:00:00.000Z',
      },
      {
        id: 'o-old',
        order_id: 'DF-OLD',
        buyer_id: 'b2',
        buyer_name: 'Buyer Two',
        buyer_initials: 'BT',
        buyer_hue: 'ember',
        delivery_city: 'Mysuru',
        delivery_label: 'Mysuru',
        items_count: 3,
        gmv: 45000,
        status: { value: 'confirmed', label: 'Confirmed', tone: 'warning', filter_chip: 'Confirmed' },
        placed_at: '2026-05-02T11:00:00.000Z',
      },
    ],
  };
}

describe('orders landing page', () => {
  beforeEach(() => {
    pushMock.mockReset();
    useTenantOrdersMock.mockReset();
    useSyncToTallyMock.mockReset();
    useFlagMock.mockReset();

    useFlagMock.mockReturnValue(true);
    useSyncToTallyMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useTenantOrdersMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: mockOrdersData(),
    });
  });

  it('renders KPI numbers including AOV and pending dispatch', () => {
    render(<OrdersPage />);

    expect(screen.getByText('Pending dispatch')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('AOV ₹25,000')).toBeInTheDocument();
  });

  it('Hold chip filters to on_hold mapped rows only', () => {
    render(<OrdersPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Hold' }));

    expect(screen.getByText('DF-NEW')).toBeInTheDocument();
    expect(screen.queryByText('DF-OLD')).not.toBeInTheDocument();
  });

  it('default sort is recent first and row click navigates to /orders/{id}', () => {
    render(<OrdersPage />);

    const orderNodes = screen.getAllByText(/DF-/);
    expect(orderNodes[0].textContent).toBe('DF-NEW');

    fireEvent.click(screen.getByText('DF-NEW'));
    expect(pushMock).toHaveBeenCalledWith('/orders/o-new');
  });

  it('renders flag-off empty state and does not fetch data when disabled', () => {
    useFlagMock.mockReturnValue(false);

    render(<OrdersPage />);

    expect(screen.getByText("This feature isn't enabled yet.")).toBeInTheDocument();
    expect(useTenantOrdersMock).not.toHaveBeenCalled();
  });
});
