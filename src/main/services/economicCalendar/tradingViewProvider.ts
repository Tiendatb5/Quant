// src/main/services/economicCalendar/tradingViewProvider.ts

import { fetchJson } from '../http'; // ← was ./http
import type { EconomicEvent, EconomicImpact } from '../../../shared/types';
import type {
  FetchCalendarOptions,
  TradingViewEvent,
  TradingViewResponse,
} from './types';

const TRADINGVIEW_URL = 'https://economic-calendar.tradingview.com/events';
const TTL_MS = 5 * 60_000;
const TIMEOUT_MS = 15_000;

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function getImpact(importance: number | undefined): EconomicImpact {
  switch (importance) {
    case 2:
      return 'high';
    case 1:
      return 'medium';
    case 0:
      return 'low';
    default:
      return 'none';
  }
}

function getEventDate(item: TradingViewEvent): string | null {
  const value = item.date ?? item.datetime ?? item.eventDate;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function getCountryCode(item: TradingViewEvent): string {
  return (item.country ?? 'US').toUpperCase();
}

function getCurrency(item: TradingViewEvent): string {
  return (item.currency ?? 'USD').toUpperCase();
}

function getEventId(item: TradingViewEvent, index: number): string {
  if (item.id != null) return String(item.id);
  return `${getCountryCode(item)}-${item.title ?? 'event'}-${index}`;
}

function formatDisplayTime(isoTime: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/New_York',
  }).format(new Date(isoTime));
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

export async function fetchTradingViewCalendar(
  options: FetchCalendarOptions = {},
): Promise<EconomicEvent[]> {
  const now = new Date();
  const from = options.from ?? startOfUtcDay(now);
  const to =
    options.to ?? new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  const country = (options.country ?? 'US').toUpperCase();
  const minImportance = options.minImportance ?? 1;

  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
    countries: country,
  });

  const url = `${TRADINGVIEW_URL}?${params.toString()}`;

  const responseData = await fetchJson<TradingViewResponse>(url, {
    ttlMs: TTL_MS,
    timeoutMs: TIMEOUT_MS,
    headers: {
      Origin: 'https://www.tradingview.com',
      Accept: 'application/json',
      Referer: 'https://www.tradingview.com/',
    },
  });

  if (!responseData || !Array.isArray(responseData.result)) {
    throw new Error('TradingView returned an invalid calendar response.');
  }

  const events: EconomicEvent[] = [];

  for (let index = 0; index < responseData.result.length; index++) {
    const item = responseData.result[index];
    const importance = item.importance ?? 0;
    if (importance < minImportance) continue;

    const eventTime = getEventDate(item);
    if (!eventTime) continue;

    const countryCode = getCountryCode(item);

    events.push({
      id: getEventId(item, index),
      eventTime,
      time: formatDisplayTime(eventTime),
      currency: getCurrency(item),
      country: countryCode,
      countryCode,
      impact: getImpact(importance),
      impactLevel: importance,
      event: item.title ?? 'Unknown Event',
      actual: formatValue(item.actual),
      forecast: formatValue(item.forecast),
      previous: formatValue(item.previous),
      source: 'tradingview',
    });
  }

  events.sort((a, b) => Date.parse(a.eventTime) - Date.parse(b.eventTime));
  return events;
}

export function getMinutesUntilEvent(
  eventTimeIso: string,
  now: Date = new Date(),
): number {
  return Math.floor((Date.parse(eventTimeIso) - now.getTime()) / 60_000);
}

export function formatCountdown(minutes: number): string {
  if (minutes < 0) return 'Released';
  if (minutes === 0) return 'NOW';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `${hours}h`;
  return `${hours}h ${remaining}m`;
}