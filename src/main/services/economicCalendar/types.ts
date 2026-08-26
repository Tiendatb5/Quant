
import type { EconomicEvent, EconomicImpact } from '../../../shared/types';

export type { EconomicEvent, EconomicImpact };

/** Raw item from economic-calendar.tradingview.com */
export interface TradingViewEvent {
  id?: string | number;
  title?: string;
  country?: string;
  currency?: string;
  importance?: number;
  date?: string;
  datetime?: string;
  eventDate?: string;
  actual?: string | number | null;
  forecast?: string | number | null;
  previous?: string | number | null;
  indicator?: string;
  period?: string;
  unit?: string;
  ticker?: string;
  comment?: string;
}

export interface TradingViewResponse {
  result?: TradingViewEvent[];
  status?: string;
}

export interface FetchCalendarOptions {
  from?: Date;
  to?: Date;
  /** Comma-separated country codes, e.g. "US" or "US,JP" */
  country?: string;
  /** 0=low, 1=medium, 2=high. Default often 1 */
  minImportance?: number;
}