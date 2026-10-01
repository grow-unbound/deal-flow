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
  it('shows the existing-customer banner with sales, demand and dues for an access request', () => {
    const existing = {
      ...entry,
      metadata: {
        ...entry.metadata,
        request_kind: 'existing_buyer_access',
        buyer_context: {
          sales: {
            current: { invoice_value: 120000, invoice_count: 4 },
            previous: { invoice_value: 80000, invoice_count: 1 },
          },
          demand: {
            kind: 'orders',
            current: { value: 50000, count: 2 },
            previous: { value: 0, count: 0 },
          },
          dues: {
            receivable_amount: 30000, receivable_invoice_count: 2,
            overdue_amount: 10000, overdue_invoice_count: 1,
            credit_limit: 100000, credit_available: 70000,
          },
          computed_at: '2026-10-01T10:00:00Z',
        },
      },
    } as unknown as InboxEntry;
    render(<InboxApprovalDetails entry={existing} />);

    expect(screen.getByText(/existing customer — buyer app access is disabled/i)).toBeInTheDocument();
    expect(screen.getByText('This quarter')).toBeInTheDocument();
    expect(screen.getByText('Last quarter')).toBeInTheDocument();
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('₹1,20,000 · 4 invoices')).toBeInTheDocument();
    expect(screen.getByText('₹80,000 · 1 invoice')).toBeInTheDocument();
    expect(screen.getByText('₹50,000 · 2 orders')).toBeInTheDocument();
    expect(screen.getByText('Order value')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Requested')).toBeInTheDocument();
  });

  it('labels demand as enquiries for estimate-led tenants and hides it when the tenant has none', () => {
    const base = (kind: string) => ({
      ...entry,
      metadata: {
        request_kind: 'existing_buyer_access',
        buyer_context: {
          sales: { current: { invoice_value: 0, invoice_count: 0 }, previous: { invoice_value: 0, invoice_count: 0 } },
          demand: { kind, current: { value: 0, count: 0 }, previous: { value: 0, count: 0 } },
          dues: { receivable_amount: 0, receivable_invoice_count: 0, overdue_amount: 0, overdue_invoice_count: 0, credit_limit: 0, credit_available: null },
          computed_at: null,
        },
      },
    }) as unknown as InboxEntry;

    const { unmount } = render(<InboxApprovalDetails entry={base('estimates')} />);
    expect(screen.getByText('Enquiry value')).toBeInTheDocument();
    unmount();
    render(<InboxApprovalDetails entry={base('none')} />);
    expect(screen.queryByText('Enquiry value')).toBeNull();
    expect(screen.queryByText('Order value')).toBeNull();
  });

  it('does not show the existing-customer panel for an ordinary approval entry', () => {
    render(<InboxApprovalDetails entry={entry} />);
    expect(screen.queryByText(/existing customer/i)).toBeNull();
  });
});
