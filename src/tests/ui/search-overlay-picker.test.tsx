import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SearchOverlayPicker } from '@/components/ui/search-overlay-picker';

function SingleSelectHarness() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  return (
    <SearchOverlayPicker
      open={open}
      onOpenChange={setOpen}
      title="Search items"
      triggerTitle="Search items"
      triggerDescription="Pick one item"
      searchValue={query}
      onSearchValueChange={setQuery}
      searchPlaceholder="Search items…"
    >
      <div data-testid="single-body">Body content</div>
    </SearchOverlayPicker>
  );
}

function MultiSelectHarness() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const items = ['Alpha', 'Beta', 'Gamma'];

  return (
    <SearchOverlayPicker
      open={open}
      onOpenChange={setOpen}
      title="Select items"
      triggerTitle={selected.length > 0 ? `${selected[0]} +${selected.length - 1} more` : 'Search items'}
      triggerDescription={selected.length > 0 ? `${selected.length} selected` : 'Choose a few items'}
      searchValue={query}
      onSearchValueChange={setQuery}
      searchPlaceholder="Search items…"
    >
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2" data-testid="selected-chips">
          {selected.map((item) => (
            <button key={item} type="button" onClick={() => setSelected((current) => current.filter((value) => value !== item))}>
              {item}
            </button>
          ))}
        </div>
      ) : null}

      <div>
        {items.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setSelected((current) => (current.includes(item) ? current : [...current, item]))}
          >
            {item}
          </button>
        ))}
      </div>
    </SearchOverlayPicker>
  );
}

describe('SearchOverlayPicker', () => {
  it('opens and closes from the CTA trigger', () => {
    render(<SingleSelectHarness />);

    expect(screen.queryByPlaceholderText('Search items…')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /search items/i }));
    expect(screen.getByPlaceholderText('Search items…')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByPlaceholderText('Search items…')).toBeNull();
  });

  it('supports selecting and removing multiple items', () => {
    render(<MultiSelectHarness />);

    fireEvent.click(screen.getByRole('button', { name: /search items choose a few items/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));

    expect(screen.getByTestId('selected-chips')).toHaveTextContent('Alpha');

    fireEvent.click(within(screen.getByTestId('selected-chips')).getByRole('button', { name: 'Alpha' }));
    expect(screen.queryByTestId('selected-chips')).toBeNull();
  });
});
