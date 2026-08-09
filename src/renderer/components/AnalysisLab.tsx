import { useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import type {
  ChartData,
  EarningsEvent,
  NewsItem,
  QuantInsightResponse,
  Quote,
  ValuationSnapshot,
  WatchlistItem,
} from '../../shared/types';
import type { SignalEvaluation } from '../../shared/quant';
import { evaluateSignal } from '../../shared/quant';
import { api } from '../api';
import { useApp } from '../store';
import { findPivots } from './chart/analysis';
import { IconAlert } from './center/icons';
import { PanelState, SampleChip, SkeletonList } from './center/shared';
import { MultiChartPanel } from './MultiChartPanel';
import '../styles/analysis.css';

interface LabData {
  chart: ChartData;
  valuation: ValuationSnapshot;
  news: NewsItem[];
  earnings: EarningsEvent | null;
  evaluation: SignalEvaluation;
}

interface VarSnapshot {
  returns: number;
  var95Pct: number | null;
  var99Pct: number | null;
  var95Dollars: number | null;
  var99Dollars: number | null;
  annualVolPct: number | null;
  maxDrawdownPct: number | null;
}

interface DcfSnapshot {
  fairValue: number | null;
  upsidePercent: number | null;
  fcfProxy: number | null;
  growth: number;
  discountRate: number;
  terminalGrowth: number;
  confidence: 'low' | 'medium';
}

const TRACKER_LIMIT = 9;
const VAR_NOTIONAL = 100_000;

function money(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(1)}T`;
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${value.toFixed(digits)}`;
}

function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function label(value: string): string {
  return value.replaceAll('-', ' ');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function buildVar(chart: ChartData): VarSnapshot {
  const returns: number[] = [];
  for (let i = 1; i < chart.candles.length; i++) {
    const prev = chart.candles[i - 1].close;
    const next = chart.candles[i].close;
    if (prev > 0 && next > 0) returns.push(next / prev - 1);
  }
  const sorted = [...returns].sort((a, b) => a - b);
  const at = (tail: number) => {
    if (sorted.length === 0) return null;
    const index = clamp(Math.floor(sorted.length * tail), 0, sorted.length - 1);
    return Math.max(0, -sorted[index]);
  };
  const var95 = at(0.05);
  const var99 = at(0.01);
  let peak = chart.candles[0]?.close ?? 0;
  let maxDrawdown = 0;
  for (const candle of chart.candles) {
    peak = Math.max(peak, candle.close);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - candle.close) / peak);
  }
  return {
    returns: returns.length,
    var95Pct: var95 === null ? null : var95 * 100,
    var99Pct: var99 === null ? null : var99 * 100,
    var95Dollars: var95 === null ? null : VAR_NOTIONAL * var95,
    var99Dollars: var99 === null ? null : VAR_NOTIONAL * var99,
    annualVolPct: returns.length ? stdev(returns) * Math.sqrt(252) * 100 : null,
    maxDrawdownPct: maxDrawdown * 100,
  };
}

function buildDcf(valuation: ValuationSnapshot): DcfSnapshot {
  const price = valuation.price;
  const shares = valuation.sharesOutstanding;
  const fcfProxy =
    valuation.netIncomeToCommon ??
    (valuation.ebitda !== null ? valuation.ebitda * 0.65 : null) ??
    (valuation.totalRevenue !== null && valuation.profitMargin !== null
      ? valuation.totalRevenue * valuation.profitMargin
      : null);
  const confidence = valuation.netIncomeToCommon !== null ? 'medium' : 'low';
  const growth = clamp(valuation.revenueGrowth ?? 0.08, -0.05, 0.25);
  const discountRate = 0.1;
  const terminalGrowth = 0.03;
  if (
    price === null ||
    shares === null ||
    shares <= 0 ||
    fcfProxy === null ||
    !Number.isFinite(fcfProxy)
  ) {
    return {
      fairValue: null,
      upsidePercent: null,
      fcfProxy,
      growth,
      discountRate,
      terminalGrowth,
      confidence,
    };
  }
  let projected = fcfProxy;
  let pv = 0;
  for (let year = 1; year <= 5; year++) {
    projected *= 1 + growth;
    pv += projected / (1 + discountRate) ** year;
  }
  const terminalValue =
    (projected * (1 + terminalGrowth)) / Math.max(0.01, discountRate - terminalGrowth);
  const enterpriseValue = pv + terminalValue / (1 + discountRate) ** 5;
  const fairValue = enterpriseValue / shares;
  return {
    fairValue,
    upsidePercent: ((fairValue - price) / price) * 100,
    fcfProxy,
    growth,
    discountRate,
    terminalGrowth,
    confidence,
  };
}

