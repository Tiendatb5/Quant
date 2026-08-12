import type { ForecastErrorCode } from '../../shared/forecast';

export const US_MARKET_TIMEZONE = 'America/New_York';
export const US_MARKET_CALENDAR = 'US-equities-v1';
export const US_REGULAR_SESSION = '09:30-16:00';

const SESSION_BAR_START_MINUTES = [
  9 * 60 + 30,
  10 * 60 + 30,
  11 * 60 + 30,
  12 * 60 + 30,
  13 * 60 + 30,
  14 * 60 + 30,
  15 * 60 + 30,
] as const;
const EARLY_CLOSE_BAR_START_MINUTES = [
  9 * 60 + 30,
  10 * 60 + 30,
  11 * 60 + 30,
  12 * 60 + 30,
] as const;

interface LocalDate {
  year: number;
  month: number;
  day: number;
}

export interface ForecastCalendarRequest {
  afterTimestamp: string;
  count: number;
  exchange?: string;
  timezone?: string;
}

export const CME_FUTURES_TIMEZONE = 'America/New_York';
export const CME_EQUITY_INDEX_FUTURES_CALENDAR = 'CME-equity-index-futures-v1';
export const CME_GLOBEX_SESSION = '18:00-17:00-Globex';

// Widen assumptions type
export interface ForecastCalendarResult {
  timestamps: string[];
  assumptions: {
    exchange: string;
    timezone: string;
    calendar: typeof US_MARKET_CALENDAR | typeof CME_EQUITY_INDEX_FUTURES_CALENDAR;
    regularSession: typeof US_REGULAR_SESSION | typeof CME_GLOBEX_SESSION;
  };
}

export class ForecastCalendarFailure extends Error {
  readonly code: ForecastErrorCode = 'MARKET_CALENDAR_FAILED';

  constructor(message: string) {
    super(message);
    this.name = 'ForecastCalendarFailure';
  }
}

function dateKey(date: LocalDate): string {
  return [
    String(date.year).padStart(4, '0'),
    String(date.month).padStart(2, '0'),
    String(date.day).padStart(2, '0'),
  ].join('-');
}

function fromUtcDate(date: Date): LocalDate {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcDate(
    new Date(Date.UTC(date.year, date.month - 1, date.day + days)),
  );
}

function dayOfWeek(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

function nthWeekday(
  year: number,
  month: number,
  weekday: number,
  occurrence: number,
): LocalDate {
  const first: LocalDate = { year, month, day: 1 };
  const offset = (weekday - dayOfWeek(first) + 7) % 7;
  return { year, month, day: 1 + offset + (occurrence - 1) * 7 };
}

function lastWeekday(year: number, month: number, weekday: number): LocalDate {
  const firstNextMonth =
    month === 12
      ? { year: year + 1, month: 1, day: 1 }
      : { year, month: month + 1, day: 1 };
  const last = addDays(firstNextMonth, -1);
  const offset = (dayOfWeek(last) - weekday + 7) % 7;
  return addDays(last, -offset);
}

function observedFixedHoliday(
  year: number,
  month: number,
  day: number,
): LocalDate {
  const holiday = { year, month, day };
  const weekday = dayOfWeek(holiday);
  if (weekday === 6) return addDays(holiday, -1);
  if (weekday === 0) return addDays(holiday, 1);
  return holiday;
}

function newYearsHoliday(year: number): LocalDate {
  const holiday = { year, month: 1, day: 1 };
  const weekday = dayOfWeek(holiday);
  // NYSE does not observe New Year's Day on the prior Friday when Jan 1
  // falls on Saturday.
  if (weekday === 0) return addDays(holiday, 1);
  return holiday;
}

function easterSunday(year: number): LocalDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function marketHolidaysForYear(year: number): Set<string> {
  const dates = [
    newYearsHoliday(year),
    nthWeekday(year, 1, 1, 3),
    nthWeekday(year, 2, 1, 3),
    addDays(easterSunday(year), -2),
    lastWeekday(year, 5, 1),
    ...(year >= 2022 ? [observedFixedHoliday(year, 6, 19)] : []),
    observedFixedHoliday(year, 7, 4),
    nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 11, 4, 4),
    observedFixedHoliday(year, 12, 25),
  ];
  return new Set(dates.map(dateKey));
}

function isMarketHoliday(date: LocalDate): boolean {
  const key = dateKey(date);
  return [date.year - 1, date.year, date.year + 1].some((year) =>
    marketHolidaysForYear(year).has(key),
  );
}

function isTradingDay(date: LocalDate): boolean {
  const weekday = dayOfWeek(date);
  return weekday !== 0 && weekday !== 6 && !isMarketHoliday(date);
}

