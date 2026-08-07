import { useEffect, useRef, useState } from 'react';
import {
  ColorType,
  CrosshairMode,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { ChartData, ChartRange } from '../../shared/types';
import { api } from '../api';

const ASSETS = [
  { symbol: '^VIX', label: 'VIX' },
  { symbol: '^KS11', label: 'KOSPI' },
  { symbol: '^N225', label: 'Nikkei' },
  { symbol: '^HSI', label: 'Hang Seng' },
];

const C = {
  text: '#9aa6bd',
  grid: 'rgba(32, 43, 66, 0.45)',
  up: '#1fbf75',
  down: '#f0435c',
} as const;

function CandlestickChart({ data }: { data: ChartData }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = createChart(host, {
      width: Math.max(host.clientWidth, 1),
      height: 220,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: C.text,
        fontSize: 11,
        fontFamily: "'Cascadia Mono', Consolas, ui-monospace, monospace",
      },
      grid: {
        vertLines: { color: C.grid },
        horzLines: { color: C.grid },
      },
      rightPriceScale: { borderColor: C.grid },
      timeScale: { borderColor: C.grid, timeVisible: true },
      crosshair: { mode: CrosshairMode.Normal },
    });

    const series = chart.addCandlestickSeries({
      upColor: C.up,
      downColor: C.down,
      wickUpColor: C.up,
      wickDownColor: C.down,
      borderVisible: false,
    });

    const observer = new ResizeObserver((entries) => {
      const rect = entries[entries.length - 1].contentRect;
      if (rect.width > 0 && rect.height > 0) {
        chart.applyOptions({ width: Math.floor(rect.width), height: 220 });
      }
    });
    observer.observe(host);

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !data.candles.length) return;

    const candles: CandlestickData<Time>[] = data.candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    series.setData(candles);
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return <div ref={hostRef} style={{ height: 220, width: '100%' }} />;
}

export function LeadChartPanel({range,refreshKey = 0,}: {range: ChartRange;refreshKey?: number;}) {
  const [charts, setCharts] = useState<Record<string, ChartData>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all(ASSETS.map((a) => api.getChart(a.symbol, range)))
      .then((results) => {
        const map: Record<string, ChartData> = {};
        results.forEach((c) => (map[c.symbol] = c));
        setCharts(map);
      })
      .finally(() => setLoading(false));
  }, [range, refreshKey]);

  return (
    <div className="lead-charts">
      <div className="lead-grid">
        {ASSETS.map((asset) => (
          <div key={asset.symbol} className="lead-tile">
            <div className="lead-title">{asset.label}</div>
            {charts[asset.symbol] ? (
              <CandlestickChart data={charts[asset.symbol]} />
            ) : (
              <div className="lead-loading">{loading ? 'Loading…' : 'No data'}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}