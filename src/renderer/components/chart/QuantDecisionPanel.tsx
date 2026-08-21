import { useEffect, useState } from 'react';
import type {
  ChartRange,
  DataSource,
  EarningsEvent,
  QuantJournalEntry,
  QuantJournalStatus,
  ValuationSnapshot,
} from '../../../shared/types';
import type { SignalEvaluation } from '../../../shared/quant';
import type {
  HistoricalValidationSummary,
  ForwardRecordSummary,
  SignalCoreEvaluation,
  SignalDeskResult,
} from '../../../shared/signalV2';
import { api } from '../../api';

function label(value: string): string {
  return value.replaceAll('-', ' ');
}

function fmt(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

function fmtMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  const abs = Math.abs(value).toFixed(2);
  return value < 0 ? `-$${abs}` : `$${abs}`;
}

export function QuantDecisionPanel({
  signalDesk,
  loading = false,
  evaluation: fallbackEvaluation,
  earnings,
  valuation,
  range,
  chartSource,
  chartAsOf,
}: {
  signalDesk?: SignalDeskResult | null;
  loading?: boolean;
  evaluation?: SignalEvaluation | null;
  earnings: EarningsEvent | null;
  valuation: ValuationSnapshot | null;
  range: ChartRange;
  chartSource?: DataSource;
  chartAsOf?: string;
}) {
  if (loading && !signalDesk) {
    return (
      <aside className="cm-quant" aria-label="Quant signal">
        <div className="cm-quant-head">
          <div>
            <h3>Signal Desk</h3>
            <p>Evaluating 1D price structure…</p>
          </div>
        </div>
      </aside>
    );
  }

  const evaluation: SignalCoreEvaluation | SignalEvaluation | null =
    signalDesk?.evaluation ?? fallbackEvaluation ?? null;
  const historical: HistoricalValidationSummary | null = signalDesk?.historical ?? null;
  const forward: ForwardRecordSummary | null = signalDesk?.forward ?? null;

  if (!evaluation || (signalDesk && signalDesk.status === 'unavailable' && !signalDesk.evaluation)) {
    return (
      <aside className="cm-quant" aria-label="Quant signal">
        <div className="cm-quant-head">
          <div>
            <h3>Signal Desk</h3>
            <p>1D daily validation unavailable</p>
          </div>
          <span className="cm-decision no-trade">UNAVAILABLE</span>
        </div>
        <p className="cm-signal-reason">
          {signalDesk?.warnings?.[0] ?? 'Live 5-year daily history is required for validated Signal Desk output.'}
        </p>
      </aside>
    );
  }

  const setupQuality =
    'setupQuality' in evaluation ? evaluation.setupQuality : evaluation.confidence;

  const asOfText = signalDesk?.asOf
    ? new Date(signalDesk.asOf).toLocaleDateString()
    : chartAsOf
      ? new Date(chartAsOf).toLocaleDateString()
      : undefined;

  return (
    <aside className="cm-quant" aria-label="Quant signal">
      <div className="cm-quant-head">
        <div>
          <h3>Signal Desk</h3>
          <p>
            {evaluation.strategyVersion} · 1D
            {asOfText ? ` · As of ${asOfText}` : ''}
          </p>
        </div>
        <span className={`cm-decision ${evaluation.decision}`}>{label(evaluation.decision)}</span>
      </div>

      <div
        className="cm-score-row"
        title="Setup quality is a deterministic 0–100 rule score. It is not a probability of profit. Historical and forward outcomes are reported separately. Penalties come from blockers such as weak volume, poor reward/risk, choppy regime, or price too close to support/resistance."
      >
        <div>
          <span className="cm-score num">{setupQuality}</span>
          <span className="cm-score-max">/100</span>
        </div>
        <div className="cm-score-meta">
          <span>{label(evaluation.setupType)}</span>
          <span>{label(evaluation.regime)}</span>
        </div>
      </div>

      <p className="cm-signal-reason">{evaluation.reason}</p>

      <div className="cm-risk-grid">
        <div><span>Entry</span><b className="num">{fmt(evaluation.risk.entry)}</b></div>
        <div><span>Stop</span><b className="num">{fmt(evaluation.risk.stop)}</b></div>
        <div><span>Target 1</span><b className="num">{fmt(evaluation.risk.target1)}</b></div>
        <div><span>Target 2</span><b className="num">{fmt(evaluation.risk.target2)}</b></div>
        <div><span>R/R</span><b className="num">{fmt(evaluation.risk.rewardRisk1)}R</b></div>
        <div><span>Size</span><b className="num">{evaluation.risk.positionSize}</b></div>
      </div>

      {evaluation.noTradeReasons.length > 0 && (
        <div className="cm-blockers">
          <span>No-trade blockers</span>
          <ul>
            {evaluation.noTradeReasons.slice(0, 4).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="cm-components">
        {evaluation.components.map((component) => (
          <div key={component.name} className={`cm-component ${component.status}`}>
            <div>
              <span>{component.name}</span>
              <p>{component.explanation}</p>
            </div>
            <b className="num">{component.score >= 0 ? '+' : ''}{component.score}</b>
          </div>
        ))}
      </div>

      <div className="cm-historical-replay">
        <div className="cm-section-head">
          <span>Historical Replay</span>
          {historical?.status === 'ready' && <em>{historical.eligibleTrades} eligible trades</em>}
        </div>
        {historical?.status === 'ready' ? (
          <div className="cm-historical-grid">
            <div><span>Positive trades</span><b className="num">{historical.winRatePercent}%</b></div>
            <div><span>Target hit rate</span><b className="num">{historical.targetHitRatePercent}%</b></div>
            <div><span>Expectancy</span><b className="num">{historical.expectancyR >= 0 ? '+' : ''}{historical.expectancyR}R</b></div>
            <div><span>Profit factor</span><b className="num">{historical.profitFactor}</b></div>
            <div><span>Max drawdown</span><b className="num">{historical.maxDrawdownR}R</b></div>
            <div><span>Sample quality</span><b className="num">{historical.evidenceStrength}</b></div>
            {historical.expectancyCi95 && (
              <div className="cm-span-2">
                <span>95% expectancy CI</span>
                <b className="num">
                  {historical.expectancyCi95.lower >= 0 ? '+' : ''}{historical.expectancyCi95.lower}R → {historical.expectancyCi95.upper >= 0 ? '+' : ''}{historical.expectancyCi95.upper}R
                </b>
              </div>
            )}
            {historical.regimeMatched && (
              <div className="cm-span-2 cm-regime-match">
                <span>Regime match ({label(historical.regimeMatched.regime)})</span>
                <b className="num">
                  {historical.regimeMatched.trades} trades · {historical.regimeMatched.winRatePercent}% win · {historical.regimeMatched.expectancyR >= 0 ? '+' : ''}{historical.regimeMatched.expectancyR}R
                </b>
              </div>
            )}
          </div>
        ) : (
          <p className="cm-replay-unavailable">
            {historical?.unavailableReason ?? 'Historical replay unavailable for this setup.'}
          </p>
        )}
      </div>

      <div className="cm-forward-record">
        <div className="cm-section-head">
          <span>Forward Record</span>
          {forward && forward.resolvedSignals > 0 && <em>{forward.resolvedSignals} resolved</em>}
        </div>
        {forward && forward.resolvedSignals > 0 ? (
          <div className="cm-forward-grid">
            <div><span>Positive trades</span><b className="num">{forward.winRatePercent ?? 'n/a'}%</b></div>
            <div><span>Expectancy</span><b className="num">{forward.expectancyR !== null ? `${forward.expectancyR >= 0 ? '+' : ''}${forward.expectancyR}R` : 'n/a'}</b></div>
            <div><span>Profit factor</span><b className="num">{forward.profitFactor ?? 'n/a'}</b></div>
            <div><span>Active signals</span><b className="num">{forward.activeSignals}</b></div>
            {forward.expectancyCi95 && (
              <div className="cm-span-2">
                <span>95% expectancy CI</span>
                <b className="num">
                  {forward.expectancyCi95.lower >= 0 ? '+' : ''}{forward.expectancyCi95.lower}R → {forward.expectancyCi95.upper >= 0 ? '+' : ''}{forward.expectancyCi95.upper}R
                </b>
              </div>
            )}
          </div>
        ) : (
          <p className="cm-forward-building">
            Forward record is building. Only signals observed after this version was installed count here.
          </p>
        )}
      </div>

      <div className="cm-evidence-desk">
        <div className="cm-evidence-head">
          <span>Evidence-backed snapshot</span>
          <em>{asOfText ? `as of ${asOfText}` : 'as-of unavailable'}</em>
        </div>
        <div>
          <b>E1</b>
          <span>Signal rules</span>
          <em>{evaluation.strategyVersion}</em>
          <i className="verified">verified</i>
        </div>
        <div>
          <b>E2</b>
          <span>Daily candles</span>
          <em>1D {signalDesk?.source ?? chartSource ?? 'unknown'}</em>
          <i className={(signalDesk?.source ?? chartSource) === 'live' ? 'verified' : 'warning'}>
            {signalDesk?.source ?? chartSource ?? 'unknown'}
          </i>
        </div>
        <div>
          <b>E3</b>
          <span>Historical replay</span>
          <em>{historical?.eligibleTrades ?? 0} trades</em>
          <i className={historical?.status === 'ready' && historical.eligibleTrades >= 15 ? 'verified' : 'warning'}>
            {historical?.evidenceStrength ?? 'unavailable'}
          </i>
        </div>
        <div>
          <b>E4</b>
          <span>Forward record</span>
          <em>{forward?.resolvedSignals ?? 0} resolved</em>
          <i className={(forward?.resolvedSignals ?? 0) >= 10 ? 'verified' : 'warning'}>
            {(forward?.resolvedSignals ?? 0) >= 10 ? 'usable' : 'building'}
          </i>
        </div>
        <div>
          <b>E5</b>
          <span>Valuation & Earnings</span>
          <em>{valuation?.companyName ?? earnings?.companyName ?? 'unavailable'}</em>
          <i className={valuation?.source === 'live' || earnings?.source === 'live' ? 'verified' : 'warning'}>
            {valuation?.source ?? earnings?.source ?? 'missing'}
          </i>
        </div>
      </div>

      <DecisionJournal
        symbol={evaluation.symbol}
        evaluation={evaluation}
        range={range}
        historical={historical}
        forward={forward}
      />

      {valuation && (
        <div className="cm-valuation">
          <span>Valuation</span>
          <div className="cm-valuation-grid">
            <b>P/E</b><em className="num">{valuation.trailingPe ?? 'n/a'}</em>
            <b>P/S</b><em className="num">{valuation.priceToSales ?? 'n/a'}</em>
            <b>Margin</b>
            <em className="num">
              {valuation.profitMargin !== null ? `${(valuation.profitMargin * 100).toFixed(1)}%` : 'n/a'}
            </em>
            <b>Rev growth</b>
            <em className="num">
              {valuation.revenueGrowth !== null ? `${(valuation.revenueGrowth * 100).toFixed(1)}%` : 'n/a'}
            </em>
          </div>
          <ul>
            {valuation.estimates.slice(0, 3).map((estimate) => (
              <li key={estimate.label}>
                <strong>{estimate.label}</strong>
                <span className="num">
                  {estimate.fairValue !== null ? `$${estimate.fairValue.toFixed(2)}` : 'n/a'}
                  {estimate.upsidePercent !== null ? ` (${estimate.upsidePercent > 0 ? '+' : ''}${estimate.upsidePercent.toFixed(1)}%)` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {earnings && (
        <div className="cm-earnings-context">
          <span>Earnings factor</span>
          <p>
            Expected EPS <b className="num">{fmtMoney(earnings.epsEstimate)}</b>
            {earnings.epsActual !== null && earnings.epsActual !== undefined && (
              <>
                {' '}vs latest actual <b className="num">{fmtMoney(earnings.epsActual)}</b>
              </>
            )}
            {earnings.epsSurprisePercent !== null && earnings.epsSurprisePercent !== undefined && (
              <>
                {' '}(<b className={earnings.epsSurprisePercent >= 0 ? 'up num' : 'down num'}>
                  {earnings.epsSurprisePercent > 0 ? '+' : ''}
                  {earnings.epsSurprisePercent.toFixed(1)}%
                </b> surprise)
              </>
            )}
            .
          </p>
          <em>
            Earnings beats can support multiple expansion; misses can invalidate a chart setup even before price breaks the stop.
          </em>
        </div>
      )}
    </aside>
  );
}

function DecisionJournal({
  symbol,
  evaluation,
  range,
  historical,
  forward,
}: {
  symbol: string;
  evaluation: SignalCoreEvaluation | SignalEvaluation;
  range: ChartRange;
  historical: HistoricalValidationSummary | null;
  forward: ForwardRecordSummary | null;
}) {
  const [entries, setEntries] = useState<QuantJournalEntry[]>([]);
  const [status, setStatus] = useState<QuantJournalStatus>('planned');
  const [thesis, setThesis] = useState('');
  const [catalyst, setCatalyst] = useState('');
  const [invalidation, setInvalidation] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getQuantJournal(symbol).then(
      (result) => {
        if (!cancelled) setEntries(result);
      },
      () => {
        if (!cancelled) setMessage('Journal could not load.');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  useEffect(() => {
    setThesis((value) => value || evaluation.reason);
    setInvalidation(
      (value) =>
        value ||
        evaluation.noTradeReasons[0] ||
        `Invalidate if price closes through the ${evaluation.risk.stop} stop or the setup structure fails.`,
    );
  }, [evaluation.noTradeReasons, evaluation.reason, evaluation.risk.stop]);

  const save = async () => {
    if (!thesis.trim() || !invalidation.trim() || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const entry = await api.saveQuantJournal({
        symbol,
        range,
        status,
        thesis,
        catalyst,
        invalidation,
        notes,
        evaluation: {
          symbol: evaluation.symbol,
          setupType: evaluation.setupType,
          decision: evaluation.decision,
          direction: evaluation.direction,
          regime: evaluation.regime,
          confidence: 'setupQuality' in evaluation ? evaluation.setupQuality : evaluation.confidence,
          components: evaluation.components,
          noTradeReasons: evaluation.noTradeReasons,
          reason: evaluation.reason,
          risk: evaluation.risk,
          analytics: 'analytics' in evaluation ? evaluation.analytics : {
            lastClose: evaluation.risk.entry,
            changePercent: 0,
            sma20: null,
            sma50: null,
            atr14: null,
            atrPercent: null,
            avgVolume20: null,
            volumeRatio: null,
            support: null,
            resistance: null,
            distanceToSupportPercent: null,
            distanceToResistancePercent: null,
          },
          backtest: 'backtest' in evaluation ? evaluation.backtest : {
            strategyName: 'QuantDeskSignal_v2',
            strategyVersion: evaluation.strategyVersion,
            totalTrades: historical?.eligibleTrades ?? 0,
            winRate: historical?.winRatePercent ?? 0,
            averageWin: historical?.averageWinR ?? 0,
            averageLoss: historical?.averageLossR ?? 0,
            profitFactor: historical?.profitFactor ?? 0,
            expectancy: historical?.expectancyR ?? 0,
            maxDrawdown: historical?.maxDrawdownR ?? 0,
            averageR: historical?.expectancyR ?? 0,
            bestTradeR: historical?.bestTradeR ?? 0,
            worstTradeR: historical?.worstTradeR ?? 0,
            consecutiveWins: 0,
            consecutiveLosses: 0,
          },
          strategyVersion: evaluation.strategyVersion,
          evaluatedAt: 'evaluatedAt' in evaluation ? evaluation.evaluatedAt : new Date().toISOString(),
        },
        historicalValidation: historical,
        forwardRecord: forward,
      });
      setEntries((items) => [entry, ...items].slice(0, 30));
      setMessage('Decision snapshot saved locally.');
      setNotes('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Journal save failed.');
    } finally {
      setBusy(false);
    }
  };

  const latest = entries[0];
  return (
    <section className="cm-journal" aria-label="Decision journal">
      <div className="cm-journal-head">
        <div>
          <span>Decision Journal</span>
          <p>Save the thesis and invalidation with this exact signal snapshot.</p>
        </div>
        <select value={status} onChange={(event) => setStatus(event.currentTarget.value as QuantJournalStatus)} aria-label="Decision status">
          <option value="planned">Planned</option>
          <option value="active">Active</option>
          <option value="invalidated">Invalidated</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      <label>
        <span>Thesis</span>
        <textarea value={thesis} onChange={(event) => setThesis(event.currentTarget.value)} rows={3} />
      </label>
      <label>
        <span>Catalyst or trigger</span>
        <input value={catalyst} onChange={(event) => setCatalyst(event.currentTarget.value)} placeholder="What must happen before acting?" />
      </label>
      <label>
        <span>Invalidation</span>
        <textarea value={invalidation} onChange={(event) => setInvalidation(event.currentTarget.value)} rows={2} />
      </label>
      <label>
        <span>Review notes</span>
        <input value={notes} onChange={(event) => setNotes(event.currentTarget.value)} placeholder="Optional observation or review date" />
      </label>
      <div className="cm-journal-actions">
        <button type="button" onClick={() => void save()} disabled={busy || !thesis.trim() || !invalidation.trim()}>
          {busy ? 'Saving…' : 'Save decision snapshot'}
        </button>
        {message && <span role="status">{message}</span>}
      </div>
      {latest && (
        <div className="cm-journal-latest">
          <div><b>{latest.status}</b><span>{new Date(latest.updatedAt).toLocaleString()}</span></div>
          <p>{latest.thesis}</p>
          <em>Snapshot: {label(latest.signalSnapshot.decision)} · {latest.signalSnapshot.confidence}/100 · entry {latest.signalSnapshot.entry} · stop {latest.signalSnapshot.stop}</em>
        </div>
      )}
    </section>
  );
}