function quoteText(quote: Quote | undefined): { price: string; change: string; tone: string } {
  if (!quote) return { price: 'n/a', change: 'n/a', tone: 'flat' };
  const change = quote.changePercent;
  return {
    price: quote.price === null ? 'n/a' : money(quote.price),
    change: change === null ? 'n/a' : pct(change),
    tone: change === null || change === 0 ? 'flat' : change > 0 ? 'up' : 'down',
  };
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('`')) {
      nodes.push(<code key={`${match.index}-code`}>{token.slice(1, -1)}</code>);
    } else {
      nodes.push(<strong key={`${match.index}-strong`}>{token.slice(2, -2)}</strong>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function MarkdownText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  const flushList = () => {
    if (!list.length) return;
    blocks.push(<ul key={`ul-${blocks.length}`}>{list}</ul>);
    list = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (line.startsWith('### ')) {
      flushList();
      blocks.push(<h4 key={`h-${blocks.length}`}>{renderInline(line.slice(4))}</h4>);
    } else if (line.startsWith('## ')) {
      flushList();
      blocks.push(<h4 key={`h-${blocks.length}`}>{renderInline(line.slice(3))}</h4>);
    } else if (line.startsWith('- ')) {
      list.push(<li key={`li-${blocks.length}-${list.length}`}>{renderInline(line.slice(2))}</li>);
    } else {
      flushList();
      blocks.push(<p key={`p-${blocks.length}`}>{renderInline(line)}</p>);
    }
  }
  flushList();
  return <div className="al-markdown">{blocks}</div>;
}

function Picker({
  watchlist,
  activeSymbol,
  pinnedSymbols,
  onSelect,
  onTogglePin,
}: {
  watchlist: WatchlistItem[];
  activeSymbol: string | null;
  pinnedSymbols: string[];
  onSelect: (symbol: string) => void;
  onTogglePin: (symbol: string) => void;
}) {
  const maxed = pinnedSymbols.length >= TRACKER_LIMIT;
  return (
    <div className="al-picker" aria-label="Multi-picker tracker">
      {watchlist.map((item) => {
        const pinned = pinnedSymbols.includes(item.symbol);
        const disabled = !pinned && maxed;
        return (
          <div key={item.symbol} className={activeSymbol === item.symbol ? 'al-pick is-active' : 'al-pick'}>
            <button
              type="button"
              className="al-pick-main"
              onClick={() => onSelect(item.symbol)}
              title={item.name}
            >
              <span className="num">{item.symbol}</span>
              <em>{item.type.toUpperCase()}</em>
            </button>
            <button
              type="button"
              className={pinned ? 'al-pin is-pinned' : 'al-pin'}
              onClick={() => onTogglePin(item.symbol)}
              disabled={disabled}
              title={
                pinned
                  ? `Unpin ${item.symbol}`
                  : disabled
                    ? 'Nine symbols are already pinned'
                    : `Pin ${item.symbol}`
              }
              aria-label={pinned ? `Unpin ${item.symbol}` : `Pin ${item.symbol}`}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M9.6 2.2 13.8 6.4M10.8 3.4 7.2 7 4.4 6.6 3.4 7.6 8.4 12.6 9.4 11.6 9 8.8 12.6 5.2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M6.6 10.4 2.4 14.6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function PinnedGrid({
  items,
  quotes,
  activeSymbol,
  onSelect,
  onOpenChart,
  onRemove,
}: {
  items: WatchlistItem[];
  quotes: Record<string, Quote>;
  activeSymbol: string | null;
  onSelect: (symbol: string) => void;
  onOpenChart: (symbol: string) => void;
  onRemove: (symbol: string) => void;
}) {
  if (!items.length) {
    return (
      <div className="al-empty-track">
        Pin up to nine watchlist symbols to monitor them together.
      </div>
    );
  }
  return (
    <div className="al-track-grid" aria-label="Pinned tracker">
      {items.map((item) => {
        const quote = quoteText(quotes[item.symbol]);
        return (
          <article key={item.symbol} className={activeSymbol === item.symbol ? 'al-track is-active' : 'al-track'}>
            <button type="button" className="al-track-main" onClick={() => onSelect(item.symbol)}>
              <span className="al-track-symbol num">{item.symbol}</span>
              <span className="al-track-name">{item.name}</span>
              <span className="al-track-price num">{quote.price}</span>
              <span className={`al-track-change num ${quote.tone}`}>{quote.change}</span>
            </button>
            <div className="al-track-actions">
              <button type="button" onClick={() => onOpenChart(item.symbol)}>
                Chart
              </button>
              <button type="button" onClick={() => onRemove(item.symbol)} aria-label={`Unpin ${item.symbol}`}>
                Unpin
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Stat({ label: statLabel, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={tone ? `al-stat ${tone}` : 'al-stat'}>
      <span>{statLabel}</span>
      <b className="num">{value}</b>
    </div>
  );
}

export function AnalysisLab() {
  const { state, actions } = useApp();
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const [data, setData] = useState<LabData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thesis, setThesis] = useState<QuantInsightResponse | null>(null);
  const [thesisBusy, setThesisBusy] = useState(false);
  const [reportNotes, setReportNotes] = useState('');

  const watchlistBySymbol = useMemo(
    () => new Map(state.watchlist.map((item) => [item.symbol, item])),
    [state.watchlist],
  );
  const pinnedItems = useMemo(
    () =>
      state.pinnedSymbols
        .map((symbol) => watchlistBySymbol.get(symbol))
        .filter((item): item is WatchlistItem => Boolean(item)),
    [state.pinnedSymbols, watchlistBySymbol],
  );

  useEffect(() => {
    const preferred =
      (activeSymbol && watchlistBySymbol.has(activeSymbol) && activeSymbol) ||
      pinnedItems[0]?.symbol ||
      state.watchlist.find((item) => item.type === 'stock')?.symbol ||
      state.watchlist[0]?.symbol ||
      null;
    if (preferred !== activeSymbol) setActiveSymbol(preferred);
  }, [activeSymbol, pinnedItems, state.watchlist, watchlistBySymbol]);

  useEffect(() => {
    if (!activeSymbol) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setThesis(null);
    Promise.all([
      api.getChart(activeSymbol, '1d'),
      api.getValuation(activeSymbol),
      api.getNews([activeSymbol], 8),
      api.getEarnings([activeSymbol]),
    ]).then(
      ([chart, valuation, news, earnings]) => {
        if (cancelled) return;
        const pivots = findPivots(chart.candles);
        setData({
          chart,
          valuation,
          news,
          earnings: earnings.find((item) => item.symbol === activeSymbol) ?? null,
          evaluation: evaluateSignal(activeSymbol, chart.candles, pivots),
        });
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Analysis failed');
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activeSymbol]);

  const varRisk = useMemo(() => (data ? buildVar(data.chart) : null), [data]);
  const dcf = useMemo(() => (data ? buildDcf(data.valuation) : null), [data]);

  const createThesis = useCallback(async () => {
    if (!activeSymbol || !data || thesisBusy) return;
    setThesisBusy(true);
    try {
      const note = reportNotes.trim();
      const response = await api.analyzeQuant({
        symbol: activeSymbol,
        range: '1d',
        evaluation: data.evaluation,
        news: data.news,
        earnings: data.earnings,
        valuation: data.valuation,
        macroOverlays: [],
        question: [
          'Create an investment thesis for the Analysis Lab.',
          'Cover DCF valuation, historical VaR risk, setup quality, catalysts, invalidation, and position sizing.',
          dcf
            ? `DCF proxy: fair value ${money(dcf.fairValue)}, upside ${pct(dcf.upsidePercent)}, FCF proxy ${money(dcf.fcfProxy)}, growth ${(dcf.growth * 100).toFixed(1)}%, discount ${(dcf.discountRate * 100).toFixed(1)}%.`
            : '',
          varRisk
            ? `VaR: 95% one-day loss ${pct(varRisk.var95Pct)} or ${money(varRisk.var95Dollars, 0)} on ${money(VAR_NOTIONAL, 0)} notional; 99% ${pct(varRisk.var99Pct)} or ${money(varRisk.var99Dollars, 0)}.`
            : '',
          note ? `User report notes or pasted annual-report extract:\n${note.slice(0, 1600)}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        thinkingMode: true,
      });
      setThesis(response);
    } finally {
      setThesisBusy(false);
    }
  }, [activeSymbol, data, dcf, reportNotes, thesisBusy, varRisk]);

  if (state.watchlistLoaded && state.watchlist.length === 0) {
    return (
      <div className="al-panel">
        <PanelState
          icon={<IconAlert />}
          title="No symbols available"
          hint="Add stocks or ETFs to the watchlist, then pin up to nine here."
        />
      </div>
    );
  }

  return (
    <div className="al-panel">
      <div className="al-chrome">
        <div>
          <h2>Analysis Lab</h2>
          <p>DCF proxy, historical VaR, signal risk, and AI thesis generation.</p>
        </div>
        <span className="al-limit num">
          {state.pinnedSymbols.length}/{TRACKER_LIMIT} pinned
        </span>
      </div>

      <div className="al-body">
        <section className="al-section">
          <div className="al-section-head">
            <div>
              <h3>Multi-picker tracker</h3>
              <p>Pin several symbols and switch the analysis target without closing charts.</p>
            </div>
          </div>
          <Picker
            watchlist={state.watchlist}
            activeSymbol={activeSymbol}
            pinnedSymbols={state.pinnedSymbols}
            onSelect={setActiveSymbol}
            onTogglePin={actions.togglePinnedSymbol}
          />
          <PinnedGrid
            items={pinnedItems}
            quotes={state.quotes}
            activeSymbol={activeSymbol}
            onSelect={setActiveSymbol}
            onOpenChart={actions.openChart}
            onRemove={actions.removePinnedSymbol}
          />
        </section>

        <MultiChartPanel
          watchlist={state.watchlist}
          pinnedSymbols={state.pinnedSymbols}
          quotes={state.quotes}
          activeSymbol={activeSymbol}
          onSelectSymbol={setActiveSymbol}
        />

        {loading || !state.watchlistLoaded ? (
          <SkeletonList variant="news" rows={5} />
        ) : error ? (
          <PanelState
            kind="error"
            icon={<IconAlert />}
            title="Analysis could not load"
            hint={error}
          />
        ) : data && dcf && varRisk ? (
          <>
            <section className="al-summary">
              <div>
                <span className="al-kicker num">{data.valuation.symbol}</span>
                <h3>{data.valuation.companyName}</h3>
                <p>{label(data.evaluation.decision)} - {data.evaluation.reason}</p>
              </div>
              {data.valuation.source === 'sample' && <SampleChip />}
            </section>

            <div className="al-grid">
              <section className="al-card">
                <div className="al-card-head">
                  <h3>DCF Evaluation</h3>
                  <span>{dcf.confidence} confidence</span>
                </div>
                <div className="al-stat-grid">
                  <Stat label="Fair value" value={money(dcf.fairValue)} />
                  <Stat
                    label="Upside"
                    value={pct(dcf.upsidePercent)}
                    tone={(dcf.upsidePercent ?? 0) >= 0 ? 'up' : 'down'}
                  />
                  <Stat label="FCF proxy" value={money(dcf.fcfProxy, 0)} />
                  <Stat label="Growth" value={`${(dcf.growth * 100).toFixed(1)}%`} />
                </div>
                <p className="al-note">
                  Uses net income first, then EBITDA or margin proxy if cash-flow detail is unavailable.
                  Discount rate {(dcf.discountRate * 100).toFixed(1)}%, terminal growth {(dcf.terminalGrowth * 100).toFixed(1)}%.
                </p>
                <ul className="al-mini-list">
                  {data.valuation.estimates.map((estimate) => (
                    <li key={estimate.label}>
                      <span>{estimate.label}</span>
                      <b className="num">{money(estimate.fairValue)} {pct(estimate.upsidePercent)}</b>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="al-card">
                <div className="al-card-head">
                  <h3>VaR Risk Analysis</h3>
                  <span className="num">{varRisk.returns} returns</span>
                </div>
                <div className="al-stat-grid">
                  <Stat label="95% VaR" value={`${pct(varRisk.var95Pct)} / ${money(varRisk.var95Dollars, 0)}`} tone="down" />
                  <Stat label="99% VaR" value={`${pct(varRisk.var99Pct)} / ${money(varRisk.var99Dollars, 0)}`} tone="down" />
                  <Stat label="Ann. vol" value={pct(varRisk.annualVolPct)} />
                  <Stat label="Max drawdown" value={pct(varRisk.maxDrawdownPct)} tone="down" />
                </div>
                <p className="al-note">
                  Historical one-day VaR on {money(VAR_NOTIONAL, 0)} notional using the loaded 1Y candle series.
                </p>
              </section>

              <section className="al-card">
                <div className="al-card-head">
                  <h3>Signal Risk</h3>
                  <span className="num">{data.evaluation.confidence}/100</span>
                </div>
                <div className="al-stat-grid">
                  <Stat label="Setup" value={label(data.evaluation.setupType)} />
                  <Stat label="Regime" value={label(data.evaluation.regime)} />
                  <Stat label="R/R" value={`${data.evaluation.risk.rewardRisk1.toFixed(2)}R`} />
                  <Stat label="Size" value={`${data.evaluation.risk.positionSize}`} />
                </div>
                <ul className="al-mini-list">
                  {data.evaluation.noTradeReasons.length
                    ? data.evaluation.noTradeReasons.slice(0, 4).map((reason) => (
                        <li key={reason}>
                          <span>{reason}</span>
                        </li>
                      ))
                    : data.evaluation.components.slice(0, 4).map((component) => (
                        <li key={component.name}>
                          <span>{component.name}</span>
                          <b className="num">{component.score >= 0 ? '+' : ''}{component.score}</b>
                        </li>
                      ))}
                </ul>
              </section>

              <section className="al-card">
                <div className="al-card-head">
                  <h3>Startup Model Template</h3>
                  <span>base case</span>
                </div>
                <div className="al-model-steps">
                  <div><b>1</b><span>Revenue build: users x conversion x ARPU</span></div>
                  <div><b>2</b><span>Gross margin, CAC payback, and burn multiple</span></div>
                  <div><b>3</b><span>Runway, dilution, terminal ARR multiple</span></div>
                </div>
                <textarea
                  value={reportNotes}
                  onChange={(event) => setReportNotes(event.currentTarget.value)}
                  placeholder="Paste report notes, PDF extracts, or startup model assumptions for the AI thesis."
                  rows={5}
                />
              </section>
            </div>

            <section className="al-thesis">
              <div className="al-thesis-head">
                <div>
                  <h3>AI Thesis</h3>
                  <p>Creates a thesis from chart signal, valuation, VaR, news, earnings, and pasted report notes.</p>
                </div>
                <button
                  type="button"
                  className="al-primary"
                  onClick={() => void createThesis()}
                  disabled={thesisBusy}
                >
                  {thesisBusy ? 'Creating thesis...' : 'Create thesis with AI'}
                </button>
              </div>
              {thesis ? (
                <div className="al-thesis-output">
                  <span className="al-source">{thesis.source}{thesis.model ? ` - ${thesis.model}` : ''}</span>
                  <MarkdownText text={thesis.answer} />
                </div>
              ) : (
                <div className="al-thesis-empty">
                  No thesis generated for {activeSymbol}. Run the AI thesis once the analysis cards have loaded.
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
