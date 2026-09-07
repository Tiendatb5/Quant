// src/renderer/components/HeatmapPanel.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChartData, ChartRange, Quote } from '../../shared/types';
import { api } from '../api';
import { useApp } from '../store';
import { IconRefresh } from './center/icons';
import '../styles/heatmap.css';

/* ── Timeframe ──────────────────────────────────────────────────────────── */
type HeatTf = '5m' | '30m' | '60m' | '1D';
const TIMEFRAMES: HeatTf[] = ['5m', '30m', '60m', '1D'];

/* ── Sector ETFs for rotation bar ───────────────────────────────────────── */
const SECTOR_ETFS = [
  { symbol: 'XLK', label: 'Tech' },
  { symbol: 'XLF', label: 'Fin' },
  { symbol: 'XLE', label: 'Energy' },
  { symbol: 'XLV', label: 'Health' },
  { symbol: 'XLI', label: 'Indust' },
  { symbol: 'XLY', label: 'Disc' },
  { symbol: 'XLP', label: 'Staples' },
  { symbol: 'XLB', label: 'Mats' },
  { symbol: 'XLU', label: 'Utils' },
  { symbol: 'XLRE', label: 'RE' },
  { symbol: 'XLC', label: 'Comm' },
] as const;

/* ── Universe: sector + symbol + relative market-cap weight ─────────────── */
interface StockNode {
  symbol: string;
  weight: number;
}
interface SectorNode {
  name: string;
  stocks: StockNode[];
}

