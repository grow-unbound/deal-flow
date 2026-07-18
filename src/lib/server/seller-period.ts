import {
  DEFAULT_SELLER_LANDING_PERIOD,
  parseSellerLandingPeriod,
  type SellerLandingPeriod,
  type SellerLandingPeriodMeta,
} from '@/lib/seller-period';

const DAY_MS = 24 * 60 * 60 * 1000;
const TIMEZONE = 'Asia/Kolkata';

function clampDate(date: Date, min: Date, max: Date) {
  if (date.getTime() < min.getTime()) return min;
  if (date.getTime() > max.getTime()) return max;
  return date;
}

function addMonths(year: number, month: number, delta: number) {
  const absoluteMonth = year * 12 + month + delta;
  return {
    year: Math.floor(absoluteMonth / 12),
    month: ((absoluteMonth % 12) + 12) % 12,
  };
}

function startOfIstWeek(year: number, month: number, day: number) {
  const current = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const weekday = current.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return new Date(Date.UTC(year, month, day + mondayOffset, 0, 0, 0));
}

function toIstCalendar(now = new Date()) {
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }));
  return {
    now: istNow,
    year: istNow.getFullYear(),
    month: istNow.getMonth(),
    day: istNow.getDate(),
  };
}

export function getSellerLandingPeriodMeta(
  periodInput: string | null | undefined,
  now = new Date(),
): SellerLandingPeriodMeta {
  const selected = parseSellerLandingPeriod(periodInput);
  const { year, month, day } = toIstCalendar(now);

  let currentStart: Date;
  let currentEndExclusive: Date;
  let previousStart: Date;
  let previousPeriodEndExclusive: Date;

  if (selected === 'today') {
    currentStart = new Date(Date.UTC(year, month, day, 0, 0, 0));
    currentEndExclusive = new Date(Date.UTC(year, month, day + 1, 0, 0, 0));
    previousStart = new Date(Date.UTC(year, month, day - 1, 0, 0, 0));
    previousPeriodEndExclusive = currentStart;
  } else if (selected === 'week') {
    currentStart = startOfIstWeek(year, month, day);
    currentEndExclusive = new Date(currentStart.getTime() + 7 * DAY_MS);
    previousStart = new Date(currentStart.getTime() - 7 * DAY_MS);
    previousPeriodEndExclusive = currentStart;
  } else if (selected === 'last90') {
    currentStart = new Date(Date.UTC(year, month, day - 89, 0, 0, 0));
    currentEndExclusive = new Date(Date.UTC(year, month, day + 1, 0, 0, 0));
    previousStart = new Date(Date.UTC(year, month, day - 179, 0, 0, 0));
    previousPeriodEndExclusive = currentStart;
  } else if (selected === 'quarter') {
    const quarterStartMonth = Math.floor(month / 3) * 3;
    currentStart = new Date(Date.UTC(year, quarterStartMonth, 1, 0, 0, 0));
    currentEndExclusive = new Date(Date.UTC(year, quarterStartMonth + 3, 1, 0, 0, 0));
    previousStart = new Date(Date.UTC(year, quarterStartMonth - 3, 1, 0, 0, 0));
    previousPeriodEndExclusive = new Date(Date.UTC(year, quarterStartMonth, 1, 0, 0, 0));
  } else if (selected === 'year') {
    currentStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    currentEndExclusive = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
    previousStart = new Date(Date.UTC(year - 1, 0, 1, 0, 0, 0));
    previousPeriodEndExclusive = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  } else {
    currentStart = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    currentEndExclusive = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
    const previousMonth = addMonths(year, month, -1);
    previousStart = new Date(Date.UTC(previousMonth.year, previousMonth.month, 1, 0, 0, 0));
    previousPeriodEndExclusive = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  }

  const nowBoundary = new Date(Date.UTC(year, month, day + 1, 0, 0, 0));
  const effectiveCurrentEnd = Math.min(nowBoundary.getTime(), currentEndExclusive.getTime());
  const currentElapsedDays = Math.max(1, Math.floor((effectiveCurrentEnd - currentStart.getTime()) / DAY_MS));
  const rawPreviousEnd = new Date(previousStart.getTime() + currentElapsedDays * DAY_MS);
  const previousEndExclusive = clampDate(rawPreviousEnd, previousStart, previousPeriodEndExclusive);

  return {
    selected,
    timezone: TIMEZONE,
    current_start: currentStart.toISOString(),
    current_end_exclusive: currentEndExclusive.toISOString(),
    previous_start: previousStart.toISOString(),
    previous_end_exclusive: previousEndExclusive.toISOString(),
    elapsed_days: currentElapsedDays,
  };
}

export function getSellerLandingPeriodFromRequest(request: Request): SellerLandingPeriod {
  const url = new URL(request.url);
  return parseSellerLandingPeriod(url.searchParams.get('period') ?? DEFAULT_SELLER_LANDING_PERIOD);
}

type SearchParamsInput =
  | Promise<Record<string, string | string[] | undefined>>
  | Record<string, string | string[] | undefined>
  | undefined;

export async function resolveSellerLandingPeriod(searchParams?: SearchParamsInput): Promise<SellerLandingPeriod> {
  const resolved = (await searchParams) ?? {};
  const raw = Array.isArray(resolved.period) ? resolved.period[0] : resolved.period;
  return parseSellerLandingPeriod(raw ?? DEFAULT_SELLER_LANDING_PERIOD);
}
