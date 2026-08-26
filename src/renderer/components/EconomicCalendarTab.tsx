// src/renderer/components/EconomicCalendarTab.tsx
import { EconomicCalendar } from './EconomicCalendar';
import TradingTimeInfo from './TradingTimeInfo'; // your file

export function EconomicCalendarTab() {
  return (
    <div className="econ-tab-layout">
      <div className="econ-tab-main">
        <EconomicCalendar />
      </div>
      <aside className="econ-tab-side">
        <TradingTimeInfo />
      </aside>
    </div>
  );
}