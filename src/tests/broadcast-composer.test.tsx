import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useCohorts', () => ({
  useTenantCohortOptions: () => ({
    data: [{ id: 'cohort-1', name: 'Top buyers', description: 'High value', member_count: 12 }],
  }),
}));

vi.mock('@/hooks/useWhatsAppBroadcasts', () => ({
  useWhatsAppTemplates: () => ({
    data: [{
      id: 'tpl-1',
      use_case: 'campaign_announcement',
      meta_category: 'marketing',
      approval_status: 'approved',
      body: 'Hello {{buyer_name}}',
      variables: [{ key: 'buyer_name', description: 'Buyer name' }],
      meta_template_name: 'campaign_announcement',
    }],
    isLoading: false,
    error: null,
  }),
  useBroadcastCampaignOptions: () => ({
    data: [{ id: 'camp-1', name: 'Monsoon launch', share_token: 'monsoon-launch' }],
  }),
  useAudiencePreview: () => ({
    data: null,
    error: null,
    isPending: false,
    mutate: vi.fn(),
    reset: vi.fn(),
  }),
  useCreateWhatsAppBroadcast: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  useWhatsAppPlatformStatus: () => ({
    data: { broadcast_sending_paused: false, quality_rating_state: 'green' },
  }),
}));

vi.mock('@/components/seller/shared/SellerBuyerPickerOverlay', () => ({
  SellerBuyerPickerOverlay: ({ open }: { open: boolean }) => (open ? <div>Buyer picker overlay</div> : null),
}));

import { BroadcastComposerSheet } from '@/components/seller/customers/BroadcastComposerSheet';

describe('BroadcastComposerSheet', () => {
  it('renders the simplified field-based form', () => {
    render(<BroadcastComposerSheet open onOpenChange={vi.fn()} />);

    expect(screen.getByText('Broadcast message')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/july new-stock nudge/i)).toBeInTheDocument();
    expect(screen.getByText('Target buyers')).toBeInTheDocument();
    expect(screen.getByText('Select template')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send broadcast now/i })).toBeInTheDocument();
    expect(screen.queryByText('Broadcast summary')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/nashik/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dormant for more than/i)).not.toBeInTheDocument();
  });

  it('hides the template preview until a template is selected', () => {
    render(<BroadcastComposerSheet open onOpenChange={vi.fn()} />);

    expect(screen.queryByText('Preview')).not.toBeInTheDocument();
    expect(screen.queryByText('Hello {{buyer_name}}')).not.toBeInTheDocument();
  });
});
