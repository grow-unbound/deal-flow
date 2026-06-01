import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetaStrip4 } from '@/components/seller/detail/MetaStrip4';
import { DetailTabs } from '@/components/seller/detail/DetailTabs';
import { DetailHeader } from '@/components/seller/detail/DetailHeader';
import { DetailActions } from '@/components/seller/detail/DetailActions';
import { PageWrap } from '@/components/seller/layout/PageWrap';

describe('MetaStrip4', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns when tile count is not exactly 4', () => {
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

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('MetaStrip4 expects exactly 4 tiles; received 3.');
  });
});

describe('DetailTabs', () => {
  it('applies active tab border and text classes', () => {
    render(
      <DetailTabs
        tabs={[
          { id: 'details', label: 'Details' },
          { id: 'performance', label: 'Performance', badge: 4 },
        ]}
        active="performance"
      />
    );

    const activeTab = screen.getByRole('button', { name: /Performance/i });
    expect(activeTab).toHaveClass('border-b-2', 'border-teal-500', 'text-cream-950');
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
        avatar={{ kind: 'brand', initials: 'WV', hue: 'ember' }}
        title="WineYard Vintners"
        status={{ label: 'Live', tone: 'success' }}
        subtitle={['Wine', 'Maharashtra']}
        actions={<DetailActions />}
      />
    );

    expect(screen.getByText('WineYard Vintners')).toHaveClass('font-medium');
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
