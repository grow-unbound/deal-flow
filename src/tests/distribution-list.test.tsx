import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DistributionList } from '@/components/seller/detail/DistributionList';

describe('DistributionList', () => {
  it('renders exact mix percentages and bar widths without forced minimums', () => {
    render(
      <DistributionList
        mode="mix"
        items={[
          { id: 'north', label: 'North', pct: 60, value: '₹60K' },
          { id: 'south', label: 'South', pct: 40, value: '₹40K' },
          { id: 'west', label: 'West', pct: 0, value: '₹0' },
        ]}
        emptyTitle="No data"
      />,
    );

    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByLabelText('North share')).toHaveStyle({ width: '60%' });
    expect(screen.getByLabelText('South share')).toHaveStyle({ width: '40%' });
    expect(screen.getByLabelText('West share')).toHaveStyle({ width: '0%' });
  });
});
