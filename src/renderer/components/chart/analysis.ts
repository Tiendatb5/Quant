// Re-exports pure price structure and trend-line analysis from shared code.

export type { TrendLinePoint, TrendLines } from '../../../shared/priceStructure';
export {
  pivotWindow,
  isPivotAt,
  prominenceAt,
  findPivots,
  projectLine,
  computeTrendLines,
} from '../../../shared/priceStructure';
