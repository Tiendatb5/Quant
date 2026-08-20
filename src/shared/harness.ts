import type { QuantEvidenceItem, QuantInsightRequest } from './types';

/** Builds the immutable, numbered evidence snapshot shared by every model worker. */
export function buildQuantEvidence(req: QuantInsightRequest): QuantEvidenceItem[] {
  const evidence: QuantEvidenceItem[] = [];
  const add = (item: Omit<QuantEvidenceItem, 'id'>) => {
    evidence.push({ id: `E${evidence.length + 1}`, ...item });
  };
  const evaluation = req.evaluation;
  add({
    category: 'signal',
    label: 'Deterministic signal decision',
    value: `${evaluation.decision}; ${evaluation.setupType}; confidence ${evaluation.confidence}/100; regime ${evaluation.regime}`,
    source: evaluation.strategyVersion,
    observedAt: evaluation.evaluatedAt,
    quality: 'verified',
  });
  add({
    category: 'risk',
    label: 'Deterministic risk plan',
    value: `entry ${evaluation.risk.entry}; stop ${evaluation.risk.stop}; targets ${evaluation.risk.target1}/${evaluation.risk.target2}; ${evaluation.risk.rewardRisk1}R; size ${evaluation.risk.positionSize}; max loss ${evaluation.risk.maxDollarLoss}`,
    source: evaluation.strategyVersion,
    observedAt: evaluation.evaluatedAt,
    quality: evaluation.risk.positionSize > 0 ? 'verified' : 'warning',
  });
  add({
    category: 'signal',
    label: 'Signal components',
    value: evaluation.components
      .map((component) => `${component.name}: ${component.status} (${component.score >= 0 ? '+' : ''}${component.score})`)
      .join('; '),
    source: evaluation.strategyVersion,
    observedAt: evaluation.evaluatedAt,
    quality: 'verified',
  });
  add({
    category: 'risk',
    label: 'No-trade blockers',
    value: evaluation.noTradeReasons.join('; ') || 'none',
    source: evaluation.strategyVersion,
    observedAt: evaluation.evaluatedAt,
    quality: evaluation.noTradeReasons.length ? 'warning' : 'verified',
  });
  if (req.signalValidation && req.signalValidation.status === 'ready') {
    const val = req.signalValidation;
    const ciText = val.expectancyCi95
      ? `; 95% CI [${val.expectancyCi95.lower}R, ${val.expectancyCi95.upper}R]`
      : '';
    add({
      category: 'market',
      label: 'Setup-specific historical replay (V2)',
      value: `${val.eligibleTrades} trades; win rate ${val.winRatePercent}%; expectancy ${val.expectancyR >= 0 ? '+' : ''}${val.expectancyR}R${ciText}; profit factor ${val.profitFactor}; sample ${val.evidenceStrength}`,
      source: `${val.strategyVersion} (${val.executionModelVersion})`,
      observedAt: val.historyEnd,
      quality: val.eligibleTrades >= 15 ? 'verified' : 'warning',
    });
  } else {
    add({
      category: 'market',
      label: 'Historical strategy check',
      value: `${evaluation.backtest.totalTrades} trades; win ${evaluation.backtest.winRate}%; expectancy ${evaluation.backtest.expectancy}R; profit factor ${evaluation.backtest.profitFactor}; max drawdown ${evaluation.backtest.maxDrawdown}R`,
      source: `${evaluation.backtest.strategyName} ${evaluation.backtest.strategyVersion}`,
      observedAt: evaluation.evaluatedAt,
      quality: evaluation.backtest.totalTrades >= 20 ? 'verified' : 'warning',
    });
  }
  if (req.forwardSignalRecord && req.forwardSignalRecord.resolvedSignals > 0) {
    const fwd = req.forwardSignalRecord;
    add({
      category: 'market',
      label: 'Forward signal record (V2)',
      value: `${fwd.resolvedSignals} resolved trades; win rate ${fwd.winRatePercent ?? 'n/a'}%; expectancy ${fwd.expectancyR !== null ? `${fwd.expectancyR >= 0 ? '+' : ''}${fwd.expectancyR}R` : 'n/a'}; active ${fwd.activeSignals}`,
      source: 'quant-signal-outcomes-v1',
      observedAt: fwd.lastResolvedAt,
      quality: fwd.resolvedSignals >= 10 ? 'verified' : 'warning',
    });
  }
  if (req.earnings) {
    add({
      category: 'earnings',
      label: 'Earnings context',
      value: `upcoming ${req.earnings.date} ${req.earnings.time}; estimate ${req.earnings.epsEstimate ?? 'n/a'}; latest actual ${req.earnings.epsActual ?? 'n/a'}; surprise ${req.earnings.epsSurprisePercent ?? 'n/a'}%`,
      source: req.earnings.source,
      observedAt: req.earnings.latestReportedDate ?? req.earnings.date,
      quality: req.earnings.source === 'live' ? 'verified' : 'warning',
    });
  }
  if (req.valuation) {
    add({
      category: 'valuation',
      label: 'Valuation snapshot',
      value: `price ${req.valuation.price ?? 'n/a'}; P/E ${req.valuation.trailingPe ?? 'n/a'}; forward P/E ${req.valuation.forwardPe ?? 'n/a'}; P/S ${req.valuation.priceToSales ?? 'n/a'}; margin ${req.valuation.profitMargin ?? 'n/a'}; revenue growth ${req.valuation.revenueGrowth ?? 'n/a'}`,
      source: req.valuation.source,
      quality: req.valuation.source === 'live' ? 'verified' : 'warning',
    });
  }
  for (const series of (req.macroOverlays ?? []).slice(0, 6)) {
    const last = series.points[series.points.length - 1];
    add({
      category: 'macro',
      label: series.label,
      value: last ? `${last.value} ${series.unit}` : 'unavailable',
      source: `${series.sourceName}; ${series.source}`,
      observedAt: last ? new Date(last.time * 1000).toISOString() : undefined,
      quality: last && series.source === 'live' ? 'verified' : 'warning',
    });
  }
  for (const item of req.news.slice(0, 6)) {
    add({
      category: 'news',
      label: 'Untrusted headline',
      value: `[${item.relatedSymbol}] ${item.title}`,
      source: item.sourceName,
      observedAt: item.publishedAt,
      quality: 'warning',
    });
  }
  return evidence;
}
