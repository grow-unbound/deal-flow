import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  MobileHeaderTitleProvider,
  useMobileHeaderPhoneValue,
  useMobileHeaderTitle,
  useMobileHeaderTitleValue,
} from '@/components/layout/MobileHeaderTitle';

function Screen({ title, phone }: { title: string | null; phone?: string | null }) {
  useMobileHeaderTitle(title, { phone });
  return null;
}

function Bar() {
  const title = useMobileHeaderTitleValue();
  const phone = useMobileHeaderPhoneValue();
  return <p data-testid="bar">{`${phone ?? '-'}|${title ?? '-'}`}</p>;
}

describe('useMobileHeaderTitle', () => {
  it('publishes the title and the tap-to-call phone', () => {
    render(
      <MobileHeaderTitleProvider>
        <Screen title="Ramesh Traders" phone="9990001111" />
        <Bar />
      </MobileHeaderTitleProvider>,
    );
    expect(screen.getByTestId('bar')).toHaveTextContent('9990001111|Ramesh Traders');
  });

  it('keeps the title-only behaviour when no phone is passed', () => {
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
        <Screen title="Ramesh Traders" phone="9990001111" />
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
