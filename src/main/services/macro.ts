import type { ChartRange, MacroOverlayKey, MacroOverlayPoint, MacroOverlaySeries } from '../../shared/types';
import { sampleChart } from './sample';
import { fetchText } from './http';
import { fetchYahooChart } from './yahoo';

const FRED_TTL_MS = 6 * 60 * 60_000;
const MARKET_TTL_MS = 2 * 60_000;

interface MacroSpec {
  label: string;
  unit: string;
  fredId: string;
}

const SPECS: Record<Exclude<MacroOverlayKey, 'vix' | 'oil'>, MacroSpec> = {
  jobs: {
    label: 'US job growth',
    unit: 'monthly payroll change, thousands',
    fredId: 'PAYEMS',
  },
  unemployment: {
    label: 'US unemployment',
    unit: 'percent',
    fredId: 'UNRATE',
  },
  inflation: {
    label: 'US inflation',
    unit: 'CPI year-over-year, percent',
    fredId: 'CPIAUCSL',
  },
  treasury10y: {
    label: '10Y Treasury yield',
    unit: 'percent',
    fredId: 'DGS10',
  },
};

function rangeStartMs(range: ChartRange): number {
  const now = Date.now();
  const day = 86_400_000;
  const hour = 3_600_000;
  switch (range) {
    case '1m':   return now - 2 * hour;      // 1-minute: last 2 hours
    case '5m':   return now - 6 * hour;      // 5-minute: last 6 hours
    case '30m':  return now - 2 * day;       // 30-minute: last 2 days
    case '60m':  return now - 5 * day;       // 60-minute: last 5 days
    case '1d':   return now - 14 * day;
    case '3d':   return now - 10 * day;
    case '1W':   return now - 21 * day;      // was '1w'
    case '1M':   return now - 90 * day;      // was '1m' (month)
    case '3M':   return now - 150 * day;     // was '3m'
    case '6M':   return now - 240 * day;     // was '6m'
    case '1Y':   return now - 500 * day;     // was '1y'
    case 'max':  return now - 20 * 365 * day;
  }
}

function parseFredCsv(csv: string): Array<{ time: number; value: number }> {
  const rows = csv.trim().split(/\r?\n/).slice(1);
  const out: Array<{ time: number; value: number }> = [];
  for (const row of rows) {
    const [date, rawValue] = row.split(',');
    const value = Number(rawValue);
    const ms = Date.parse(`${date}T13:30:00Z`);
    if (!Number.isFinite(value) || !Number.isFinite(ms)) continue;
    out.push({ time: Math.floor(ms / 1000), value });
  }
  return out;
}

function monthlyChanges(points: Array<{ time: number; value: number }>): MacroOverlayPoint[] {
  const out: MacroOverlayPoint[] = [];
  for (let i = 1; i < points.length; i++) {
    out.push({ time: points[i].time, value: Math.round((points[i].value - points[i - 1].value) * 10) / 10 });
  }
  return out;
}

function yearOverYearPercent(points: Array<{ time: number; value: number }>): MacroOverlayPoint[] {
  const out: MacroOverlayPoint[] = [];
  for (let i = 12; i < points.length; i++) {
    const prev = points[i - 12].value;
    if (prev === 0) continue;
    out.push({
      time: points[i].time,
      value: Math.round(((points[i].value - prev) / prev) * 10_000) / 100,
    });
  }
  return out;
}

function fallbackSeries(key: MacroOverlayKey, range: ChartRange): MacroOverlaySeries {
  const chart = sampleChart(key === 'vix' ? 'VIX' : key === 'oil' ? 'USO' : 'SPY', range);
  const base =
    key === 'jobs'
      ? 175
      : key === 'unemployment'
        ? 4.1
        : key === 'inflation'
          ? 3.2
          : key === 'treasury10y'
            ? 4.1
            : key === 'oil'
              ? 78
              : 18;
  const label =
    key === 'jobs'
      ? 'US job growth'
      : key === 'unemployment'
        ? 'US unemployment'
        : key === 'inflation'
          ? 'US inflation'
          : key === 'treasury10y'
            ? '10Y Treasury yield'
            : key === 'oil'
              ? 'WTI crude oil'
              : 'VIX volatility';
  const unit =
    key === 'jobs'
      ? 'monthly payroll change, thousands'
      : key === 'oil'
        ? 'USD/barrel'
        : key === 'vix'
          ? 'index'
          : 'percent';
  return {
    key,
    label,
    unit,
    sourceName: 'Sample Data',
    source: 'sample',
    points: chart.candles
      .filter((_, i) => i % Math.max(1, Math.floor(chart.candles.length / 60)) === 0)
      .map((c, i) => ({
        time: c.time,
        value:
          Math.round(
            (base +
              Math.sin(i / 4) *
                (key === 'jobs' ? 70 : key === 'vix' ? 4 : key === 'oil' ? 8 : 0.25)) *
              100,
          ) / 100,
      })),
  };
}

