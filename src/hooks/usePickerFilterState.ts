'use client';

import { useCallback, useState } from 'react';

export type PickerAdvancedValues = Record<string, string | null>;

/**
 * Quick-filter <-> advanced-filter two-way sync for the search-overlay pickers. Several quick
 * chips (e.g. "Overdue") encode the same condition as an advanced dropdown option
 * (Outstanding -> Overdue); toggling one visibly reflects on the other, per the linked map.
 * Quick filters with no advanced equivalent (enquire_no_sales, top20) and advanced groups with
 * no quick equivalent (sales_location, brands, categories) are unaffected and behave
 * independently.
 */
export function usePickerFilterState(
  links: Record<string, { group: string; value: string }>,
  initial?: { quickFilters?: string[]; advancedValues?: PickerAdvancedValues },
) {
  const [quickFilters, setQuickFilters] = useState<string[]>(() => initial?.quickFilters ?? []);
  const [advancedValues, setAdvancedValues] = useState<PickerAdvancedValues>(() => initial?.advancedValues ?? {});

  const toggleQuickFilter = useCallback(
    (key: string, active: boolean) => {
      setQuickFilters((prev) => (active ? [...new Set([...prev, key])] : prev.filter((existing) => existing !== key)));

      const link = links[key];
      if (!link) return;

      setAdvancedValues((prev) => {
        if (active) {
          return { ...prev, [link.group]: link.value };
        }
        // Only reset the advanced group if it still matches this chip's value —
        // i.e. the user hasn't since picked something else there manually.
        if (prev[link.group] === link.value) {
          return { ...prev, [link.group]: null };
        }
        return prev;
      });
    },
    [links],
  );

  const setAdvancedFilter = useCallback(
    (group: string, value: string | null) => {
      setAdvancedValues((prev) => ({ ...prev, [group]: value }));

      // Sync the visual state of any quick chip linked to this group.
      setQuickFilters((prev) => {
        const linkedKeysForGroup = Object.entries(links).filter(([, link]) => link.group === group);
        let next = prev;
        for (const [key, link] of linkedKeysForGroup) {
          const shouldBeActive = link.value === value;
          const isActive = next.includes(key);
          if (shouldBeActive && !isActive) next = [...next, key];
          if (!shouldBeActive && isActive) next = next.filter((existing) => existing !== key);
        }
        return next;
      });
    },
    [links],
  );

  const reset = useCallback(() => {
    setQuickFilters([]);
    setAdvancedValues({});
  }, []);

  return { quickFilters, advancedValues, toggleQuickFilter, setAdvancedFilter, reset };
}
