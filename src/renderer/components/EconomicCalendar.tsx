// src/renderer/components/EconomicCalendar.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  EconomicCalendarCountry,  // ← add this
  EconomicCalendarDateFilter,
  EconomicEvent,
} from '../../shared/types';
import { api } from '../api';
import '../styles/economic-calendar.css';
import { getCountryFlagSrc } from  '../utils/countryFlags'

type ImpactLevel = 'high' | 'medium' | 'low';

interface CountryOption {
  code: Exclude<EconomicCalendarCountry, 'ALL'>;
  label: string;
  flag: string;
}

const COUNTRIES: CountryOption[] = [
  { code: 'US', label: 'United States', flag: '🇺🇸' },
  { code: 'CA', label: 'Canada', flag: '🇨🇦' },
  { code: 'GB', label: 'United Kingdom', flag: '🇬🇧' },
  { code: 'EU', label: 'Euro Area', flag: '🇪🇺' },
  { code: 'DE', label: 'Germany', flag: '🇩🇪' },
  { code: 'FR', label: 'France', flag: '🇫🇷' },
  { code: 'IT', label: 'Italy', flag: '🇮🇹' },
  { code: 'JP', label: 'Japan', flag: '🇯🇵' },
  { code: 'CN', label: 'China', flag: '🇨🇳' },
  { code: 'AU', label: 'Australia', flag: '🇦🇺' },
  { code: 'NZ', label: 'New Zealand', flag: '🇳🇿' },
  { code: 'CH', label: 'Switzerland', flag: '🇨🇭' },
  { code: 'IN', label: 'India', flag: '🇮🇳' },
  { code: 'KR', label: 'South Korea', flag: '🇰🇷' },
];

const DATE_OPTIONS: Array<{ value: EconomicCalendarDateFilter; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'week', label: 'This Week' },
];

const IMPACT_OPTIONS: Array<{ value: ImpactLevel; label: string; emoji: string }> = [
  { value: 'high', label: 'High', emoji: '🔴' },
  { value: 'medium', label: 'Medium', emoji: '🟡' },
  { value: 'low', label: 'Low', emoji: '🟢' },
];

const STORAGE_KEY = 'quant.economicCalendar.filters.v1';
const REFRESH_MS = 5 * 60_000;
const TICK_MS = 1_000; // live countdown; use 30_000 if you prefer lighter

interface SavedFilters {
  countries: string[];
  dateFilter: EconomicCalendarDateFilter;
  impacts: ImpactLevel[];
}

const DEFAULT_FILTERS: SavedFilters = {
  countries: ['US'],
  dateFilter: 'today',
  impacts: ['high', 'medium', 'low'], // "all"
};