const SECTORS: SectorNode[] = [
  {
    name: 'Technology',
    stocks: [
      { symbol: 'NVDA', weight: 8.0 }, { symbol: 'AAPL', weight: 7.3 },
      { symbol: 'MSFT', weight: 6.8 }, { symbol: 'AVGO', weight: 2.7 },
      { symbol: 'AMD', weight: 1.2 }, { symbol: 'ORCL', weight: 0.9 },
      { symbol: 'CRM', weight: 0.7 }, { symbol: 'ADBE', weight: 0.6 },
      { symbol: 'CSCO', weight: 0.6 }, { symbol: 'ACN', weight: 0.5 },
      { symbol: 'INTC', weight: 0.5 }, { symbol: 'QCOM', weight: 0.5 },
      { symbol: 'TXN', weight: 0.4 }, { symbol: 'AMAT', weight: 0.4 },
      { symbol: 'MU', weight: 1.0 }, { symbol: 'NOW', weight: 0.4 },
      { symbol: 'PANW', weight: 0.3 }, { symbol: 'PLTR', weight: 0.5 },
    ],
  },
  {
    name: 'Communication',
    stocks: [
      { symbol: 'GOOGL', weight: 3.0 }, { symbol: 'GOOG', weight: 2.4 },
      { symbol: 'META', weight: 2.0 }, { symbol: 'NFLX', weight: 0.7 },
      { symbol: 'DIS', weight: 0.5 }, { symbol: 'CMCSA', weight: 0.4 },
      { symbol: 'T', weight: 0.3 }, { symbol: 'VZ', weight: 0.3 },
      { symbol: 'TMUS', weight: 0.4 },
    ],
  },
  {
    name: 'Consumer Disc.',
    stocks: [
      { symbol: 'AMZN', weight: 3.8 }, { symbol: 'TSLA', weight: 1.5 },
      { symbol: 'HD', weight: 0.8 }, { symbol: 'MCD', weight: 0.5 },
      { symbol: 'NKE', weight: 0.3 }, { symbol: 'SBUX', weight: 0.3 },
      { symbol: 'LOW', weight: 0.3 }, { symbol: 'BKNG', weight: 0.4 },
      { symbol: 'TJX', weight: 0.3 },
    ],
  },
  {
    name: 'Consumer Staples',
    stocks: [
      { symbol: 'WMT', weight: 0.9 }, { symbol: 'COST', weight: 0.7 },
      { symbol: 'PG', weight: 0.7 }, { symbol: 'KO', weight: 0.5 },
      { symbol: 'PEP', weight: 0.4 }, { symbol: 'PM', weight: 0.3 },
      { symbol: 'MO', weight: 0.2 }, { symbol: 'CL', weight: 0.2 },
    ],
  },
  {
    name: 'Financials',
    stocks: [
      { symbol: 'BRK-B', weight: 1.6 }, { symbol: 'JPM', weight: 1.5 },
      { symbol: 'V', weight: 1.0 }, { symbol: 'MA', weight: 0.8 },
      { symbol: 'BAC', weight: 0.6 }, { symbol: 'WFC', weight: 0.5 },
      { symbol: 'GS', weight: 0.4 }, { symbol: 'MS', weight: 0.4 },
      { symbol: 'BLK', weight: 0.3 }, { symbol: 'AXP', weight: 0.3 },
      { symbol: 'C', weight: 0.3 }, { symbol: 'SCHW', weight: 0.3 },
    ],
  },
  {
    name: 'Health Care',
    stocks: [
      { symbol: 'LLY', weight: 1.4 }, { symbol: 'UNH', weight: 0.8 },
      { symbol: 'JNJ', weight: 0.8 }, { symbol: 'ABBV', weight: 0.6 },
      { symbol: 'MRK', weight: 0.5 }, { symbol: 'TMO', weight: 0.4 },
      { symbol: 'ABT', weight: 0.4 }, { symbol: 'PFE', weight: 0.3 },
      { symbol: 'AMGN', weight: 0.3 }, { symbol: 'ISRG', weight: 0.3 },
    ],
  },
  {
    name: 'Energy',
    stocks: [
      { symbol: 'XOM', weight: 1.0 }, { symbol: 'CVX', weight: 0.6 },
      { symbol: 'COP', weight: 0.3 }, { symbol: 'SLB', weight: 0.2 },
      { symbol: 'EOG', weight: 0.2 }, { symbol: 'MPC', weight: 0.2 },
    ],
  },
  {
    name: 'Industrials',
    stocks: [
      { symbol: 'CAT', weight: 0.5 }, { symbol: 'GE', weight: 0.5 },
      { symbol: 'RTX', weight: 0.4 }, { symbol: 'HON', weight: 0.3 },
      { symbol: 'UNP', weight: 0.3 }, { symbol: 'BA', weight: 0.3 },
      { symbol: 'DE', weight: 0.3 }, { symbol: 'LMT', weight: 0.3 },
    ],
  },
  {
    name: 'Utilities',
    stocks: [
      { symbol: 'NEE', weight: 0.4 }, { symbol: 'SO', weight: 0.2 },
      { symbol: 'DUK', weight: 0.2 }, { symbol: 'CEG', weight: 0.2 },
      { symbol: 'AEP', weight: 0.2 },
    ],
  },
  {
    name: 'Real Estate',
    stocks: [
      { symbol: 'PLD', weight: 0.3 }, { symbol: 'AMT', weight: 0.2 },
      { symbol: 'EQIX', weight: 0.2 }, { symbol: 'WELL', weight: 0.2 },
      { symbol: 'SPG', weight: 0.1 },
    ],
  },
];

const ALL_SYMBOLS = SECTORS.flatMap((s) => s.stocks.map((st) => st.symbol));
const REFRESH_MS = 60_000;

/* ── Intraday change from chart candles ─────────────────────────────────── */
function changeFromChart(chart: ChartData, tf: HeatTf): number | null {
  const candles = chart.candles;
  if (!candles || candles.length < 2) return null;
  const last = candles[candles.length - 1]?.close;
  if (last == null || !Number.isFinite(last)) return null;

  // approx bars to look back (chart interval depends on range)
  // For range '1d' Quant typically returns 5m bars → 5m=1, 30m=6, 60m=12
  const barsBack = tf === '5m' ? 1 : tf === '30m' ? 6 : tf === '60m' ? 12 : 1;
  const idx = Math.max(0, candles.length - 1 - barsBack);
  const prev = candles[idx]?.close;
  if (prev == null || !Number.isFinite(prev) || prev === 0) return null;
  return ((last - prev) / prev) * 100;
}

/* ── Squarified treemap ─────────────────────────────────────────────────── */
interface Rect {
  x: number; y: number; w: number; h: number;
  symbol?: string; sector?: string; value: number;
}

function worst(row: number[], w: number): number {
  if (row.length === 0) return Infinity;
  const s = row.reduce((a, b) => a + b, 0);
  const max = Math.max(...row);
  const min = Math.min(...row);
  return Math.max((w * w * max) / (s * s), (s * s) / (w * w * min));
}

