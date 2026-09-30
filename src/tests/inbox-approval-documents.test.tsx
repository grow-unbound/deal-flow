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

  const DOCS = {
    documents: [
      { id: 'd1', doc_type: 'shop_image', subject_scope: 'personal', uploaded_at: '2026-09-01T00:00:00Z', verified: false },
      { id: 'd2', doc_type: 'gst_certificate', subject_scope: 'business', uploaded_at: '2026-09-01T00:00:00Z', verified: true },
    ],
  };

  function mockApi() {
    apiFetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/signed-url')) return { ok: true, json: async () => ({ url: 'https://r2.example/signed', doc_type: 'shop_image' }) };
      return { ok: true, json: async () => DOCS };
    });
  }

  it('previews the shop image inline and keeps other documents as click-to-open tiles', async () => {
    mockApi();
    renderDocs();

    await waitFor(() => expect(screen.getByRole('img', { name: 'Shop image' })).toHaveAttribute('src', 'https://r2.example/signed'));
    expect(screen.getByText('GST certificate')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledWith('/api/tenant/entries/e1/documents/d1/signed-url', expect.anything());
    // The GST certificate is never fetched until opened.
    expect(apiFetchMock).not.toHaveBeenCalledWith('/api/tenant/entries/e1/documents/d2/signed-url', expect.anything());
  });

  it('opens the full-size dialog with a freshly minted signed URL', async () => {
    mockApi();
    renderDocs();
    await waitFor(() => expect(screen.getByRole('img', { name: 'Shop image' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Open shop image' }));

    await waitFor(() => expect(screen.getAllByRole('img', { name: 'Shop image', hidden: true })).toHaveLength(2));
    const signedCalls = apiFetchMock.mock.calls.filter(([url]) => String(url).endsWith('/d1/signed-url'));
    expect(signedCalls.length).toBeGreaterThanOrEqual(2);
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
