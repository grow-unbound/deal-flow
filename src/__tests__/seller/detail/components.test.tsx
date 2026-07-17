import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetaStrip4 } from '@/components/seller/detail/MetaStrip4';
import { MetricGrid } from '@/components/seller/detail/MetricGrid';
import { DetailTabs } from '@/components/seller/detail/DetailTabs';
import { DetailHeader } from '@/components/seller/detail/DetailHeader';
import { DetailActions } from '@/components/seller/detail/DetailActions';
import { PerformanceCard } from '@/components/seller/detail/PerformanceCard';
import { TrendFrame } from '@/components/seller/detail/TrendFrame';
import { RankedList } from '@/components/seller/detail/RankedList';
import { DistributionList } from '@/components/seller/detail/DistributionList';
import { CardEmptyState } from '@/components/seller/detail/CardEmptyState';
import { DetailCardRenderer } from '@/components/seller/detail/DetailCardRenderer';
import { PageWrap } from '@/components/seller/layout/PageWrap';

describe('MetaStrip4', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('supports fewer than four quiet metric cards without warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(
      <MetaStrip4
        tiles={[
          { label: 'A', value: '1' },
          { label: 'B', value: '2' },
          { label: 'C', value: '3' },
        ]}
      />
    );

    expect(warnSpy).not.toHaveBeenCalled();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('hides supporting copy by default', () => {
    render(<MetaStrip4 tiles={[{ label: 'Revenue', value: '₹1.2L', sub: 'up 12% vs last month' }]} />);

    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('₹1.2L')).toBeInTheDocument();
    expect(screen.queryByText('up 12% vs last month')).not.toBeInTheDocument();
  });
});

describe('MetricGrid', () => {
  it('supports 1/2/3/4 card states through one adaptive primitive', () => {
    const { rerender } = render(<MetricGrid tiles={[{ label: 'One', value: '1' }]} />);
    expect(screen.getByText('One').closest('section')).toHaveClass('grid-cols-1');

    rerender(<MetricGrid tiles={[{ label: 'One', value: '1' }, { label: 'Two', value: '2' }]} />);
    expect(screen.getByText('One').closest('section')).toHaveClass('md:grid-cols-2');

    rerender(<MetricGrid tiles={[{ label: 'One', value: '1' }, { label: 'Two', value: '2' }, { label: 'Three', value: '3' }]} />);
    expect(screen.getByText('One').closest('section')).toHaveClass('xl:grid-cols-3');

    rerender(<MetricGrid tiles={[{ label: 'One', value: '1' }, { label: 'Two', value: '2' }, { label: 'Three', value: '3' }, { label: 'Four', value: '4' }]} />);
    expect(screen.getByText('One').closest('section')).toHaveClass('xl:grid-cols-4');
  });
});

describe('DetailTabs', () => {
  it('uses tab semantics and R12 active styling', () => {
    render(
      <DetailTabs
        tabs={[
          { id: 'details', label: 'Details' },
          { id: 'performance', label: 'Performance', badge: 4 },
        ]}
        active="performance"
      />
    );

    const activeTab = screen.getByRole('tab', { name: /Performance/i });
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(activeTab).toHaveAttribute('aria-selected', 'true');
    expect(activeTab).toHaveClass('border-b-2', 'border-ember-500', 'text-cream-950');
  });
});

describe('DetailHeader', () => {
  it('styles the last crumb as current with font-medium', () => {
    render(
      <DetailHeader
        crumbPath={[
          { label: 'Brands', href: '/brands' },
          { label: 'WineYard Vintners', current: true },
        ]}
        avatar={{ kind: 'customer', initials: 'WV', hue: 'ember' }}
        title="WineYard Vintners"
        status={{ label: 'Live', tone: 'success' }}
        subtitle={['Wine', 'Maharashtra']}
        actions={<DetailActions />}
      />
    );

    expect(screen.getAllByText('WineYard Vintners')[0]).toHaveClass('font-medium');
  });
});

describe('PerformanceCard', () => {
  it('uses the shared dashboard-style card header and body chrome', () => {
    render(
      <PerformanceCard title="Brand performance" subtitle="Revenue share for the selected period" actions={<button type="button">All brands</button>}>
        <div>Body</div>
      </PerformanceCard>
    );

    expect(screen.getByText('Brand performance')).toHaveClass('font-display', 'text-md');
    expect(screen.getByText('Revenue share for the selected period')).toHaveClass('text-sm');
    expect(screen.getByRole('button', { name: 'All brands' })).toBeInTheDocument();
    expect(screen.getByText('Body').closest('section')).toHaveClass('overflow-hidden', 'rounded-[14px]', 'border');
  });
});

describe('Shared detail body components', () => {
  it('renders TrendFrame empty state when no chart is provided', () => {
    render(<TrendFrame emptyTitle="No history" emptyDescription="Nothing to chart yet." />);

    expect(screen.getByText('No history')).toBeInTheDocument();
    expect(screen.getByText('Nothing to chart yet.')).toBeInTheDocument();
  });

  it('renders RankedList items through one shared primitive', () => {
    render(
      <RankedList
        items={[
          { id: '1', label: 'Buyer One', meta: 'Mumbai', value: '₹12K', supporting: '3 orders', initials: 'BO' },
        ]}
        emptyTitle="No rows"
      />
    );

    expect(screen.getByText('Buyer One')).toBeInTheDocument();
    expect(screen.getByText('3 orders')).toBeInTheDocument();
  });

  it('renders DistributionList as a shared mix/distribution primitive', () => {
    render(
      <DistributionList
        mode="mix"
        items={[
          { id: 'brand-a', label: 'Brand A', pct: 60, value: '₹24K' },
          { id: 'brand-b', label: 'Brand B', pct: 40, value: '₹16K' },
        ]}
        emptyTitle="No mix"
      />
    );

    expect(screen.getByText('Brand A')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('renders CardEmptyState for unavailable cards without coercing to zero', () => {
    render(<CardEmptyState title="Unavailable" description="Payment behavior is unavailable." tone="unavailable" />);

    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText('Payment behavior is unavailable.')).toBeInTheDocument();
  });

  it('renders a normalized detail card through the shared renderer', () => {
    render(
      <DetailCardRenderer
        card={{
          id: 'price-distribution',
          representation: 'distribution',
          title: 'Actual selling prices',
          subtitle: 'Current distribution',
          body: {
            items: [
              { id: 'base', label: 'Base price', value: '₹100', pct: 70 },
              { id: 'override', label: 'Override', value: '₹92', pct: 30 },
            ],
            emptyTitle: 'No prices',
          },
        }}
      />
    );

    expect(screen.getByText('Actual selling prices')).toBeInTheDocument();
    expect(screen.getByText('Override')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
  });
});

describe('PageWrap reuse', () => {
  it('uses existing PageWrap and does not re-implement a 1920 container in detail components', () => {
    const { container } = render(
      <PageWrap>
        <div>Detail Body</div>
      </PageWrap>
    );
    expect(container.firstChild).toHaveClass('max-w-[1920px]', 'mx-auto');

    const detailDir = path.resolve(process.cwd(), 'src/components/seller/detail');
    const files = ['DetailHeader.tsx', 'MetaStrip4.tsx', 'DetailTabs.tsx', 'DetailActions.tsx'];
    for (const file of files) {
      const content = fs.readFileSync(path.join(detailDir, file), 'utf8');
      expect(content.includes('max-w-[1920px]')).toBe(false);
    }
  });
});