function layoutRow(
  row: Array<{ value: number; symbol?: string; sector?: string }>,
  x: number, y: number, w: number, h: number, horizontal: boolean,
): Rect[] {
  const total = row.reduce((s, r) => s + r.value, 0);
  let offset = 0;
  return row.map((item) => {
    const frac = item.value / total;
    if (horizontal) {
      const rw = w * frac;
      const r: Rect = { x: x + offset, y, w: rw, h, value: item.value, symbol: item.symbol, sector: item.sector };
      offset += rw;
      return r;
    }
    const rh = h * frac;
    const r: Rect = { x, y: y + offset, w, h: rh, value: item.value, symbol: item.symbol, sector: item.sector };
    offset += rh;
    return r;
  });
}

function squarify(
  items: Array<{ value: number; symbol?: string; sector?: string }>,
  x: number, y: number, w: number, h: number,
): Rect[] {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{ x, y, w, h, value: items[0].value, symbol: items[0].symbol, sector: items[0].sector }];
  }
  const total = items.reduce((s, i) => s + i.value, 0);
  const normalized = items.map((i) => ({ ...i, value: (i.value / total) * w * h }));
  const results: Rect[] = [];
  let remaining = [...normalized];
  let cx = x, cy = y, cw = w, ch = h;

  while (remaining.length > 0) {
    const horizontal = cw >= ch;
    const side = horizontal ? ch : cw;
    const row: typeof remaining = [];
    let i = 0;
    while (i < remaining.length) {
      const test = [...row, remaining[i]];
      if (row.length === 0 || worst(test.map((r) => r.value), side) <= worst(row.map((r) => r.value), side)) {
        row.push(remaining[i]);
        i++;
      } else break;
    }
    remaining = remaining.slice(i);
    const rowTotal = row.reduce((s, r) => s + r.value, 0);
    const rowSide = rowTotal / side;
    if (horizontal) {
      results.push(...layoutRow(row, cx, cy, rowSide, ch, true));
      cx += rowSide; cw -= rowSide;
    } else {
      results.push(...layoutRow(row, cx, cy, cw, rowSide, false));
      cy += rowSide; ch -= rowSide;
    }
  }
  return results;
}

function changeToColor(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return '#1a1a1a';
  const t = Math.max(-3.5, Math.min(3.5, pct)) / 3.5;
  if (Math.abs(t) < 0.02) return '#2a2a2a';
  if (t > 0) {
    const intensity = Math.round(30 + t * 120);
    return `rgb(10, ${intensity}, 45)`;
  }
  const intensity = Math.round(40 + Math.abs(t) * 160);
  return `rgb(${intensity}, 18, 30)`;
}

function formatPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

