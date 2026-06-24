export const ZOHO_DAILY_SYNC_CRON = '0 5 * * *';

export function isZohoDailySyncSchedule(schedule?: string | null): boolean {
  return (schedule ?? '').trim() === ZOHO_DAILY_SYNC_CRON;
}

export function formatZohoDailySyncLabel(schedule?: string | null): string | null {
  if (isZohoDailySyncSchedule(schedule)) {
    return 'Daily 5:00 AM';
  }

  const trimmed = (schedule ?? '').trim();
  return trimmed.length > 0 ? 'Custom schedule' : null;
}

export function estimateZohoDailyNextRun(now = new Date()): Date {
  const next = new Date(now);
  next.setHours(5, 0, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export function formatZohoDailyNextRun(schedule?: string | null, now = new Date()): string | null {
  if (!isZohoDailySyncSchedule(schedule)) return null;

  const next = estimateZohoDailyNextRun(now);
  const label = new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(next);
  const time = new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(next);
  return `Next run ${label} at ${time}`;
}
