import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  MobileHeaderTitleProvider,
  useMobileHeaderEyebrowValue,
  useMobileHeaderTitle,
  useMobileHeaderTitleValue,
} from '@/components/layout/MobileHeaderTitle';
import { duesHeaderTitle } from '@/components/seller/inbox/InboxCollectionGroupCard';
import type { InboxDetailGroup } from '@/lib/inbox/inbox-detail-groups';

function Screen({ title, eyebrow }: { title: string | null; eyebrow?: string | null }) {
  useMobileHeaderTitle(title, { eyebrow });
  return null;
}

function Bar() {
  const title = useMobileHeaderTitleValue();
  const eyebrow = useMobileHeaderEyebrowValue();
  return <p data-testid="bar">{`${eyebrow ?? '-'}|${title ?? '-'}`}</p>;
}

describe('useMobileHeaderTitle', () => {
  it('publishes the title and the parent-context eyebrow', () => {
    render(
      <MobileHeaderTitleProvider>
        <Screen title="Overdue" eyebrow="Ramesh Traders" />
        <Bar />
      </MobileHeaderTitleProvider>,
    );
    expect(screen.getByTestId('bar')).toHaveTextContent('Ramesh Traders|Overdue');
  });

  it('keeps the title-only behaviour when no eyebrow is passed', () => {
    render(
      <MobileHeaderTitleProvider>
        <Screen title="Ramesh Traders" />
        <Bar />
      </MobileHeaderTitleProvider>,
    );
    expect(screen.getByTestId('bar')).toHaveTextContent('-|Ramesh Traders');
  });

  it('clears both lines when the screen unmounts', () => {
    const { rerender } = render(
      <MobileHeaderTitleProvider>
        <Screen title="Overdue" eyebrow="Ramesh Traders" />
        <Bar />
      </MobileHeaderTitleProvider>,
    );
    rerender(
      <MobileHeaderTitleProvider>
        <Bar />
      </MobileHeaderTitleProvider>,
    );
    expect(screen.getByTestId('bar')).toHaveTextContent('-|-');
  });
});

describe('duesHeaderTitle', () => {
  const group = (overdueCount: number, total: number) =>
    ({ summary: { overdueCount, entryIds: Array.from({ length: total }, (_, i) => `e${i}`) } }) as unknown as InboxDetailGroup;

  it('names what the group contains', () => {
    expect(duesHeaderTitle(group(0, 2))).toBe('Upcoming dues');
    expect(duesHeaderTitle(group(2, 2))).toBe('Overdue');
    expect(duesHeaderTitle(group(1, 3))).toBe('Dues & overdue');
  });
});
