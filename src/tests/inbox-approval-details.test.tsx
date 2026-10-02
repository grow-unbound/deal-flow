import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InboxApprovalDetails } from '@/components/seller/inbox/InboxApprovalDetails';
import type { InboxEntry } from '@/lib/inbox/inbox-types';

const entry = {
  id: 'e1', entry_type: 'business_approval', buyer_phone: '+911111111111', created_at: '2026-09-01T00:00:00Z',
  metadata: { business_name: 'Ramesh Traders', contact_name: 'Ramesh', gstin: '29ABCDE1234F1Z5' },
} as unknown as InboxEntry;

describe('InboxApprovalDetails', () => {
  it('shows submitted onboarding fields as label/value rows and skips empty ones', () => {
    render(<InboxApprovalDetails entry={entry} />);
    expect(screen.getByText('Business name')).toBeInTheDocument();
    expect(screen.getByText('Ramesh Traders')).toBeInTheDocument();
    expect(screen.getByText('GSTIN')).toBeInTheDocument();
    expect(screen.getByText('+911111111111')).toBeInTheDocument();
  });

  it('renders nothing when the entry carries no details', () => {
    const { container } = render(<InboxApprovalDetails entry={{ ...entry, buyer_phone: null, created_at: '', metadata: {} } as unknown as InboxEntry} />);
    expect(container).toBeEmptyDOMElement();
  });
  const baseContext = {
    sales: {
      current: { invoice_value: 120000, invoice_count: 4 },
      previous: { invoice_value: 80000, invoice_count: 1 },
    },
    demand: { kind: 'orders', current: { value: 50000, count: 2 }, previous: { value: 0, count: 0 } },
    dues: {
      receivable_amount: 30000, receivable_invoice_count: 2,
      overdue_amount: 10000, overdue_invoice_count: 1,
      credit_limit: 100000, credit_available: 70000,
    },
    sources: { period: 'summary', dues: 'summary' },
    computed_at: '2026-10-01T10:00:00Z',
  };
  const existingEntry = (ctx: Record<string, unknown>) => ({
    ...entry,
    metadata: { ...entry.metadata, request_kind: 'existing_buyer_access', buyer_context: ctx },
  }) as unknown as InboxEntry;

  it('shows the existing-customer chip with sales, demand and dues as labelled tiles', () => {
    render(<InboxApprovalDetails entry={existingEntry(baseContext)} />);

    expect(screen.getByText('Existing customer')).toBeInTheDocument();
    expect(screen.getByText(/buyer app access is off/i)).toBeInTheDocument();
    expect(screen.getByText('Sales · invoiced')).toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByText('Dues')).toBeInTheDocument();
    // two period tiles per row, value and count on separate lines (never one crammed string)
    expect(screen.getAllByText('This quarter')).toHaveLength(2);
    expect(screen.getAllByText('Last quarter')).toHaveLength(2);
    expect(screen.getByText('₹1,20,000')).toBeInTheDocument();
    expect(screen.getByText('4 invoices')).toBeInTheDocument();
    expect(screen.getByText('₹80,000')).toBeInTheDocument();
    expect(screen.getAllByText('1 invoice').length).toBeGreaterThanOrEqual(1); // last-quarter sales (+ overdue count)
    expect(screen.getByText('₹50,000')).toBeInTheDocument();
    expect(screen.getByText('2 orders')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Credit available')).toBeInTheDocument();
    expect(screen.getByText('Requested')).toBeInTheDocument();
  });

  it('lays tiles out two per row so they stay readable on a phone', () => {
    const { container } = render(<InboxApprovalDetails entry={existingEntry(baseContext)} />);
    const grids = container.querySelectorAll('section .grid');
    expect(grids.length).toBeGreaterThanOrEqual(3);
    grids.forEach((grid) => expect(grid.className).toContain('grid-cols-2'));
  });

  it('labels demand as enquiries for estimate-led tenants and hides it when the tenant has none', () => {
    const { unmount } = render(<InboxApprovalDetails entry={existingEntry({ ...baseContext, demand: { ...baseContext.demand, kind: 'estimates' } })} />);
    expect(screen.getByText('Enquiries')).toBeInTheDocument();
    unmount();
    render(<InboxApprovalDetails entry={existingEntry({ ...baseContext, demand: { ...baseContext.demand, kind: 'none' } })} />);
    expect(screen.queryByText('Enquiries')).toBeNull();
    expect(screen.queryByText('Orders')).toBeNull();
  });

  it('says when figures are live rather than from the metrics summary', () => {
    const { unmount } = render(<InboxApprovalDetails entry={existingEntry({ ...baseContext, sources: { period: 'live', dues: 'live' }, computed_at: null })} />);
    expect(screen.getByText(/live figures/i)).toBeInTheDocument();
    unmount();
    render(<InboxApprovalDetails entry={existingEntry({ ...baseContext, sources: { period: 'live', dues: 'summary' } })} />);
    expect(screen.getByText(/sales and demand are live/i)).toBeInTheDocument();
  });

  it('omits credit tiles when the buyer has no credit limit and marks overdue as a warning only when owed', () => {
    render(<InboxApprovalDetails entry={existingEntry({ ...baseContext, dues: { ...baseContext.dues, overdue_amount: 0, overdue_invoice_count: 0, credit_limit: 0, credit_available: null } })} />);
    expect(screen.queryByText('Credit limit')).toBeNull();
    expect(screen.queryByText('Credit available')).toBeNull();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('does not show the existing-customer panel for an ordinary approval entry', () => {
    render(<InboxApprovalDetails entry={entry} />);
    expect(screen.queryByText(/existing customer/i)).toBeNull();
  });
});
