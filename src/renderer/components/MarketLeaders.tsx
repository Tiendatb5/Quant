import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChartData, ChartRange, Quote } from '../../shared/types';
import { MARKET_LEADERS } from '../../shared/marketPulse';
import { api } from '../api';
import { LeadChartPanel } from './LeadChartPanel';
import '../styles/market-leaders.css';
import '../styles/pulse.css';
import { IconRefresh } from './center/icons';

const TIMEFRAMES: ChartRange[] = ['1m', '5m', '30m', '60m', '1d', '1w', '1M'];
const SECTOR_ETFS = [
  { symbol: 'XLK', label: 'Technology' },
  { symbol: 'XLF', label: 'Financials' },
  { symbol: 'XLE', label: 'Energy' },
  { symbol: 'XLV', label: 'Health Care' },
  { symbol: 'XLI', label: 'Industrials' },
  { symbol: 'XLY', label: 'Consumer Disc.' },
  { symbol: 'XLP', label: 'Consumer Staples' },
  { symbol: 'XLB', label: 'Materials' },
  { symbol: 'XLU', label: 'Utilities' },
  { symbol: 'XLRE', label: 'Real Estate' },
  { symbol: 'XLC', label: 'Communication' },
];

function MoversBox({title,items,}: {title: string;items: { symbol: string; label?: string; change: number }[];}) {
  const sorted = useMemo(
    () => [...items].sort((a, b) => b.change - a.change),
    [items],
  );

  const highest = sorted.slice(0, 6);
  const lowest = [...sorted].reverse().slice(0, 6);

  return (
    <section className="mp-scenario ml-box">
      <div className="mp-section-head">
        <h3>{title}</h3>
      </div>

      <div className="ml-movers-grid">
        {/* Highest */}
        <div className="ml-movers-col">
          <div className="ml-movers-label">HIGHEST</div>
          {highest.map((item) => (
            <div key={item.symbol} className="ml-mover-row">
              <div className="ml-mover-left">
                <span className="ml-mover-sym">{item.symbol}</span>
                {item.label && <span className="ml-mover-label-text">{item.label}</span>}
              </div>
              <span className={`ml-mover-pct ${item.change >= 0 ? 'up' : 'down'}`}>
                {item.change >= 0 ? '+' : ''}
                {item.change.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>

        {/* Lowest */}
        <div className="ml-movers-col">
          <div className="ml-movers-label">LOWEST</div>
          {lowest.map((item) => (
            <div key={item.symbol} className="ml-mover-row">
              <div className="ml-mover-left">
                <span className="ml-mover-sym">{item.symbol}</span>
                {item.label && <span className="ml-mover-label-text">{item.label}</span>}
              </div>
              <span className={`ml-mover-pct ${item.change >= 0 ? 'up' : 'down'}`}>
                {item.change >= 0 ? '+' : ''}
                {item.change.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MarketLeaders() {
  // Separate timeframes
  const [chartRefreshKey, setChartRefreshKey] = useState(0);
  const [boxesRefreshing, setBoxesRefreshing] = useState(false);

  const [chartRange, setChartRange] = useState<ChartRange>('1d');
  const [boxRange, setBoxRange] = useState<ChartRange>('1d');

  const [leaderCharts, setLeaderCharts] = useState<Record<string, ChartData>>({});
  const [sectorQuotes, setSectorQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(true);

  // Load data for the two boxes
  const loadBoxes = useCallback(async (soft = false) => {soft ? setBoxesRefreshing(true) : setLoading(true);
    try {
      const leaderSymbols = MARKET_LEADERS.map((l) => l.symbol);
      const [charts, quotes] = await Promise.all([
        Promise.all(leaderSymbols.map((s) => api.getChart(s, boxRange))),
        api.getQuotes(SECTOR_ETFS.map((s) => s.symbol)),
      ]);

      const chartMap: Record<string, ChartData> = {};
      charts.forEach((c) => (chartMap[c.symbol] = c));
      setLeaderCharts(chartMap);

      const quoteMap: Record<string, Quote> = {};
      quotes.forEach((q) => (quoteMap[q.symbol] = q));
      setSectorQuotes(quoteMap);
    } finally {
      setLoading(false);
      setBoxesRefreshing(false);
    }
  }, [boxRange]);

  useEffect(() => {
    void loadBoxes();
  }, [loadBoxes]);

  // Nasdaq Top 14
  const nasdaqItems = Object.values(leaderCharts).map((ch) => {
    const last = ch.candles.at(-1);
    const prev = ch.candles.at(-2);
    const change = prev && last ? ((last.close - prev.close) / prev.close) * 100 : 0;
    return { symbol: ch.symbol, change };
  });

  // S&P Sectors (with labels)
  const sectorItems = SECTOR_ETFS.map((s) => ({
    symbol: s.symbol,
    label: s.label,
    change: sectorQuotes[s.symbol]?.changePercent ?? 0,
  }));

  return (
    <section className="ml-panel">
      {/* Chart timeframe selector */}
      <div className="ml-header mc-head">
        <div>
          <h3>Market Leaders</h3>
          <p>VIX + Asia • Nasdaq Top 14 • S&P Sectors</p>
        </div>
        <div className="mc-controls">
          <div className="mc-segment">
            {TIMEFRAMES.map((r) => (
              <button
                key={r}
                className={chartRange === r ? 'is-active' : ''}
                onClick={() => setChartRange(r)}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>

          {/* ← ADD THIS BUTTON HERE */}
          <button
            type="button"
            className="cp-refresh"
            onClick={() => setChartRefreshKey((k) => k + 1)}
            aria-label="Refresh charts"
            title="Refresh charts"
          >
            <IconRefresh size={14} />
          </button>
        </div>
      </div>

    {/* Scrollable area */}
    <div className="ml-scroll-area">
      {/* 4 Charts */}
      <LeadChartPanel range={chartRange} refreshKey={chartRefreshKey} />
      {/* Box timeframe selector */}
      <div className="ml-box-header">
        <span className="ml-box-title">Session Performance</span>
        <div className="mc-segment">
          {TIMEFRAMES.map((r) => (
            <button
              key={r}
              className={boxRange === r ? 'is-active' : ''}
              onClick={() => setBoxRange(r)}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
        {/* ← ADD THIS BUTTON HERE */}
        <button
          type="button"
          className="cp-refresh"
          onClick={() => void loadBoxes(true)}
          aria-label="Refresh session performance"
          title="Refresh session performance"
          disabled={boxesRefreshing || loading}
        >
          <IconRefresh
            size={14}
            className={boxesRefreshing ? 'is-spinning' : undefined}
          />
        </button>
      </div>

      {/* Two info boxes */}
      <div className="ml-lower-grid">
        <MoversBox title="Nasdaq 100 Top 14" items={nasdaqItems} />
        <MoversBox title="S&P 500 Sectors" items={sectorItems} />
      </div>
     </div> 
    </section>
  );
}