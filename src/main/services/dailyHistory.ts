// dailyHistory: fetches 5-year daily history (5y / 1d) from Yahoo Finance
// for causal historical replay and Signal Engine V2 validation.
// Strict policy: live data only. Never falls back to sample/mock candles.

import type { Candle } from '../../shared/types';
import { fetchYahooChart } from './yahoo';
import { yahooResultToCandles } from './chart';

export interface DailyHistoryResult {
  symbol: string;
  candles: Candle[];
  source: 'live' | 'unavailable';
  interval: '1d';
  asOf?: string;
  warning?: string;
}

const MIN_VALIDATION_BARS = 250;
const DAILY_TTL_MS = 10 * 60_000;

export async function getDailyHistory(symbolRaw: string): Promise<DailyHistoryResult> {
  const symbol = symbolRaw.trim().toUpperCase();
  if (!symbol) {
    return {
      symbol: '',
      candles: [],
      source: 'unavailable',
      interval: '1d',
      warning: 'Invalid symbol.',
    };
  }

  try {
    const result = await fetchYahooChart(symbol, '5y', '1d', DAILY_TTL_MS);
    const candles = yahooResultToCandles(result);
    if (candles.length < MIN_VALIDATION_BARS) {
      return {
        symbol,
        candles: [],
        source: 'unavailable',
        interval: '1d',
        warning: `Historical validation requires at least ${MIN_VALIDATION_BARS} daily bars (received ${candles.length}).`,
      };
    }

    const lastCandle = candles[candles.length - 1];
    const asOf = lastCandle ? new Date(lastCandle.time * 1000).toISOString() : undefined;

    return {
      symbol,
      candles,
      source: 'live',
      interval: '1d',
      asOf,
    };
  } catch (error) {
    return {
      symbol,
      candles: [],
      source: 'unavailable',
      interval: '1d',
      warning: error instanceof Error ? error.message : 'Live daily history is unavailable.',
    };
  }
}
