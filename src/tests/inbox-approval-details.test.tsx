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
});