function easternPartsFromTimestamp(timestampMs: number): LocalDate & {
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: US_MARKET_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestampMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  if (![year, month, day, hour, minute].every(Number.isInteger)) {
    throw new ForecastCalendarFailure(
      'Could not resolve the exchange-local forecast date.',
    );
  }
  return { year, month, day, hour, minute };
}

function easternDateFromTimestamp(timestampMs: number): LocalDate {
  const { year, month, day } = easternPartsFromTimestamp(timestampMs);
  return { year, month, day };
}

function isEasternDaylightTime(date: LocalDate): boolean {
  const starts = nthWeekday(date.year, 3, 0, 2);
  const ends = nthWeekday(date.year, 11, 0, 1);
  const key = dateKey(date);
  return key >= dateKey(starts) && key < dateKey(ends);
}

function easternWallTimeToUtc(
  date: LocalDate,
  hour: number,
  minute: number,
): number {
  const utcOffsetHours = isEasternDaylightTime(date) ? 4 : 5;
  return Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    hour + utcOffsetHours,
    minute,
  );
}

function normalizeTimezone(timezone: string | undefined): typeof US_MARKET_TIMEZONE {
  if (
    timezone === undefined ||
    timezone === US_MARKET_TIMEZONE ||
    timezone === 'US/Eastern'
  ) {
    return US_MARKET_TIMEZONE;
  }
  throw new ForecastCalendarFailure(
    `Unsupported U.S. forecast exchange time zone: ${timezone}.`,
  );
}

function earlyCloseDatesForYear(year: number): Set<string> {
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  const dates: LocalDate[] = [addDays(thanksgiving, 1)];
  const christmasEve = { year, month: 12, day: 24 };
  if (dayOfWeek(christmasEve) !== 0 && dayOfWeek(christmasEve) !== 6) {
    dates.push(christmasEve);
  }

  const independenceDay = { year, month: 7, day: 4 };
  const independenceWeekday = dayOfWeek(independenceDay);
  let independenceEarlyClose: LocalDate | null = null;
  if (independenceWeekday >= 2 && independenceWeekday <= 5) {
    independenceEarlyClose = addDays(independenceDay, -1);
  } else if (independenceWeekday === 1) {
    independenceEarlyClose = addDays(independenceDay, -3);
  } else if (independenceWeekday === 0) {
    independenceEarlyClose = addDays(independenceDay, -2);
  }
  if (independenceEarlyClose) dates.push(independenceEarlyClose);

  return new Set(
    dates
      .filter((date) => isTradingDay(date))
      .map(dateKey),
  );
}

function isEarlyClose(date: LocalDate): boolean {
  return earlyCloseDatesForYear(date.year).has(dateKey(date));
}

function barStartsForDate(
  date: LocalDate,
): readonly number[] {
  return isEarlyClose(date)
    ? EARLY_CLOSE_BAR_START_MINUTES
    : SESSION_BAR_START_MINUTES;
}

export function validateUsMarketBarTimestamps(
  timestamps: readonly string[],
  timezone: string,
): boolean {
  if (timezone !== US_MARKET_TIMEZONE || timestamps.length === 0) return false;
  let previous = -Infinity;
  for (const timestamp of timestamps) {
    const timestampMs = Date.parse(timestamp);
    if (
      !Number.isFinite(timestampMs) ||
      timestampMs <= previous ||
      timestampMs % 60_000 !== 0
    ) {
      return false;
    }
    previous = timestampMs;
    let parts: ReturnType<typeof easternPartsFromTimestamp>;
    try {
      parts = easternPartsFromTimestamp(timestampMs);
    } catch {
      return false;
    }
    const date = {
      year: parts.year,
      month: parts.month,
      day: parts.day,
    };
    const minuteOfDay = parts.hour * 60 + parts.minute;
    if (
      !isTradingDay(date) ||
      !barStartsForDate(date).some((slot) => slot === minuteOfDay)
    ) {
      return false;
    }
  }
  return true;
}

export function nextUsMarketBarTimestamps(
  request: ForecastCalendarRequest,
): ForecastCalendarResult {
  const afterMs = Date.parse(request.afterTimestamp);
  if (!Number.isFinite(afterMs)) {
    throw new ForecastCalendarFailure(
      'A valid latest completed candle timestamp is required.',
    );
  }
  if (
    !Number.isInteger(request.count) ||
    request.count < 1 ||
    request.count > 10_000
  ) {
    throw new ForecastCalendarFailure(
      'A valid forecast market-bar count is required.',
    );
  }

  const timezone = normalizeTimezone(request.timezone);
  const timestamps: string[] = [];
  let date = easternDateFromTimestamp(afterMs);
  for (let daysChecked = 0; daysChecked < 370; daysChecked += 1) {
    if (isTradingDay(date)) {
      for (const minuteOfDay of barStartsForDate(date)) {
        const timestampMs = easternWallTimeToUtc(
          date,
          Math.floor(minuteOfDay / 60),
          minuteOfDay % 60,
        );
        if (timestampMs <= afterMs) continue;
        timestamps.push(new Date(timestampMs).toISOString());
        if (timestamps.length === request.count) {
          return {
            timestamps,
            assumptions: {
              exchange: request.exchange?.trim() || 'US',
              timezone,
              calendar: US_MARKET_CALENDAR,
              regularSession: US_REGULAR_SESSION,
            },
          };
        }
      }
    }
    date = addDays(date, 1);
  }

  throw new ForecastCalendarFailure(
    `Could not produce ${request.count} valid U.S. market-bar timestamps.`,
  );
}

