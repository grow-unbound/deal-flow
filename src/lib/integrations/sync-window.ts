export type SyncWindowId =
  | 'last_24_hours'
  | 'last_7_days'
  | 'year_to_date'
  | 'financial_year_to_date';

export interface SyncWindowOption {
  id: SyncWindowId;
  label: string;
  description: string;
}

export const SYNC_WINDOW_OPTIONS: SyncWindowOption[] = [
  {
    id: 'last_24_hours',
    label: 'Last 24 hours',
    description: 'Useful for checking the latest changes and quick refreshes.',
  },
  {
    id: 'last_7_days',
    label: 'Last 7 days',
    description: 'Refresh the most recent week of activity.',
  },
  {
    id: 'year_to_date',
    label: 'Year Till Date',
    description: 'Sync from January 1 of the current calendar year.',
  },
  {
    id: 'financial_year_to_date',
    label: 'Financial Year Till Date',
    description: 'Sync from April 1 of the current Indian financial year.',
  },
];

function toDateOnly(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() - days);
  return next;
}

export function resolveSyncWindowSince(windowId: SyncWindowId, now = new Date()): string {
  switch (windowId) {
    case 'last_24_hours':
      return toDateOnly(shiftDays(now, 1));
    case 'last_7_days':
      return toDateOnly(shiftDays(now, 7));
    case 'year_to_date':
      return `${now.getFullYear()}-01-01`;
    case 'financial_year_to_date':
      return now.getMonth() >= 3
        ? `${now.getFullYear()}-04-01`
        : `${now.getFullYear() - 1}-04-01`;
  }
}
