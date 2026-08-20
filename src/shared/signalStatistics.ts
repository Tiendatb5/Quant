// Deterministic trade statistics, bootstrap expectancy confidence intervals,
// Wilson win-rate score intervals, and evidence strength classification. Zero external dependencies.

import type {
  ConfidenceInterval,
  SignalEvidenceStrength,
  SimulatedTrade,
  SkippedSignal,
} from './signalV2';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function stringToSeed(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function calculateBootstrapExpectancyCi(
  rValues: number[],
  seedString: string,
  samples = 2000,
): ConfidenceInterval | null {
  const n = rValues.length;
  if (n < 10) return null;

  const prng = mulberry32(stringToSeed(seedString));
  const means: number[] = new Array(samples);

  for (let b = 0; b < samples; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(prng() * n);
      sum += rValues[idx];
    }
    means[b] = sum / n;
  }

  means.sort((a, b) => a - b);
  const lowerIndex = Math.floor((samples - 1) * 0.025);
  const upperIndex = Math.floor((samples - 1) * 0.975);

  return {
    lower: round(means[lowerIndex], 2),
    upper: round(means[upperIndex], 2),
  };
}

export function calculateWilsonWinRateCi(
  wins: number,
  n: number,
  z = 1.96,
): ConfidenceInterval | null {
  if (n <= 0) return null;
  const p = wins / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const variance = (p * (1 - p) + z2 / (4 * n)) / n;
  const margin = (z / denom) * Math.sqrt(Math.max(0, variance));

  const lowerFraction = Math.max(0, center - margin);
  const upperFraction = Math.min(1, center + margin);

  return {
    lower: round(lowerFraction * 100, 1),
    upper: round(upperFraction * 100, 1),
  };
}

export function classifyEvidenceStrength(tradeCount: number): SignalEvidenceStrength {
  if (tradeCount <= 0) return 'insufficient';
  if (tradeCount < 15) return 'insufficient';
  if (tradeCount < 30) return 'thin';
  if (tradeCount < 80) return 'usable';
  return 'large-sample';
}

export interface TradeMetricsResult {
  totalMatchingSignals: number;
  eligibleTrades: number;
  skippedSignals: number;
  targetHits: number;
  stopHits: number;
  timeouts: number;
  winRatePercent: number;
  targetHitRatePercent: number;
  averageWinR: number;
  averageLossR: number;
  expectancyR: number;
  medianR: number;
  profitFactor: number;
  maxDrawdownR: number;
  bestTradeR: number;
  worstTradeR: number;
  expectancyCi95: ConfidenceInterval | null;
  winRateCi95: ConfidenceInterval | null;
  evidenceStrength: SignalEvidenceStrength;
}

export function calculateTradeMetrics(
  trades: SimulatedTrade[],
  skippedCount: number,
  seedKey: string,
): TradeMetricsResult {
  const eligibleTrades = trades.length;
  const totalMatchingSignals = eligibleTrades + skippedCount;
  const rValues = trades.map((t) => t.netR);

  const wins = rValues.filter((r) => r > 0);
  const losses = rValues.filter((r) => r < 0);

  const targetHits = trades.filter((t) => t.exitReason === 'target1').length;
  const stopHits = trades.filter((t) => t.exitReason === 'stop').length;
  const timeouts = trades.filter((t) => t.exitReason === 'timeout').length;

  const winRatePercent = eligibleTrades > 0 ? round((wins.length / eligibleTrades) * 100, 1) : 0;
  const targetHitRatePercent = eligibleTrades > 0 ? round((targetHits / eligibleTrades) * 100, 1) : 0;

  const averageWinR = wins.length > 0 ? round(mean(wins), 2) : 0;
  const averageLossR = losses.length > 0 ? round(Math.abs(mean(losses)), 2) : 0;

  const expectancyR = eligibleTrades > 0 ? round(mean(rValues), 2) : 0;
  const medianR = eligibleTrades > 0 ? round(median(rValues), 2) : 0;

  const grossProfitR = wins.reduce((sum, r) => sum + r, 0);
  const grossLossR = Math.abs(losses.reduce((sum, r) => sum + r, 0));
  const profitFactor =
    grossLossR > 0
      ? round(Math.min(99, grossProfitR / grossLossR), 2)
      : grossProfitR > 0
        ? 99
        : 0;

  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const r of rValues) {
    equity += r;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  const maxDrawdownR = round(maxDrawdown, 2);

  const bestTradeR = eligibleTrades > 0 ? round(Math.max(...rValues), 2) : 0;
  const worstTradeR = eligibleTrades > 0 ? round(Math.min(...rValues), 2) : 0;

  const expectancyCi95 = calculateBootstrapExpectancyCi(rValues, seedKey);
  const winRateCi95 = calculateWilsonWinRateCi(wins.length, eligibleTrades);
  const evidenceStrength = classifyEvidenceStrength(eligibleTrades);

  return {
    totalMatchingSignals,
    eligibleTrades,
    skippedSignals: skippedCount,
    targetHits,
    stopHits,
    timeouts,
    winRatePercent,
    targetHitRatePercent,
    averageWinR,
    averageLossR,
    expectancyR,
    medianR,
    profitFactor,
    maxDrawdownR,
    bestTradeR,
    worstTradeR,
    expectancyCi95,
    winRateCi95,
    evidenceStrength,
  };
}
