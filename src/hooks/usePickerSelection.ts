'use client';

import { useCallback } from 'react';

/**
 * Shared select-all/clear-selection logic for the search-overlay pickers. "Select all"
 * operates only on the currently-loaded (filtered/searched) rows — not the full unfiltered
 * universe — matching the spec ("select all the items loaded in the list"). "Clear selection"
 * always empties the whole selection regardless of active filters.
 */
export function usePickerSelection(selectedIds: string[], onChange: (ids: string[]) => void) {
  const selectedSet = new Set(selectedIds);

  const toggleOne = useCallback(
    (id: string) => {
      onChange(selectedSet.has(id) ? selectedIds.filter((existing) => existing !== id) : [...selectedIds, id]);
    },
    [onChange, selectedIds, selectedSet],
  );

  const toggleAllLoaded = useCallback(
    (loadedIds: string[]) => {
      const loadedSet = new Set(loadedIds);
      const allLoadedSelected = loadedIds.length > 0 && loadedIds.every((id) => selectedSet.has(id));
      if (allLoadedSelected) {
        onChange(selectedIds.filter((id) => !loadedSet.has(id)));
      } else {
        const next = new Set(selectedIds);
        loadedIds.forEach((id) => next.add(id));
        onChange(Array.from(next));
      }
    },
    [onChange, selectedIds, selectedSet],
  );

  const clearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  return { selectedSet, toggleOne, toggleAllLoaded, clearAll };
}

export function getLoadedSelectionState(loadedIds: string[], selectedSet: Set<string>) {
  const allLoadedSelected = loadedIds.length > 0 && loadedIds.every((id) => selectedSet.has(id));
  const someLoadedSelected = loadedIds.some((id) => selectedSet.has(id));
  return { allLoadedSelected, someLoadedSelected: someLoadedSelected && !allLoadedSelected };
}
