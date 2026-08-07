// src/renderer/utils/tradingSession.ts

// --- Enums (matches your VB.NET) ---
export enum MarketSession {
  NewYork = 'NewYork',
  London = 'London',
  Tokyo = 'Tokyo',
  Closed = 'Closed',
}

export enum TradingZone {
  NYOpen = 'NYOpen',         // 9:30 - 11:00 AM ET   ← expanded
  LondonOpen = 'LondonOpen', // 3:00 - 4:30 AM ET    ← expanded
  PowerHour = 'PowerHour',   // 2:30 - 4:00 PM ET    ← starts earlier
  Lunch = 'Lunch',           // 11:30 AM - 1:30 PM ET ← expanded
  Normal = 'Normal',
}

export enum TradeRecommendation {
  Excellent, // 85+
  Good,      // 70+
  Acceptable,// 55+
  Wait,      // 40+
  NoTrade,   // < 40
}

// --- Interface for the Dashboard ---
export interface DashboardInfo {
  session: MarketSession;
  zone: TradingZone;
  sessionScore: number;
  zoneScore: number;
  riskPenalty: number;
  tradeScore: number;
  recommendation: TradeRecommendation;
  explanation: string;
  recommendationText: string;
  recommendationColor: string; // hex or css color
}

// --- Time Helpers (reliable, DST-aware) ---

/** Extract hour / minute / weekday in a given IANA timezone */
function getZonedParts(timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    weekday: 'short',
  });

  const parts = fmt.formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '0';

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  // Some engines return "24" for midnight → normalize to 0
  const hours = parseInt(get('hour'), 10) % 24;
  const minutes = parseInt(get('minute'), 10);
  const day = weekdayMap[get('weekday')] ?? 0;

  return { hours, minutes, day };
}

const getTotalMinutes = (hours: number, minutes: number): number =>
  hours * 60 + minutes;

// Convenience wrappers
const getET = () => getZonedParts('America/New_York');
const getVN = () => getZonedParts('Asia/Ho_Chi_Minh');

// --- 1. Determine Current Session ---
const getCurrentSession = (): MarketSession => {
  const { hours, minutes, day } = getET();
  const mins = getTotalMinutes(hours, minutes);

  // Weekends are Closed
  if (day === 0 || day === 6) return MarketSession.Closed;

  // NY Session: 9:30 AM (570) – 4:00 PM (960) ET
  if (mins >= 570 && mins < 960) return MarketSession.NewYork;

  // London Session: 2:00 AM (120) – 5:00 AM (300) ET (approx)
  if (mins >= 120 && mins < 300) return MarketSession.London;

  // Tokyo Session: 7:00 PM (1140) – 4:00 AM (240) ET (overnight)
  if (mins >= 1140 || mins < 240) return MarketSession.Tokyo;

  return MarketSession.Closed;
};

// --- 2. Determine Trading Zone ---
const getTradingZone = (): TradingZone => {
  const { hours, minutes } = getET();
  const mins = getTotalMinutes(hours, minutes);

  // NY Kill Zone: 9:30 – 11:00 (570 – 660)
  if (mins >= 570 && mins < 660) return TradingZone.NYOpen;

  // London Kill Zone: 3:00 – 4:30 (180 – 270)
  if (mins >= 180 && mins < 270) return TradingZone.LondonOpen;

  // Power Hour: 2:30 – 4:00 PM (870 – 960)
  if (mins >= 870 && mins < 960) return TradingZone.PowerHour;

  // Lunch: 11:30 AM – 1:30 PM (690 – 810)
  if (mins >= 690 && mins < 810) return TradingZone.Lunch;

  return TradingZone.Normal;
};

// --- 3. Risk Penalty (Vietnam time) ---
const getRiskPenalty = (): number => {
  let penalty = 0;
  const { hours, minutes, day } = getVN();
  const now = getTotalMinutes(hours, minutes);

  // First 15 minutes after NY Open (20:30 – 20:45 Vietnam)
  if (now >= 1230 && now < 1245) {
    penalty -= 30;
  }

  // Wednesday Night Risk (22:00 – 02:00 Vietnam)
  if (day === 3) {
    if (now >= 1320 || now < 120) {
      penalty -= 25;
    }
  }

  return penalty;
};

// --- Updated calculateTradeScore (no longer needs Date args) ---
const calculateTradeScore = (
  session: MarketSession,
  zone: TradingZone
): number => {
  let score = 0;
  score += getSessionScore(session);
  score += getZoneScore(zone);
  score += getRiskPenalty();
  return Math.min(100, Math.max(0, score));
};

