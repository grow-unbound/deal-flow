import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InsightStrip4 } from '@/components/seller/layout/InsightStrip4';
import { StatusTag } from '@/components/seller/layout/StatusTag';
import { GrowthPill } from '@/components/seller/layout/GrowthPill';
import { PageWrap } from '@/components/seller/layout/PageWrap';
import { PageHeader } from '@/components/seller/layout/PageHeader';

describe('InsightStrip4', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns when tile count is not exactly 4', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(
      <InsightStrip4
        tiles={[
          { label: 'A', value: '1' },
          { label: 'B', value: '2' },
          { label: 'C', value: '3' },
        ]}
      />
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('InsightStrip4 expects exactly 4 tiles; received 3.');
  });
});

describe('StatusTag', () => {
  it('renders tone-specific classes', () => {
    const { rerender } = render(<StatusTag label="Live" tone="success" />);
    expect(screen.getByText('Live')).toHaveClass('bg-success-50', 'text-success-700');

    rerender(<StatusTag label="Live" tone="warning" />);
    expect(screen.getByText('Live')).toHaveClass('bg-warning-50', 'text-warning-700');

    rerender(<StatusTag label="Live" tone="danger" />);
    expect(screen.getByText('Live')).toHaveClass('bg-danger-50', 'text-danger-700');

    rerender(<StatusTag label="Live" tone="neutral" />);
    expect(screen.getByText('Live')).toHaveClass('bg-cream-200', 'text-cream-700');
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
  it('renders period options and calls on change', async () => {
    const onPeriodChange = vi.fn();

    render(
      <PageHeader
        eyebrow="Portfolio"
        title="Brands"
        subtitle="Summary"
        horizon="This Month"
        period="month"
        periodOptions={[
          { value: 'month', label: 'This Month' },
          { value: 'quarter', label: 'This Quarter' },
          { value: 'year', label: 'This Year' },
        ]}
        onPeriodChange={onPeriodChange}
        secondary={{ label: 'Secondary', icon: <span>+</span> }}
        primary="Primary"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /showing.*this month/i }));
    fireEvent.click(await screen.findByText('This Quarter'));

    expect(onPeriodChange).toHaveBeenCalledWith('quarter');
  });
});