async function getFredOverlay(
  key: Exclude<MacroOverlayKey, 'vix' | 'oil'>,
  range: ChartRange,
): Promise<MacroOverlaySeries> {
  const spec = SPECS[key];
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(spec.fredId)}`;
  const csv = await fetchText(url, { ttlMs: FRED_TTL_MS, timeoutMs: 12_000 });
  const startSec = Math.floor(rangeStartMs(range) / 1000);
  const parsed = parseFredCsv(csv);
  const points =
    key === 'jobs'
      ? monthlyChanges(parsed)
      : key === 'inflation'
        ? yearOverYearPercent(parsed)
        : parsed.map((p) => ({ time: p.time, value: p.value }));
  return {
    key,
    label: spec.label,
    unit: spec.unit,
    sourceName: 'FRED',
    source: 'live',
    points: points.filter((p) => p.time >= startSec),
  };
}

function yahooRangeFor(range: ChartRange): { yahooRange: string; interval: string } 
{
  switch (range) {
    // Intraday
    case '1m':  return { yahooRange: '1d',  interval: '1m' };
    case '5m':  return { yahooRange: '5d',  interval: '5m' };
    case '30m': return { yahooRange: '1mo',  interval: '30m' };
    case '60m': return { yahooRange: '1mo', interval: '60m' };

    // Short-term
    case '1d':  return { yahooRange: '1d',  interval: '5m' };
    case '3d':  return { yahooRange: '5d',  interval: '15m' };

    // Multi-day / Multi-month / Yearly
    case '1W':  return { yahooRange: '5d', interval: '30m' };
    case '1M':  return { yahooRange: '1mo', interval: '60m' };
    case '3M':  return { yahooRange: '3mo', interval: '1d' };
    case '6M':  return { yahooRange: '6mo',  interval: '1d' };
    case '1Y':  return { yahooRange: '1y',  interval: '1d' };
    case 'max': return { yahooRange: 'max', interval: '1wk' };
  }
}

async function getYahooOverlay(
  key: Extract<MacroOverlayKey, 'vix' | 'oil'>,
  range: ChartRange,
): Promise<MacroOverlaySeries> {
  const { yahooRange, interval } = yahooRangeFor(range);
  const result = await fetchYahooChart(key === 'vix' ? '^VIX' : 'CL=F', yahooRange, interval, MARKET_TTL_MS);
  const quote = result.indicators?.quote?.[0];
  const timestamps = result.timestamp ?? [];
  const closes = quote?.close ?? [];
  const points: MacroOverlayPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const time = timestamps[i];
    const value = closes[i];
    if (typeof time === 'number' && typeof value === 'number' && Number.isFinite(value)) {
      points.push({ time: Math.floor(time), value: Math.round(value * 100) / 100 });
    }
  }
  if (points.length === 0) throw new Error(`${key} overlay returned no points`);
  return {
    key,
    label: key === 'vix' ? 'VIX volatility' : 'WTI crude oil',
    unit: key === 'vix' ? 'index' : 'USD/barrel',
    sourceName: 'Yahoo Finance',
    source: 'live',
    points,
  };
}

export async function getMacroOverlay(
  key: MacroOverlayKey,
  range: ChartRange,
): Promise<MacroOverlaySeries> {
  try {
    if (key === 'vix' || key === 'oil') return await getYahooOverlay(key, range);
    return await getFredOverlay(key, range);
  } catch {
    return fallbackSeries(key, range);
  }
}