// --- Updated explanation builder (uses getVN when needed) ---
const getTradeExplanation = (info: DashboardInfo): string => {
  let sb = 'WHY?\n\n';

  switch (info.session) {
    case MarketSession.NewYork:
      sb += '✔ New York session\n Highest liquidity.\n Institutions are active.\n\n';
      break;
    case MarketSession.London:
      sb += '✔ London session\n Moderate liquidity.\n Watch for trend continuation.\n\n';
      break;
    case MarketSession.Tokyo:
      sb += '⚠ Tokyo session\n Lower volatility.\n NQ often ranges.\n\n';
      break;
    default:
      sb += '✘ Market closed\n Avoid opening new positions.\n\n';
  }

  switch (info.zone) {
    case TradingZone.NYOpen:
      sb += '✔ NY Kill Zone (9:30–11:00)\n Best opportunity for momentum trades.\n\n';
      break;
    case TradingZone.LondonOpen:
      sb += '✔ London Kill Zone (3:00–4:30)\n Good volatility.\n\n';
      break;
    case TradingZone.PowerHour:
      sb += '✔ Power Hour (14:30–16:00)\n Closing institutions rebalance.\n\n';
      break;
    case TradingZone.Lunch:
      sb += '✘ Lunch Session (11:30–13:30)\n Volume drops.\n Fake breakouts become common.\n\n';
      break;
    default:
      sb += '⚠ Normal trading hours.\n Wait for A+ setups.\n\n';
  }

  if (info.riskPenalty < 0) {
    sb += '⚠ Time Risk\n';
    const { hours, minutes } = getVN();
    const mins = getTotalMinutes(hours, minutes);
    if (mins >= 1230 && mins < 1245) {
      sb += ' First 15 minutes after NY Open.\n Extremely volatile.\n Wait for market direction.\n';
    } else {
      sb += ' High-risk period.\n Reduce trading size.\n';
    }
    sb += '\n';
  }

  sb += '--------------------------------\n';
  sb += `Session Score : +${info.sessionScore}\n`;
  sb += `Zone Score    : +${info.zoneScore}\n`;
  sb += `Risk Penalty  : ${info.riskPenalty}\n\n`;
  sb += `TOTAL SCORE   : ${info.tradeScore}/100`;
  return sb;
};


// --- Score Functions ---
const getSessionScore = (session: MarketSession): number => {
  switch (session) {
    case MarketSession.NewYork: return 35;
    case MarketSession.London:  return 20;
    case MarketSession.Tokyo:   return 10;
    default:                    return 0;
  }
};

const getZoneScore = (zone: TradingZone): number => {
  switch (zone) {
    case TradingZone.NYOpen:     return 30;
    case TradingZone.PowerHour:  return 25;
    case TradingZone.LondonOpen: return 15;
    case TradingZone.Lunch:      return -15;   // was -20
    default:                     return 0;
  }
};

// --- Recommendation helpers ---
const getRecommendation = (score: number): TradeRecommendation => {
  if (score >= 85) return TradeRecommendation.Excellent;
  if (score >= 70) return TradeRecommendation.Good;
  if (score >= 55) return TradeRecommendation.Acceptable;
  if (score >= 40) return TradeRecommendation.Wait;
  return TradeRecommendation.NoTrade;
};

const getRecommendationText = (rec: TradeRecommendation): string => {
  switch (rec) {
    case TradeRecommendation.Excellent:  return '★★★★★ EXCELLENT SETUP';
    case TradeRecommendation.Good:       return '★★★★ GOOD TRADE';
    case TradeRecommendation.Acceptable: return '★★★ ACCEPTABLE';
    case TradeRecommendation.Wait:       return '★★ WAIT';
    case TradeRecommendation.NoTrade:    return '★ NO TRADE';
  }
};

const getRecommendationColor = (rec: TradeRecommendation): string => {
  switch (rec) {
    case TradeRecommendation.Excellent:  return '#2e7d32'; // Dark Green
    case TradeRecommendation.Good:       return '#4caf50'; // Green
    case TradeRecommendation.Acceptable: return '#8bc34a'; // YellowGreen
    case TradeRecommendation.Wait:       return '#ffb300'; // Goldenrod
    case TradeRecommendation.NoTrade:    return '#b71c1c'; // Firebrick
  }
};

// --- Main builder ---
export const buildDashboard = (): DashboardInfo => {
  const session = getCurrentSession();
  const zone = getTradingZone();
  const sessionScore = getSessionScore(session);
  const zoneScore = getZoneScore(zone);
  const riskPenalty = getRiskPenalty();
  const tradeScore = calculateTradeScore(session, zone);
  const recommendation = getRecommendation(tradeScore);

  const info: DashboardInfo = {
    session,
    zone,
    sessionScore,
    zoneScore,
    riskPenalty,
    tradeScore,
    recommendation,
    recommendationText: getRecommendationText(recommendation),
    recommendationColor: getRecommendationColor(recommendation),
    explanation: '',
  };

  info.explanation = getTradeExplanation(info);
  return info;
};