function loadSavedFilters(): SavedFilters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw) as Partial<SavedFilters>;
    const countries = Array.isArray(parsed.countries)
      ? parsed.countries.filter((c) => COUNTRIES.some((x) => x.code === c))
      : DEFAULT_FILTERS.countries;
    const impacts = Array.isArray(parsed.impacts)
      ? (parsed.impacts.filter((i) =>
          IMPACT_OPTIONS.some((x) => x.value === i),
        ) as ImpactLevel[])
      : DEFAULT_FILTERS.impacts;
    const dateFilter =
      parsed.dateFilter === 'today' ||
      parsed.dateFilter === 'tomorrow' ||
      parsed.dateFilter === 'week'
        ? parsed.dateFilter
        : DEFAULT_FILTERS.dateFilter;
    return {
      countries: countries.length ? countries : DEFAULT_FILTERS.countries,
      dateFilter,
      impacts: impacts.length ? impacts : DEFAULT_FILTERS.impacts,
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatDateHeading(events: EconomicEvent[]): string {
  if (events.length === 0) return 'TODAY';
  const date = new Date(events[0].eventTime);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
    .format(date)
    .toUpperCase();
}

function displayValue(value: string | null): string {
  if (!value || value === '-' || value === '--') return '—';
  return value;
}

function getMinutesUntil(eventTime: string, now: Date): number {
  return Math.floor((Date.parse(eventTime) - now.getTime()) / 60_000);
}

function formatCountdown(minutes: number): string {
  if (minutes < 0) return 'Released';
  if (minutes === 0) return 'NOW';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function ImpactBadge({ impact }: { impact: EconomicEvent['impact'] }) {
  const key = String(impact).toLowerCase(); // safe if API still sends High
  const label =
    key === 'high' ? 'HIGH' : key === 'medium' ? 'MEDIUM' : key === 'low' ? 'LOW' : '—';

  return (
    <span className={`econ-impact econ-impact-${key}`}>
      <span className="econ-impact-dot" />
      {label}
    </span>
  );
}

function EventRow({
  event,
  index,
  now,
}: {
  event: EconomicEvent;
  index: number;
  now: Date;
}) {
  const minutes = getMinutesUntil(event.eventTime, now);
  const isPast = minutes < 0;

  return (
    <li
      className={`econ-event-row ${isPast ? 'is-past' : ''}`}
      style={{ '--motion-index': index } as React.CSSProperties}
    >
      <div className="econ-event-main">
        <div className="econ-event-time-col">
          <div className="econ-event-time num">{formatTime(event.eventTime)}</div>
          <div className={`econ-countdown ${isPast ? 'is-past' : minutes <= 15 ? 'is-soon' : ''}`}>
            {formatCountdown(minutes)}
          </div>
        </div>

        <div className="econ-country">
          {getCountryFlagSrc(event.countryCode) ? (
            <img
              className="econ-flag-img"
              src={getCountryFlagSrc(event.countryCode)}
              alt={event.countryCode}
              width={16}
              height={12}
            />
          ) : (
            <span className="econ-flag-fallback">{event.countryCode}</span>
          )}
          <span className="econ-country-code" title={event.country}>
            {event.countryCode}
          </span>
        </div>

        <div className="econ-event-name">
          <div className="econ-event-title" title={event.event}>
            {event.event}
          </div>
          <div className="econ-event-values">
            <span>
              Actual <b className="num">{displayValue(event.actual)}</b>
            </span>
            <span>
              Forecast <b className="num">{displayValue(event.forecast)}</b>
            </span>
            <span>
              Previous <b className="num">{displayValue(event.previous)}</b>
            </span>
          </div>
        </div>

        <ImpactBadge impact={event.impact} />
      </div>
    </li>
  );
}

/** Chip multi-select with flags */
function MultiChipSelect<T extends string>({
  label,
  options,
  selected,
  onChange,
  kind = 'default',
}: {
  label: string;
  options: Array<{ value: T; label: string; emoji?: string }>;
  selected: T[];
  onChange: (next: T[]) => void;
  kind?: 'country' | 'impact' | 'default';
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = (value: T) => {
    if (selected.includes(value)) {
      if (selected.length === 1) return;
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const summary =
    selected.length === options.length
      ? 'All'
      : selected
          .map((v) => {
            const opt = options.find((o) => o.value === v);
            return opt?.label ?? v; // no data URL here
          })
          .join(', ');

  return (
    <div
      className={`econ-filter econ-filter-multi ${open ? 'is-open' : ''}`}
      ref={rootRef}
    >
      <span>{label}</span>
      <button
        type="button"
        className={`econ-multi-trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="econ-multi-summary">{summary}</span>
        <span className="econ-multi-caret">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="econ-multi-menu" role="listbox" aria-multiselectable="true">
          {options.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={checked}
                className={`econ-multi-option ${checked ? 'is-selected' : ''}`}
                data-impact={kind === 'impact' ? opt.value : undefined}
                onClick={() => toggle(opt.value)}
              >
                <span className="econ-multi-check">{checked ? '✓' : ''}</span>

                {kind === 'country' && opt.emoji && (
                  <img className="econ-flag-img" src={opt.emoji} alt="" width={16} height={12} />
                )}

                {kind === 'impact' && (
                  <>
                    <span className="econ-multi-impact-dot" />
                    <span className="econ-multi-impact-label">{opt.label}</span>
                  </>
                )}

                {kind !== 'impact' && <span>{opt.label}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function EconomicCalendar() {
  const saved = useMemo(() => loadSavedFilters(), []);

  const [countries, setCountries] = useState<string[]>(saved.countries);
  const [dateFilter, setDateFilter] =
    useState<EconomicCalendarDateFilter>(saved.dateFilter);
  const [impacts, setImpacts] = useState<ImpactLevel[]>(saved.impacts);

  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  // Persist filters for next open
  useEffect(() => {
    const payload: SavedFilters = { countries, dateFilter, impacts };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [countries, dateFilter, impacts]);

  // Live clock for countdown
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const load = useCallback(
    async (manual = false) => {
      if (manual) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        // Match your IPC: pass arrays if supported; otherwise join countries
        const result: EconomicEvent[] = await api.getEconomicCalendar({
          countries,
          date: dateFilter,
          impacts,
        });

        result.sort(
          (a, b) => Date.parse(a.eventTime) - Date.parse(b.eventTime),
        );
        setEvents(result);
        setUpdatedAt(Date.now());
      } catch (err) {
        console.error('[economic-calendar]', err);
        setError(
          err instanceof Error ? err.message : 'Could not load economic calendar',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [countries, dateFilter, impacts],
  );

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const nextEvent = useMemo(() => {
    return events.find((e) => Date.parse(e.eventTime) >= now.getTime());
  }, [events, now]);

  const nextMinutes = nextEvent
    ? getMinutesUntil(nextEvent.eventTime, now)
    : null;

  const highCount = events.filter((e) => e.impact === 'high').length;
  const mediumCount = events.filter((e) => e.impact === 'medium').length;

  const countrySummaryLabel =
    countries.length === COUNTRIES.length
      ? 'All Countries'
      : countries.length === 1
        ? COUNTRIES.find((c) => c.code === countries[0])?.label ?? countries[0]
        : `${countries.length} countries`;

  return (
    <section className="econ-panel">
      <header className="econ-header">
        <div className="econ-title-wrap">
          <div className="econ-title-row">
            <span className="econ-title-icon">📅</span>
            <h2>Economic Calendar</h2>
          </div>
          <p>Economic releases · New York time</p>
        </div>

        <div className="econ-header-right">
          {updatedAt && (
            <span className="econ-updated">
              Updated{' '}
              {new Date(updatedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          <button
            type="button"
            className={`econ-refresh ${refreshing ? 'is-loading' : ''}`}
            onClick={() => void load(true)}
            disabled={refreshing}
            title="Refresh economic calendar"
          >
            ↻
          </button>
        </div>
      </header>

      <div className="econ-filters">
        <MultiChipSelect
          label="Country"
          kind="country"
          options={COUNTRIES.map((c) => ({
            value: c.code,
            label: c.label,
            emoji: getCountryFlagSrc(c.code), // used only as <img src>, not in summary text
          }))}
          selected={countries as Array<(typeof COUNTRIES)[number]['code']>}
          onChange={(next) => setCountries(next)}
        />

        <MultiChipSelect
          label="Impact"
          kind="impact"
          options={IMPACT_OPTIONS.map((i) => ({
            value: i.value,
            label: i.label, // Low / Medium / High
          }))}
          selected={impacts}
          onChange={setImpacts}
        />

        <label className="econ-filter">
          <span>Date</span>
          <select
            value={dateFilter}
            onChange={(e) =>
              setDateFilter(e.target.value as EconomicCalendarDateFilter)
            }
          >
            {DATE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <div className="econ-sort">
          <span>Sort</span>
          <strong>Nearest</strong>
        </div>
      </div>

      <div className="econ-summary">
        <div className="econ-summary-country">
          <span className="econ-summary-flag">
            {countries.length === 1 && getCountryFlagSrc(countries[0]) ? (
              <img
                className="econ-flag-img econ-summary-flag"
                src={getCountryFlagSrc(countries[0])}
                alt={countries[0]}
                width={16}
                height={12}
              />
            ) : (
              <span className="econ-summary-flag">🌎</span>
            )}
          </span>
          <strong>{countrySummaryLabel}</strong>
          <span className="econ-summary-date">{formatDateHeading(events)}</span>
        </div>
        <div className="econ-summary-stats">
          {highCount > 0 && (
            <span className="econ-stat econ-stat-high">🔴 {highCount} High</span>
          )}
          {mediumCount > 0 && (
            <span className="econ-stat econ-stat-medium">
              🟡 {mediumCount} Medium
            </span>
          )}
          <span className="econ-stat">{events.length} Events</span>
        </div>
      </div>

      {nextEvent && nextMinutes !== null && (
        <div className="econ-next">
          <span className="econ-next-label">NEXT</span>
          <span className="econ-next-time num">
            {formatTime(nextEvent.eventTime)}
          </span>
          <span className="econ-next-countdown num">
            {formatCountdown(nextMinutes)}
          </span>
          <span className="econ-next-name">{nextEvent.event}</span>
          <span className="econ-next-flag">
            {getCountryFlagSrc(nextEvent.countryCode) ? (
              <img
                className="econ-flag-img econ-next-flag"
                src={getCountryFlagSrc(nextEvent.countryCode)}
                alt={nextEvent.countryCode}
                width={16}
                height={12}
              />
            ) : null}
          </span>
          <ImpactBadge impact={nextEvent.impact} />
        </div>
      )}

      <div className="econ-body">
        {loading ? (
          <div className="econ-loading">
            <div className="spinner" />
            <span>Loading economic calendar…</span>
          </div>
        ) : error ? (
          <div className="econ-empty">
            <strong>Economic calendar unavailable</strong>
            <span>{error}</span>
            <button type="button" onClick={() => void load(true)}>
              Retry
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="econ-empty">
            <strong>No economic events found</strong>
            <span>Try another country, date, or impact filter.</span>
          </div>
        ) : (
          <ul className="econ-list">
            {events.map((event, index) => (
              <EventRow
                key={event.id}
                event={event}
                index={index}
                now={now}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