/** CME equity-index futures (MNQ/MES/ES/NQ): almost 24h Globex, daily break ~17:00–18:00 America/New_York. */

const GLOBEX_BREAK_START_MINUTE = 17 * 60; // 17:00 ET inclusive
const GLOBEX_BREAK_END_MINUTE = 18 * 60;   // 18:00 ET exclusive (reopen)

function getNyParts(ms: number): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0=Sun..6=Sat
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(ms));
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  // hour12:false can yield "24" for midnight in some engines — normalize
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    weekday: weekdayMap[map.weekday] ?? 0,
  };
}

/** Convert an America/New_York wall time to UTC ms (handles EST/EDT). */
function nyWallToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  // Rough UTC guess, then correct using the actual NY offset at that instant.
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  for (let i = 0; i < 3; i++) {
    const ny = getNyParts(guess);
    const asNy = Date.UTC(ny.year, ny.month - 1, ny.day, ny.hour, ny.minute, 0, 0);
    const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    guess += target - asNy;
  }
  return guess;
}

function isCmeEquityIndexFuturesTradingDay(weekday: number): boolean {
  // Globex: Sun evening open through Fri afternoon close.
  // weekday is the NY calendar day of the bar start.
  // Allow Sun(0) for Sunday 18:00 open, Mon–Thu full, Fri until break.
  // Block pure Saturday.
  return weekday !== 6;
}

function isGlobexHourAllowed(weekday: number, minuteOfDay: number): boolean {
  if (weekday === 6) return false; // Saturday
  // Daily maintenance: 17:00 <= t < 18:00 ET
  if (minuteOfDay >= GLOBEX_BREAK_START_MINUTE && minuteOfDay < GLOBEX_BREAK_END_MINUTE) {
    return false;
  }
  // Friday: session ends at 17:00 ET (no reopen Friday 18:00)
  if (weekday === 5 && minuteOfDay >= GLOBEX_BREAK_START_MINUTE) {
    return false;
  }
  // Sunday: only from 18:00 ET onward
  if (weekday === 0 && minuteOfDay < GLOBEX_BREAK_END_MINUTE) {
    return false;
  }
  return true;
}

export function nextCmeEquityIndexFuturesBarTimestamps(
  request: ForecastCalendarRequest,
): ForecastCalendarResult {
  const afterMs = Date.parse(request.afterTimestamp);
  if (!Number.isFinite(afterMs)) {
    throw new ForecastCalendarFailure(
      'A valid latest completed candle timestamp is required.',
    );
  }
  if (
    !Number.isInteger(request.count) ||
    request.count < 1 ||
    request.count > 10_000
  ) {
    throw new ForecastCalendarFailure(
      'A valid forecast market-bar count is required.',
    );
  }

  const timestamps: string[] = [];
  // Start searching from the next whole hour after the last completed bar.
  let cursor = afterMs - (afterMs % 3_600_000) + 3_600_000;

  // Safety: never scan more than ~60 days of hours
  const maxSteps = 60 * 24;
  let steps = 0;

  while (timestamps.length < request.count && steps < maxSteps) {
    steps += 1;
    const ny = getNyParts(cursor);
    const minuteOfDay = ny.hour * 60 + ny.minute;

    if (
      isCmeEquityIndexFuturesTradingDay(ny.weekday) &&
      isGlobexHourAllowed(ny.weekday, minuteOfDay)
    ) {
      // Re-anchor to exact NY wall hour → UTC so DST cannot skew the stamp
      const aligned = nyWallToUtcMs(ny.year, ny.month, ny.day, ny.hour, 0);
      const iso = new Date(aligned).toISOString();
      const last = timestamps[timestamps.length - 1];
      if (!last || iso > last) {
        timestamps.push(iso);
      }
    }

    cursor += 3_600_000; // always walk forward in real time
  }

  if (timestamps.length < request.count) {
    throw new ForecastCalendarFailure(
      `Could not build ${request.count} CME futures hourly bars after ${request.afterTimestamp}.`,
    );
  }

  return {
    timestamps,
    assumptions: {
      calendar: 'CME-equity-index-futures-v1',
      regularSession: '18:00-17:00-Globex',
      exchange: request.exchange ?? 'CME',
      timezone: request.timezone ?? 'America/New_York',
    },
  };
}
