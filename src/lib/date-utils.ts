export function isoDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const IST_TIME_ZONE = 'Asia/Kolkata';

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.get('year')),
    month: Number(values.get('month')),
    day: Number(values.get('day')),
  };
}

export function isoDateInTimeZone(date: Date, timeZone = IST_TIME_ZONE): string {
  const { year, month, day } = getDatePartsInTimeZone(date, timeZone);
  return isoDateString(new Date(Date.UTC(year, month - 1, day)));
}

export function offsetIsoDateInTimeZone(date: Date, days: number, timeZone = IST_TIME_ZONE): string {
  const { year, month, day } = getDatePartsInTimeZone(date, timeZone);
  return isoDateString(new Date(Date.UTC(year, month - 1, day + days)));
}

/** Alias used by composer forms — YYYY-MM-DD for native date input compatibility */
export function isoDateInput(value: Date): string {
  return isoDateString(value);
}

export function parseIsoDate(str: string): Date | null {
  if (!str) return null;
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatInputDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function parseInputDate(str: string): Date | null {
  const match = str.trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!match) return null;
  const parsed = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatSelectedSummary(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseDatetimeLocal(str: string): Date | null {
  if (!str) return null;
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function coerceDateValue(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  return parseIsoDate(value) ?? parseInputDate(value);
}

/** First calendar day strictly after `isoDate` (YYYY-MM-DD), or null if invalid. */
export function minDateAfterIso(isoDate: string): Date | null {
  const base = parseIsoDate(isoDate);
  if (!base) return null;
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
  return startOfDay(next);
}

/**
 * When the primary date moves forward, ensure the secondary date is strictly after it.
 * Returns the new secondary ISO string, or undefined if no change (including when second is empty — e.g. invoice due date cleared).
 */
export function bumpSecondDateAfterFirst(firstIso: string, secondIso: string | null | undefined): string | undefined {
  const minNext = minDateAfterIso(firstIso);
  if (!minNext) return undefined;
  if (secondIso == null || secondIso === '') return undefined;
  const first = parseIsoDate(firstIso);
  const second = parseIsoDate(secondIso);
  if (!first) return undefined;
  if (!second || second.getTime() <= first.getTime()) {
    return isoDateString(minNext);
  }
  return undefined;
}
