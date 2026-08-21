// Pure execution simulator for daily OHLC bars.
// Models next-open entries, adverse gap slippage, pre-entry gap invalidations,
// conservative same-bar stop priority, and timeout exits. Zero I/O, zero external dependencies.

import type { Candle } from './types';
import type {
  MarketRegime,
  RiskSettings,
  SetupType,
  TradeDirection,
} from './quant';
import { DEFAULT_RISK_SETTINGS } from './quant';
import type {
  SimulatedTrade,
  SkippedSignal,
} from './signalV2';
import { SIGNAL_ENGINE_V2 } from './signalV2';

export interface ExecutionSimulatorConfig {
  strategyVersion: string;
  executionModelVersion: string;
  maxHoldBars: number;
  entrySlippageBps: number;
  exitSlippageBps: number;
  commissionBpsPerSide: number;
  minimumRewardRisk: number;
}

export const DEFAULT_EXECUTION_CONFIG: ExecutionSimulatorConfig = {
  strategyVersion: SIGNAL_ENGINE_V2.strategyVersion,
  executionModelVersion: SIGNAL_ENGINE_V2.executionModelVersion,
  maxHoldBars: SIGNAL_ENGINE_V2.maxHoldBars,
  entrySlippageBps: SIGNAL_ENGINE_V2.entrySlippageBps,
  exitSlippageBps: SIGNAL_ENGINE_V2.exitSlippageBps,
  commissionBpsPerSide: SIGNAL_ENGINE_V2.commissionBpsPerSide,
  minimumRewardRisk: DEFAULT_RISK_SETTINGS.minimumRewardRisk,
};

export interface SimulateTradeParams {
  signalIndex: number;
  signalCandle: Candle;
  subsequentCandles: Candle[]; // candles starting at signalIndex + 1
  setupType: SetupType;
  direction: TradeDirection;
  regime: MarketRegime;
  plannedStop: number;
  plannedTarget1: number;
  config?: Partial<ExecutionSimulatorConfig>;
  riskSettings?: Partial<RiskSettings>;
}

export type SimulatedTradeResult =
  | { kind: 'trade'; trade: SimulatedTrade }
  | { kind: 'skipped'; skipped: SkippedSignal };

