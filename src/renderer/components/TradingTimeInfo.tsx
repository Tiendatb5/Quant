// src/renderer/components/TimeInfo.tsx
import React, { useState, useEffect } from 'react';
import { buildDashboard, DashboardInfo } from '../utils/tradingSession';

const TradingTimeInfo: React.FC = () => {
  const [now, setNow] = useState(new Date());
  const [dashboard, setDashboard] = useState<DashboardInfo | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

useEffect(() => {
    const tick = () => {
      const current = new Date();
      setNow(current);
      setDashboard(buildDashboard());
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  // Local time (browser timezone = Asia/Ho_Chi_Minh for you)
  const formatLocal = (date: Date) =>
    date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

  // True UTC
  const formatUTC = (date: Date) =>
    date.toLocaleTimeString('en-GB', {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

  // Optional: also show Eastern Time so you can verify the session logic
  const formatET = (date: Date) =>
    date.toLocaleTimeString('en-GB', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

return (
    <div className="cp-panel" style={{ height: '100%' }}>
      {/* Header */}
      <div className="cp-chrome">
        <div className="cp-head">
          <div className="cp-head-text">
            <h2 className="cp-title">Market Session</h2>
            <p className="cp-caption">MNQ trade timing score</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div
        className="cp-body"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          paddingTop: 4,
        }}
      >
        {/* Time rows */}
        <div style={rowStyle}>
          <span>Local Time (VN)</span>
          <span className="num" style={timeStyle}>
            {formatLocal(now)}
          </span>
        </div>

        <div style={rowStyle}>
          <span>UTC Time</span>
          <span className="num" style={timeStyle}>
            {formatUTC(now)}
          </span>
        </div>

        <div
          style={{
            ...rowStyle,
            paddingBottom: 8,
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <span>Eastern Time</span>
          <span className="num" style={timeStyle}>
            {formatET(now)}
          </span>
        </div>

        {/* Dashboard */}
        {dashboard && (
          <>
            {/* Score row */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                padding: '10px 8px 6px',
              }}
            >
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                MNQ Trade Score
              </span>
              <span
                className="num"
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: 'var(--text-1)',
                }}
              >
                {dashboard.tradeScore}
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  /100
                </span>
              </span>
            </div>

            {/* Recommendation chip */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setShowExplanation((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setShowExplanation((v) => !v);
                }
              }}
              style={{
                margin: '0 8px 8px',
                padding: '6px 10px',
                borderRadius: 'var(--r-sm)',
                background: `${dashboard.recommendationColor}18`,
                borderLeft: `3px solid ${dashboard.recommendationColor}`,
                cursor: 'pointer',
                transition: 'background var(--t-fast)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `${dashboard.recommendationColor}28`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = `${dashboard.recommendationColor}18`;
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  fontSize: 12,
                  color: dashboard.recommendationColor,
                }}
              >
                {dashboard.recommendationText}
              </span>
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 10,
                  color: 'var(--text-3)',
                }}
              >
                {showExplanation ? '▲ Hide details' : '▼ Details'}
              </span>
            </div>

            {/* Explanation */}
            {showExplanation && (
              <div
                style={{
                  margin: '0 8px 12px',
                  padding: '10px 12px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--r-sm)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  lineHeight: 1.55,
                  color: 'var(--text-2)',
                  whiteSpace: 'pre-wrap',
                  maxHeight: 380,
                  overflowY: 'auto',
                }}
              >
                {dashboard.explanation}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// small style helpers
const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  padding: '6px 8px',
  fontSize: 12,
  color: 'var(--text-2)',
};

const timeStyle: React.CSSProperties = {
  color: 'var(--text-1)',
  fontWeight: 500,
};

export default TradingTimeInfo;