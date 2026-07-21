import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InsightStrip4 } from '@/components/seller/layout/InsightStrip4';
import { V3CalloutPanel } from '@/components/seller/layout/V3CalloutPanel';
import { StatusTag } from '@/components/seller/layout/StatusTag';
import { GrowthPill } from '@/components/seller/layout/GrowthPill';
import { PageWrap } from '@/components/seller/layout/PageWrap';
import { PageHeader } from '@/components/seller/layout/PageHeader';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe('InsightStrip4', () => {
  it('supports operational layouts with fewer than four tiles', () => {
    render(
      <InsightStrip4
        tiles={[
          { label: 'A', value: '1' },
          { label: 'B', value: '2' },
          { label: 'C', value: '3' },
        ]}
      />
    );

    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('hides supporting copy by default', () => {
    const { rerender } = render(
      <InsightStrip4 showSupportingText={false} tiles={[{ label: 'Revenue', value: '₹5L', sub: '12% vs last period' }]} />
    );

    expect(screen.queryByText('12% vs last period')).not.toBeInTheDocument();

    rerender(<InsightStrip4 tiles={[{ label: 'Revenue', value: '₹5L', sub: '12% vs last period' }]} />);
    expect(screen.getByText('12% vs last period')).toBeInTheDocument();
  });
});

describe('V3CalloutPanel', () => {
  it('renders collapsed rows with name, reason, and trailing status', () => {
    const { container } = render(
      <V3CalloutPanel
        items={[
          {
            id: 'needs_attention',
            kind: 'risk',
            eyebrow: 'Needs attention',
            hint: '1',
            rows: [
              {
                initials: 'AB',
                hue: 'teal',
                name: 'Asha Buyers',
                reason: 'Last order was 45 days ago',
                trailing: '₹42K',
              },
            ],
          },
        ]}
      />
    );

    expect(screen.getByText('Asha Buyers')).toBeInTheDocument();
    expect(screen.getByText('₹42K')).toBeInTheDocument();
    expect(screen.getByText('Last order was 45 days ago')).toBeInTheDocument();
    expect(container.querySelector('div.space-y-\\[10px\\] > div')).toHaveClass('w-full', 'px-2', 'py-1');
  });

  it('re-fetches sheet rows on reopen instead of reusing stale loaded rows', async () => {
    const loadRows = vi.fn()
      .mockResolvedValueOnce([
        { id: 'buyer-1', initials: 'UB', hue: 'teal', name: 'Unknown buyer', reason: '1 invoice', trailing: '₹10K' },
      ])
      .mockResolvedValueOnce([
        { id: 'buyer-1', initials: 'GS', hue: 'teal', name: 'Ghost Stores', reason: '1 invoice', trailing: '₹10K' },
      ]);

    render(
      <V3CalloutPanel
        items={[
          {
            id: 'collections',
            kind: 'risk',
            eyebrow: 'Collections',
            hint: '1',
            loadRows,
            rows: [
              {
                id: 'buyer-1',
                initials: 'GS',
                hue: 'teal',
                name: 'Ghost Stores',
                reason: '1 invoice',
                trailing: '₹10K',
              },
            ],
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open full Collections list' }));
    await screen.findByText('Unknown buyer');
    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Open full Collections list' }));
    await waitFor(() => expect(screen.getByText('Ghost Stores')).toBeInTheDocument());
    expect(loadRows).toHaveBeenCalledTimes(2);
  });
});

describe('StatusTag', () => {
  it('renders tone-specific classes', () => {
    const { rerender } = render(<StatusTag label="Live" tone="success" />);
    expect(screen.getByText('Live').parentElement).toHaveClass('bg-success-50', 'text-success-700');

    rerender(<StatusTag label="Live" tone="warning" />);
    expect(screen.getByText('Live').parentElement).toHaveClass('bg-warning-50', 'text-warning-700');

    rerender(<StatusTag label="Live" tone="danger" />);
    expect(screen.getByText('Live').parentElement).toHaveClass('bg-danger-50', 'text-danger-700');

    rerender(<StatusTag label="Live" tone="neutral" />);
    expect(screen.getByText('Live').parentElement).toHaveClass('bg-cream-100', 'text-cream-700');
  });
});

describe('GrowthPill', () => {
  it('renders up, down, and flat variants', () => {
    const { rerender } = render(<GrowthPill value={12} />);
    expect(screen.getByText('↑ +12%')).toBeInTheDocument();

    rerender(<GrowthPill value={-7} />);
    expect(screen.getByText('↓ 7%')).toBeInTheDocument();

    rerender(<GrowthPill value={0} />);
    expect(screen.getByText('· flat')).toBeInTheDocument();
  });
});

describe('PageWrap', () => {
  it('renders with 1920 max width and centered layout classes', () => {
    const { container } = render(
      <PageWrap>
        <div>Child</div>
      </PageWrap>
    );

    expect(container.firstChild).toHaveClass('max-w-[1920px]', 'mx-auto', 'w-full', 'px-8', 'py-6');
  });
});

describe('PageHeader', () => {
  it('does not render a period selector in the header', () => {
    render(
      <PageHeader
        eyebrow="Portfolio"
        title="Brands"
        subtitle="Summary"
        horizon="This Month"
        secondary={{ label: 'Secondary', icon: <span>+</span> }}
        primary="Primary"
      />,
    );

    expect(screen.queryByText('Showing')).not.toBeInTheDocument();
  });
});