export function simulateTrade(params: SimulateTradeParams): SimulatedTradeResult | null {
  const {
    signalIndex,
    signalCandle,
    subsequentCandles,
    setupType,
    direction,
    regime,
    plannedStop: stop,
    plannedTarget1: target1,
  } = params;

  if (direction !== 'long' && direction !== 'short') {
    return null;
  }

  const config: ExecutionSimulatorConfig = {
    ...DEFAULT_EXECUTION_CONFIG,
    ...params.config,
    minimumRewardRisk:
      params.riskSettings?.minimumRewardRisk ??
      params.config?.minimumRewardRisk ??
      DEFAULT_EXECUTION_CONFIG.minimumRewardRisk,
  };

  if (subsequentCandles.length === 0) {
    return null;
  }

  const nextBar = subsequentCandles[0];
  const nextOpen = nextBar.open;
  const entrySlippageRate = config.entrySlippageBps / 10_000;
  const exitSlippageRate = config.exitSlippageBps / 10_000;

  // 1. Pre-entry gap invalidations
  if (direction === 'long') {
    if (nextOpen <= stop) {
      return {
        kind: 'skipped',
        skipped: {
          signalIndex,
          signalBarTime: signalCandle.time,
          reason: 'gap-invalidated',
        },
      };
    }
    if (nextOpen >= target1) {
      return {
        kind: 'skipped',
        skipped: {
          signalIndex,
          signalBarTime: signalCandle.time,
          reason: 'gap-beyond-target',
        },
      };
    }
  } else {
    if (nextOpen >= stop) {
      return {
        kind: 'skipped',
        skipped: {
          signalIndex,
          signalBarTime: signalCandle.time,
          reason: 'gap-invalidated',
        },
      };
    }
    if (nextOpen <= target1) {
      return {
        kind: 'skipped',
        skipped: {
          signalIndex,
          signalBarTime: signalCandle.time,
          reason: 'gap-beyond-target',
        },
      };
    }
  }

  // 2. Entry fill with entry slippage
  const entryFill =
    direction === 'long'
      ? nextOpen * (1 + entrySlippageRate)
      : nextOpen * (1 - entrySlippageRate);

  const initialRiskPerUnit = Math.abs(entryFill - stop);
  if (initialRiskPerUnit <= 0) {
    return null;
  }

  // 3. Recheck actual reward/risk
  const actualReward = Math.abs(target1 - entryFill);
  const actualRR = actualReward / initialRiskPerUnit;
  if (actualRR < config.minimumRewardRisk) {
    return {
      kind: 'skipped',
      skipped: {
        signalIndex,
        signalBarTime: signalCandle.time,
        reason: 'rr-invalidated',
      },
    };
  }

  // 4. Bar-by-bar exit evaluation
  const barsToExamine = Math.min(subsequentCandles.length, config.maxHoldBars);
  let exitBarIndex = -1;
  let exitBar: Candle | null = null;
  let exitFill = 0;
  let exitReason: 'target1' | 'stop' | 'timeout' = 'timeout';

  for (let offset = 0; offset < barsToExamine; offset++) {
    const bar = subsequentCandles[offset];
    const isTimeoutBar = offset === config.maxHoldBars - 1;

    if (direction === 'long') {
      // 1. Adverse gap at open
      if (bar.open <= stop) {
        exitFill = bar.open * (1 - exitSlippageRate);
        exitReason = 'stop';
        exitBarIndex = signalIndex + 1 + offset;
        exitBar = bar;
        break;
      }
      // 2. Favorable gap at open
      if (bar.open >= target1) {
        exitFill = target1 * (1 - exitSlippageRate);
        exitReason = 'target1';
        exitBarIndex = signalIndex + 1 + offset;
        exitBar = bar;
        break;
      }
      // 3. Intraday touch checks
      const stopTouched = bar.low <= stop;
      const targetTouched = bar.high >= target1;

      if (stopTouched && targetTouched) {
        // Conservative policy: stop first
        exitFill = stop * (1 - exitSlippageRate);
        exitReason = 'stop';
        exitBarIndex = signalIndex + 1 + offset;
        exitBar = bar;
        break;
      }
      if (stopTouched) {
        exitFill = stop * (1 - exitSlippageRate);
        exitReason = 'stop';
        exitBarIndex = signalIndex + 1 + offset;
        exitBar = bar;
        break;
      }
      if (targetTouched) {
        exitFill = target1 * (1 - exitSlippageRate);
        exitReason = 'target1';
        exitBarIndex = signalIndex + 1 + offset;
        exitBar = bar;
        break;
      }
      // 4. Max hold timeout on final bar
      if (isTimeoutBar) {
        exitFill = bar.close * (1 - exitSlippageRate);
        exitReason = 'timeout';
        exitBarIndex = signalIndex + 1 + offset;
        exitBar = bar;
        break;
      }
    } else {
      // Short direction
      // 1. Adverse gap at open
      if (bar.open >= stop) {
        exitFill = bar.open * (1 + exitSlippageRate);
        exitReason = 'stop';
        exitBarIndex = signalIndex + 1 + offset;
        exitBar = bar;
        break;
      }
      // 2. Favorable gap at open
      if (bar.open <= target1) {
        exitFill = target1 * (1 + exitSlippageRate);
        exitReason = 'target1';
        exitBarIndex = signalIndex + 1 + offset;
        exitBar = bar;
        break;
      }
      // 3. Intraday touch checks
      const stopTouched = bar.high >= stop;
      const targetTouched = bar.low <= target1;

      if (stopTouched && targetTouched) {
        // Conservative policy: stop first
        exitFill = stop * (1 + exitSlippageRate);
        exitReason = 'stop';
        exitBarIndex = signalIndex + 1 + offset;
        exitBar = bar;
        break;
      }
      if (stopTouched) {
        exitFill = stop * (1 + exitSlippageRate);
        exitReason = 'stop';
        exitBarIndex = signalIndex + 1 + offset;
        exitBar = bar;
        break;
      }
      if (targetTouched) {
        exitFill = target1 * (1 + exitSlippageRate);
        exitReason = 'target1';
        exitBarIndex = signalIndex + 1 + offset;
        exitBar = bar;
        break;
      }
      // 4. Max hold timeout on final bar
      if (isTimeoutBar) {
        exitFill = bar.close * (1 + exitSlippageRate);
        exitReason = 'timeout';
        exitBarIndex = signalIndex + 1 + offset;
        exitBar = bar;
        break;
      }
    }
  }

  // If subsequent candles ran out before maxHoldBars without triggering exit:
  if (!exitBar || exitBarIndex < 0) {
    return null; // trade is still active/unresolved
  }

  // 5. R & fee calculation
  const grossR =
    direction === 'long'
      ? (exitFill - entryFill) / initialRiskPerUnit
      : (entryFill - exitFill) / initialRiskPerUnit;

  const commissionRate = config.commissionBpsPerSide / 10_000;
  const feesDollarPerUnit = (entryFill + exitFill) * commissionRate;
  const feeR = feesDollarPerUnit / initialRiskPerUnit;
  const netR = grossR - feeR;

  const holdingBars = exitBarIndex - signalIndex;

  const trade: SimulatedTrade = {
    strategyVersion: config.strategyVersion,
    setupType,
    direction,
    regime,
    signalIndex,
    signalBarTime: signalCandle.time,
    entryIndex: signalIndex + 1,
    entryTime: nextBar.time,
    entryFill,
    stop,
    target1,
    initialRiskPerUnit,
    exitIndex: exitBarIndex,
    exitTime: exitBar.time,
    exitFill,
    exitReason,
    holdingBars,
    grossR,
    feeR,
    netR,
  };

  return { kind: 'trade', trade };
}
