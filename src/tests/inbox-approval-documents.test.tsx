import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiFetchMock = vi.fn();

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  apiPost: vi.fn(),
}));

import { InboxApprovalDocuments } from '@/components/seller/inbox/InboxApprovalDocuments';

function renderDocs(entryId = 'e1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <InboxApprovalDocuments entryId={entryId} />
    </QueryClientProvider>,
  );
}

describe('InboxApprovalDocuments', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('renders a thumbnail per document without ever fetching a signed URL up front', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        documents: [
          { id: 'd1', doc_type: 'shop_image', subject_scope: 'personal', uploaded_at: '2026-09-01T00:00:00Z', verified: false },
          { id: 'd2', doc_type: 'gst_certificate', subject_scope: 'business', uploaded_at: '2026-09-01T00:00:00Z', verified: true },
        ],
      }),
    });

    renderDocs();

    await waitFor(() => expect(screen.getByText('Shop image')).toBeInTheDocument());
    expect(screen.getByText('GST certificate')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    // Only the list call happened -- no signed-url fetch until a thumbnail is clicked.
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).toHaveBeenCalledWith('/api/tenant/entries/e1/documents', expect.anything());
  });

  it('fetches a fresh signed URL only when a thumbnail is opened', async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        documents: [{ id: 'd1', doc_type: 'shop_image', subject_scope: 'personal', uploaded_at: '2026-09-01T00:00:00Z', verified: false }],
      }),
    });
    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: 'https://r2.example/signed', doc_type: 'shop_image' }),
    });

    renderDocs();
    await waitFor(() => expect(screen.getByText('Shop image')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Shop image'));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith('/api/tenant/entries/e1/documents/d1/signed-url', expect.anything()),
    );
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'https://r2.example/signed'));
  });

  it('renders nothing when there are no documents', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({ documents: [] }) });

    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <InboxApprovalDocuments entryId="e1" />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
