import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

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

  it('shows cohort member counts in edit mode when paginated buyers do not include selected members', async () => {
    useCohortDetailMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        details_rules: {
          name: 'South dealers',
          description: 'Manual cohort',
          is_static: true,
          allowed_tenant_brand_ids: [],
          rules: { filters: [] },
        },
        buyers: [
          {
            buyer_id: 'buyer-99',
            business_name: 'Coastal Traders',
            contact_name: 'Anita',
            external_ref: 'B-099',
            geography_label: 'Chennai, Tamil Nadu',
            tier: 'A',
            mtd_spend: 120000,
            orders_mtd: 4,
            aov: 30000,
            credit_used: 10000,
            last_order_at: '2026-06-10T00:00:00.000Z',
            initials: 'CT',
            hue: 'teal',
          },
          {
            buyer_id: 'buyer-100',
            business_name: 'Harbor Retail',
            contact_name: 'Vikram',
            external_ref: 'B-100',
            geography_label: 'Madurai, Tamil Nadu',
            tier: 'B',
            mtd_spend: 80000,
            orders_mtd: 2,
            aov: 40000,
            credit_used: 5000,
            last_order_at: '2026-06-08T00:00:00.000Z',
            initials: 'HR',
            hue: 'ember',
          },
        ],
      },
    });
    useCohortMembersMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        members: [
          { buyer_id: 'buyer-99', buyers: { id: 'buyer-99', business_name: 'Coastal Traders', tier: 'A', is_active: true } },
          { buyer_id: 'buyer-100', buyers: { id: 'buyer-100', business_name: 'Harbor Retail', tier: 'B', is_active: true } },
        ],
      },
    });
    useCohortComposerBuyersMock.mockReturnValue({
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      data: {
        pages: [
          {
            total: 1,
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
          },
        ],
      },
    });

    render(<CohortComposer mode="edit" cohortId="cohort-1" />);

    await screen.findByText('Customer group profile');
    const membersRow = screen.getAllByText('Members').find((element) => element.classList.contains('text-cream-700'));
    expect(membersRow?.parentElement).toHaveTextContent('2');
    expect(screen.getByText('Areas covered').parentElement).toHaveTextContent('2');

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText('2 buyers across 2 areas will be in this cohort once you confirm.'),
    ).toBeInTheDocument();
  });
});
