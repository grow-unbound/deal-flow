import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const pushMock = vi.fn();
const useCohortComposerDataMock = vi.fn();
const useCohortComposerBuyersMock = vi.fn();
const useCohortDetailMock = vi.fn();
const useCohortMembersMock = vi.fn();
const useSaveCohortComposerMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/hooks/useCohorts', () => ({
  useCohortComposerData: () => useCohortComposerDataMock(),
  useCohortComposerBuyers: () => useCohortComposerBuyersMock(),
  useCohortDetail: () => useCohortDetailMock(),
  useCohortMembers: () => useCohortMembersMock(),
  useSaveCohortComposer: () => useSaveCohortComposerMock(),
}));

import { CohortComposer } from '@/components/seller/cohorts/CohortComposer';

describe('cohort composer', () => {
  beforeEach(() => {
    pushMock.mockReset();
    useCohortComposerDataMock.mockReset();
    useCohortComposerBuyersMock.mockReset();
    useCohortDetailMock.mockReset();
    useCohortMembersMock.mockReset();
    useSaveCohortComposerMock.mockReset();

    useCohortComposerDataMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        buyers: [
          {
            id: 'buyer-1',
            business_name: 'Bharat Stores',
            contact_name: 'Ravi Bharat',
            external_ref: 'B-001',
            geography_label: 'Delhi, NCR',
            city: 'Delhi',
            state: 'NCR',
            tier: 'A',
            last_order_at: '2026-06-02T00:00:00.000Z',
            mtd_spend: 240000,
            orders_mtd: 6,
            credit_used: 60000,
            payment_terms_days: 21,
            gmv_90d: 480000,
            initials: 'BS',
            hue: 'teal',
          },
        ],
        filters: {
          geographies: [{ value: 'Delhi, NCR', label: 'Delhi, NCR', count: 1 }],
          tiers: [{ value: 'A', label: 'A', count: 1 }],
          last_order_buckets: [{ value: 'within_30_days', label: 'Within 30 days', count: 1 }],
          gmv_90d_buckets: [{ value: 'gmv_200001_500000', label: '₹2L - ₹5L', count: 1 }],
        },
      },
    });

    useCohortDetailMock.mockReturnValue({ isLoading: false, isError: false, data: null });
    useCohortComposerBuyersMock.mockReturnValue({
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      data: {
        pages: [
          {
            buyers: [
              {
                id: 'buyer-1',
                business_name: 'Bharat Stores',
                contact_name: 'Ravi Bharat',
                external_ref: 'B-001',
                geography_label: 'Delhi, NCR',
                city: 'Delhi',
                state: 'NCR',
                tier: 'A',
                last_order_at: '2026-06-02T00:00:00.000Z',
                mtd_spend: 240000,
                orders_mtd: 6,
                credit_used: 60000,
                payment_terms_days: 21,
                gmv_90d: 480000,
                initials: 'BS',
                hue: 'teal',
              },
            ],
            total: 1,
            nextCursor: null,
          },
        ],
      },
    });
    useCohortMembersMock.mockReturnValue({ isLoading: false, isError: false, data: { members: [] } });
    useSaveCohortComposerMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn() });
  });

  it('renders the shared composer shell and buyer table columns', () => {
    render(<CohortComposer mode="create" />);

    expect(screen.getByText('Add a customer group')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Business name')).toBeInTheDocument();
    expect(screen.getAllByText('Geography').length).toBeGreaterThan(0);
    expect(screen.getByText('Last order')).toBeInTheDocument();
    expect(screen.getAllByText('MTD spend').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Credit used').length).toBeGreaterThan(0);
    expect(screen.getByText('Payment terms')).toBeInTheDocument();
  });
});
