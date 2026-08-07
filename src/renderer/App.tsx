import React from 'react';
import { AppProvider, useApp } from './store';
import { TopBar } from './components/TopBar';
import { Watchlist } from './components/Watchlist';
import { CenterTabs } from './components/CenterTabs';
import { EarningsCalendar } from './components/EarningsCalendar';
import { ChartModal } from './components/ChartModal';
import { OnboardingWizard } from './components/OnboardingWizard';
import TradingTimeInfo  from  './components/TradingTimeInfo';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary" role="alert">
          <div>
            <h1>Something went wrong</h1>
            <p>{String(this.state.error)}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Shell() {
  const { state } = useApp();
  return (
    <div className="app-shell">
      <div className="topbar-slot">
        <TopBar />
      </div>
      <aside className="sidebar-slot" aria-label="Watchlist">
        <Watchlist />
      </aside>
      <main className="center-slot" aria-label="Workspace">
        <CenterTabs />
      </main>
      <section className="right-slot" aria-label="Earnings calendar and market session">
        {/* Top half: Earnings */}
        <div
          style={{
            flex: '1 1 50%',
            minHeight: 0,
            overflow: 'hidden',          // was 'auto' — clip to half
            display: 'flex',
            flexDirection: 'column',
            borderBottom: '1px solid var(--border-subtle, #333)',
          }}
        >
          <EarningsCalendar />
        </div>

        {/* Bottom half: TradingTimeInfo */}
        <div
          style={{
            flex: '1 1 50%',
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <TradingTimeInfo />
        </div>
      </section>
      {state.modalSymbol && (
        <ChartModal key={state.modalSymbol} symbol={state.modalSymbol} />
      )}
      <OnboardingWizard />
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ErrorBoundary>
  );
}