/* ── Component ──────────────────────────────────────────────────────────── */
export function HeatmapPanel() {
  const { actions } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [tf, setTf] = useState<HeatTf>('1D');
  const [changes, setChanges] = useState<Record<string, number | null>>({});
  const hasData = Object.keys(changes).length > 0;
  const [sectorQuotes, setSectorQuotes] = useState<Record<string, Quote>>({});
  const [spyChange, setSpyChange] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loadProgress, setLoadProgress] = useState<string | null>(null);

  
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setLoadProgress(null);

    try {
      // ── Sector rotation bar (always from daily quotes — cheap) ──
      const sectorSyms = [...SECTOR_ETFS.map((s) => s.symbol), 'SPY'];
      const sq = await api.getQuotes(sectorSyms);
      const sMap: Record<string, Quote> = {};
      for (const q of sq) sMap[q.symbol] = q;
      setSectorQuotes(sMap);
      setSpyChange(sMap['SPY']?.changePercent ?? null);

      // ── Heatmap cell colors ──
      const next: Record<string, number | null> = {};

      for (let si = 0; si < SECTORS.length; si++) {
      const sector = SECTORS[si];
      setLoadProgress(
        tf === '1D'
          ? `Feeding '${sector.name}' · ${si + 1}/${SECTORS.length} sectors`
          : `Feeding '${sector.name}' (${tf}) · ${si + 1}/${SECTORS.length} sectors`,
      );

      const syms = sector.stocks.map((s) => s.symbol);
            if (tf === '1D') {
              const quotes = await api.getQuotes(syms);
              for (const q of quotes) next[q.symbol] = q.changePercent;
            } else {
              const charts = await Promise.all(
                syms.map((sym) => api.getChart(sym, '1d').catch(() => null)),
              );
              for (let j = 0; j < syms.length; j++) {
                next[syms[j]] = charts[j] ? changeFromChart(charts[j]!, tf) : null;
              }
            }
          }

          setChanges(next);
          setUpdatedAt(Date.now());
        } catch (err) {
          console.error('[heatmap]', err);
          setError(err instanceof Error ? err.message : 'Failed to load heatmap');
        } finally {
          setLoadProgress(null);
          setLoading(false);
          setRefreshing(false);
        }
      }, [tf]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Sector rotation ranking (RS vs SPY) */
  const rotation = useMemo(() => {
    if (spyChange === null) {
    return {
      leaders: [],
      laggards: [],
      all: [],
            };
          }
    
    const spy = spyChange ?? 0;
    const ranked = SECTOR_ETFS.map((s) => {
      const ch = sectorQuotes[s.symbol]?.changePercent ?? null;
      const rs = ch !== null ? ch - spy : null;
      return { ...s, change: ch, rs };
    }).sort((a, b) => (b.rs ?? -999) - (a.rs ?? -999));

    return {
      leaders: ranked.filter((r) => (r.rs ?? 0) > 0).slice(0, 3),
      laggards: ranked.filter((r) => (r.rs ?? 0) < 0).slice(-3).reverse(),
      all: ranked,
    };
  }, [sectorQuotes, spyChange]);

    /* Treemap cells */
    const { cells, frames } = useMemo(() => {
    const PAD = 2;
    const TITLE_H = 18;

    const sectorItems = SECTORS.map((sec) => ({
    value: sec.stocks.reduce((s, st) => s + st.weight, 0),
    sector: sec.name,
  }));
  
    // sector rectangles = frames
    const sectorRects = squarify(sectorItems,PAD,PAD,size.w - PAD * 2,size.h - PAD * 2,);

    const stockCells: Array<Rect & { change: number | null }> = [];
        for (const sRect of sectorRects) {
            const sector = SECTORS.find((s) => s.name === sRect.sector);
            if (!sector) continue;

            const stockRects = squarify(
            sector.stocks.map((st) => ({ value: st.weight, symbol: st.symbol })),
            sRect.x + 2,
            sRect.y + TITLE_H,                    // room for sector title
            Math.max(0, sRect.w - 4),
            Math.max(0, sRect.h - TITLE_H - 2),
            );

            for (const r of stockRects) {
            if (r.w < 4 || r.h < 4) continue;
            stockCells.push({
                ...r,
                change: changes[r.symbol!] ?? null,
            });
            }
        }

    // IMPORTANT: always return arrays
    return {
        cells: stockCells,
        frames: sectorRects,   // array of { x, y, w, h, sector, value }
    };
    }, [size, changes]);

    const stats = useMemo(() => {
    const values = Object.values(changes).filter(
      (v): v is number => v !== null && Number.isFinite(v),
    );
    const up = values.filter((v) => v > 0).length;
    const down = values.filter((v) => v < 0).length;
    const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
    return { up, down, avg, total: values.length };
  }, [changes]);

  return (
    <section className="hm-panel">
      {/* ── Header: title + TF selector + refresh ── */}
      <header className="hm-header">
        <div className="hm-title-block">
          <h2>S&P Heatmap</h2>
          <p>
            Size = mkt cap · Color = {tf} change · {stats.total} names ·{' '}
            {stats.up}↑ {stats.down}↓
            {stats.avg !== null && <> · avg {formatPct(stats.avg)}</>}
          </p>
        </div>

        <div className="hm-controls">
          <div className="mc-segment">
            {TIMEFRAMES.map((t) => (
              <button
                key={t}
                type="button"
                className={tf === t ? 'is-active' : ''}
                onClick={() => setTf(t)}
              >
                {t}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="cp-refresh"
            onClick={() => void load(true)}
            disabled={refreshing || loading}
            aria-label="Refresh heatmap"
            title="Refresh heatmap"
          >
            <IconRefresh
              size={14}
              className={refreshing ? 'is-spinning' : undefined}
            />
          </button>

          {updatedAt && (
            <span className="hm-updated">
              {new Date(updatedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>
      </header>

      {/* ── Sector rotation bar ── */}
      <div className="hm-rotation">
        <div className="hm-rot-group">
          <span className="hm-rot-label leaders">Leaders</span>
          {rotation.leaders.length === 0 && (
            <span className="hm-rot-empty">—</span>
          )}
          {rotation.leaders.map((s) => (
            <button
              key={s.symbol}
              type="button"
              className="hm-rot-chip up"
              onClick={() => actions.openChart(s.symbol)}
              title={`${s.symbol} RS vs SPY`}
            >
              <span className="hm-rot-sym">{s.label}</span>
              <span className="hm-rot-rs">
                {s.rs !== null ? formatPct(s.rs) : '—'}
              </span>
            </button>
          ))}
        </div>

        <div className="hm-rot-spy">
          SPY {formatPct(spyChange)}
        </div>

        <div className="hm-rot-group">
          <span className="hm-rot-label laggards">Laggards</span>
          {rotation.laggards.length === 0 && (
            <span className="hm-rot-empty">—</span>
          )}
          {rotation.laggards.map((s) => (
            <button
              key={s.symbol}
              type="button"
              className="hm-rot-chip down"
              onClick={() => actions.openChart(s.symbol)}
              title={`${s.symbol} RS vs SPY`}
            >
              <span className="hm-rot-sym">{s.label}</span>
              <span className="hm-rot-rs">
                {s.rs !== null ? formatPct(s.rs) : '—'}
              </span>
            </button>
          ))}
        </div>
      </div>
          
      {/* ✅ ranking bar lives HERE */}
      <div className="hm-rs-spectrum">
        <span className="hm-rs-end down">Weak</span>
        <div className="hm-rs-track">
          {rotation.all.map((s, i) => {
            const n = Math.max(1, rotation.all.length - 1);
            const x =
              rotation.all.length <= 1
                ? 50
                : (i / Math.max(1, rotation.all.length - 1)) * 100;
            return (
              <button
                key={s.symbol}
                type="button"
                className="hm-rs-tick"
                style={{ left: `${x}%` }}
                title={`${s.label} RS ${s.rs != null ? formatPct(s.rs) : '—'}`}
                onClick={() => actions.openChart(s.symbol)}
              >
                <span className="hm-rs-tick-label">{s.label}</span>
              </button>
            );
          })}
        </div>
        <span className="hm-rs-end up">Strong</span>
         {/*<div className="hm-rs-track">...</div> */}
        {/* <span className="hm-rs-end down">Weak</span>*/}
      </div>

    <div className="hm-body" ref={containerRef}>
      {(loading || refreshing) && (
        <div className="hm-loading-bar">
            {loadProgress
              ?? (tf === '1D'
                ? 'Loading 1D changes…'
                : `Loading ${tf} changes (charts)…`)}
          </div>
      )}

      {error && !hasData && (
        <div className="hm-empty">
            <strong>Heatmap unavailable</strong>
            <span>{error}</span>
            <button type="button" onClick={() => void load(true)}>
              Retry
            </button>
          </div>
      )}

      <div className="hm-treemap" style={{ width: size.w, height: size.h }}>
        {Array.isArray(frames) &&
          frames.map((f) => (
            <div
              key={f.sector}
              className="hm-sector-frame"
              style={{ left: f.x, top: f.y, width: f.w, height: f.h }}
            >
              <span className="hm-sector-name">{f.sector}</span>
            </div>
          ))}

        {cells.map((cell) => {
          const showLabel = hasData && cell.w > 36 && cell.h > 28;
          const showPct = hasData && cell.w > 48 && cell.h > 40;
          return (
            <button
              key={cell.symbol}
              type="button"
              className="hm-cell"
              style={{
                left: cell.x,
                top: cell.y,
                width: cell.w,
                height: cell.h,
                background: hasData ? changeToColor(cell.change) : '#1a1a1a',
              }}
              onClick={() => actions.openChart(cell.symbol!)}
              title={`${cell.symbol} ${formatPct(cell.change)}`}
            >
              {showLabel && (
                <>
                  <span className="hm-sym">{cell.symbol}</span>
                  {showPct && (
                    <span className="hm-pct">{formatPct(cell.change)}</span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>

    </section>
  );
}