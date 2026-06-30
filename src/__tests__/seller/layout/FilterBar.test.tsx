import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { FilterBar, type FilterBarGroup } from '@/components/seller/layout';

function renderFilterBar(groups: FilterBarGroup[], props?: { searchValue?: string; searchLoading?: boolean }) {
  return render(
    <div style={{ maxWidth: 220, overflowX: 'auto' }}>
      <FilterBar
        count="12 results"
        searchPlaceholder="Search items…"
        chips={[]}
        activeChip=""
        sortBy="Recent first"
        hideViewToggle
        groups={groups}
        searchValue={props?.searchValue ?? ''}
        searchLoading={props?.searchLoading}
      />
    </div>,
  );
}

describe('FilterBar', () => {
  it('opens filter options outside the scroll container', () => {
    const onChange = vi.fn();

    renderFilterBar([
      {
        key: 'region',
        label: 'Region',
        options: [
          { value: 'north', label: 'North' },
          { value: 'south', label: 'South' },
        ],
        values: [],
        onChange,
      },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Region: All' }));

    const menu = screen.getByRole('menu');
    expect(menu).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: 'North' })).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: 'South' })).toBeInTheDocument();
  });

  it('keeps the selection callback wired when an option is clicked', () => {
    const onChange = vi.fn();

    renderFilterBar([
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'draft', label: 'Draft' },
          { value: 'live', label: 'Live' },
        ],
        values: [],
        onChange,
      },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Status: All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));

    expect(onChange).toHaveBeenCalledWith(['draft']);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('clears the filter when All is selected inside the menu', () => {
    const onChange = vi.fn();

    renderFilterBar([
      {
        key: 'region',
        label: 'Region',
        options: [
          { value: 'north', label: 'North' },
          { value: 'south', label: 'South' },
        ],
        values: ['north'],
        onChange,
      },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Region: North' }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('button', { name: 'All' }));

    expect(onChange).toHaveBeenCalledWith([]);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows a clear button when search has text and clears on click', () => {
    const onSearchChange = vi.fn();

    render(
      <div style={{ maxWidth: 220, overflowX: 'auto' }}>
        <FilterBar
          count="12 results"
          searchPlaceholder="Search items…"
          chips={[]}
          activeChip=""
          sortBy="Recent first"
          hideViewToggle
          searchValue="alpha"
          onSearchChange={onSearchChange}
        />
      </div>,
    );

    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onSearchChange).toHaveBeenCalledWith('');
  });

  it('shows a loading indicator while search is in flight', () => {
    const { container } = renderFilterBar([], { searchValue: 'alpha', searchLoading: true });

    expect(container.querySelector('svg.animate-spin')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
  });

  it('dismisses an open dropdown when clicking outside', () => {
    renderFilterBar([
      {
        key: 'region',
        label: 'Region',
        options: [
          { value: 'north', label: 'North' },
          { value: 'south', label: 'South' },
        ],
        values: [],
        onChange: vi.fn(),
      },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Region: All' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
