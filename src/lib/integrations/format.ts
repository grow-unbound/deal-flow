const IST_TIME_ZONE = 'Asia/Kolkata';

function istDayKey(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function formatTime(value: Date) {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(value);
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '';
  const dayPeriod = parts.find((part) => part.type === 'dayPeriod')?.value ?? '';
  return `${hour}:${minute}${dayPeriod.toUpperCase()}`;
}

function formatExplicitDate(value: Date) {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    day: 'numeric',
    month: 'short',
  }).formatToParts(value);
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  return `${day} ${month}`;
}

export function formatIntegrationDateTimeLabel(value?: string | null, now = new Date()) {
  if (!value) return 'Not yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not yet';

  const nowKey = istDayKey(now);
  const valueKey = istDayKey(date);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (valueKey === nowKey) {
    return `today ${formatTime(date)}`;
  }
  if (valueKey === istDayKey(tomorrow)) {
    return `tomorrow ${formatTime(date)}`;
  }
  if (valueKey === istDayKey(yesterday)) {
    return `yesterday ${formatTime(date)}`;
  }

  return `${formatExplicitDate(date)} ${formatTime(date)}`;
}

export function formatIntegrationRangeLabel(label: string, value?: string | null, now = new Date()) {
  const formatted = formatIntegrationDateTimeLabel(value, now);
  return formatted === 'Not yet' ? `${label} Not yet` : `${label} ${formatted}`;
}
