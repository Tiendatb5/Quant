// chart:get — candles from Yahoo's v8 chart endpoint with clean ascending
// candles (null closes skipped, OHLC sanity-clamped). Any failure falls
// back to the deterministic sample walk, flagged source 'sample'.

import type { Candle, ChartData, ChartRange } from '../../shared/types';
import { sampleChart } from './sample';
import { fetchYahooChart } from './yahoo';

interface RangeSpec {
  yahooRange: string;
  interval: string;
  ttlMs: number;
}

const INTRADAY_TTL = 60_000;
const DAILY_TTL = 10 * 60_000;

const RANGE_MAP: Record<ChartRange, RangeSpec> = {
  // Intraday
  '1m':  { yahooRange: '1d',  interval: '1m',  ttlMs: INTRADAY_TTL },
  '5m':  { yahooRange: '5d',  interval: '5m',  ttlMs: INTRADAY_TTL },
  '30m': { yahooRange: '1mo', interval: '30m', ttlMs: INTRADAY_TTL },
  '60m': { yahooRange: '1mo', interval: '60m', ttlMs: INTRADAY_TTL },

  // Multi-day / session
  '1d':  { yahooRange: '1d',  interval: '5m',  ttlMs: INTRADAY_TTL },
  '3d':  { yahooRange: '5d',  interval: '15m', ttlMs: INTRADAY_TTL },
  '1W':  { yahooRange: '5d',  interval: '30m', ttlMs: INTRADAY_TTL },

  // Longer horizons
  '1M':  { yahooRange: '1mo', interval: '60m', ttlMs: INTRADAY_TTL },
  '3M':  { yahooRange: '3mo', interval: '1d',  ttlMs: DAILY_TTL },
  '6M':  { yahooRange: '6mo', interval: '1d',  ttlMs: DAILY_TTL },
  '1Y':  { yahooRange: '1y',  interval: '1d',  ttlMs: DAILY_TTL },
  max:   { yahooRange: 'max', interval: '1wk', ttlMs: DAILY_TTL },
};

function isFiniteNumber(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function yahooResultToCandles(result: import('./yahoo').YahooChartResult): Candle[] {
  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const opens = quote.open ?? [];
  const highs = quote.high ?? [];
  const lows = quote.low ?? [];
  const closes = quote.close ?? [];
  const volumes = quote.volume ?? [];

  const bySecond = new Map<number, Candle>();
  for (let i = 0; i < timestamps.length; i++) {
    const time = timestamps[i];
    const close = closes[i];
    if (!isFiniteNumber(time) || !isFiniteNumber(close)) continue;
    const rawOpen = opens[i];
    const rawHigh = highs[i];
    const rawLow = lows[i];
    const rawVolume = volumes[i];
    const open = isFiniteNumber(rawOpen) ? rawOpen : close;
    let high = isFiniteNumber(rawHigh) ? rawHigh : Math.max(open, close);
    let low = isFiniteNumber(rawLow) ? rawLow : Math.min(open, close);
    high = Math.max(high, open, close);
    low = Math.min(low, open, close);
    const volume = isFiniteNumber(rawVolume) ? rawVolume : 0;
    // last write wins for duplicate timestamps (Yahoo repeats the live bar)
    bySecond.set(Math.floor(time), { time: Math.floor(time), open, high, low, close, volume });
  }

  return [...bySecond.values()].sort((a, b) => a.time - b.time);
}

export async function getChart(symbol: string, range: ChartRange): Promise<ChartData> {
  const spec = RANGE_MAP[range];
  try {
    const result = await fetchYahooChart(symbol, spec.yahooRange, spec.interval, spec.ttlMs);
    const meta = result.meta ?? {};
    const candles = yahooResultToCandles(result);
    if (candles.length === 0) throw new Error(`no usable candles for ${symbol} ${range}`);

    return {
      symbol,
      range,
      interval: spec.interval,
      candles,
      currency: typeof meta.currency === 'string' && meta.currency ? meta.currency : 'USD',
      exchangeName:
        typeof meta.exchangeName === 'string' && meta.exchangeName
          ? meta.exchangeName
          : undefined,
      regularMarketPrice: isFiniteNumber(meta.regularMarketPrice)
        ? meta.regularMarketPrice
        : null,
      previousClose: isFiniteNumber(meta.chartPreviousClose)
        ? meta.chartPreviousClose
        : isFiniteNumber(meta.previousClose)
          ? meta.previousClose
          : null,
      source: 'live',
    };
  } catch {
    return sampleChart(symbol, range);
  }
}
