export type TimeframeKey = '1M' | '5M' | '15M' | '1H' | '4H';

export const TIMEFRAMES: TimeframeKey[] = ['1M', '5M', '15M', '1H', '4H'];

export const TIMEFRAME_TO_SDK: Record<
  TimeframeKey,
  '1m' | '5m' | '15m' | '1h' | '4h'
> = {
  '1M': '1m',
  '5M': '5m',
  '15M': '15m',
  '1H': '1h',
  '4H': '4h',
};

export const TIMEFRAME_SECONDS: Record<TimeframeKey, number> = {
  '1M': 60,
  '5M': 300,
  '15M': 900,
  '1H': 3600,
  '4H': 14400,
};

export const PRIORITY_SYMBOLS = [
  'BTCUSDT_PERP',
  'BTCUSDT_SPOT',
  'ETHUSDT_PERP',
  'ETHUSDT_SPOT',
  'SOLUSDT_PERP',
  'SOLUSDT_SPOT',
  'XAUUSD',
  'FH_NAS100',
  'EURUSD',
  'USDJPY',
  'GBPUSD',
  'BTCUSD',
  'BTCUSD.PERP',
  'ETHUSD',
] as const;

export interface OhlcBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface WatchInstrument {
  symbol: string;
  shortLabel: string;
  name: string;
  category: string;
  venue: string;
  sizeUnit: string;
  price: number | null;
  decimals: number;
  changePct: number | null;
  close24h: number | null;
  bid: number | null;
  ask: number | null;
  spreadBp: string;
  high24h: number | null;
  low24h: number | null;
  volume: number | null;
  source: string;
  sessionState: string | null;
  spark: number[];
  updatedAt: string | null;
}

export interface UniverseSymbol {
  symbol: string;
  name: string;
  category: string;
  exchange: string;
  source: string;
  decimals: number;
  price: number | null;
}

export interface BenchmarkRow {
  sym: string;
  name: string;
  targetSymbol?: string;
  last: number | null;
  pct: number | null;
  close24h: number | null;
  decimals: number;
  source: string;
  unavailableReason?: string;
}

export type HeatmapGroup =
  | 'Forex'
  | 'Indices'
  | 'Commodities'
  | 'Crypto'
  | 'Bonds'
  | 'Equities';

export interface HeatmapTile {
  symbol: string;
  label: string;
  group: HeatmapGroup;
  rawCategory: string;
  price: number | null;
  decimals: number;
  changePct: number | null;
  close24h: number | null;
  volume: number | null;
  span: 1 | 2;
}

export interface MarketSnapshotResponse {
  configured: boolean;
  timestamp: string;
  catalogCount: number;
  defaultStreamCount: number;
  activePriceCount: number;
  instruments: WatchInstrument[];
  universe: UniverseSymbol[];
  benchmarks: BenchmarkRow[];
  heatmap: HeatmapTile[];
}

export interface OrderBookLevelRow {
  price: number;
  size: number;
  pct: number;
}

export interface OrderBookSnapshot {
  symbol: string;
  isLive: boolean;
  depthType: string;
  venue: string | null;
  sizeUnit: string | null;
  spreadBp: string | null;
  sourceTimestampMs: number | null;
  receivedAtMs: number | null;
  unavailableReason: string | null;
  asks: OrderBookLevelRow[];
  bids: OrderBookLevelRow[];
}

export type TapeRow =
  | {
      kind: 'trade';
      id: string;
      time: string;
      side: 'BUY' | 'SELL';
      size: number;
      price: number;
    }
  | {
      kind: 'quote';
      id: string;
      time: string;
      bid: number | null;
      ask: number | null;
      price: number;
    };

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  imageUrl?: string;
  publishedAt: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface SocialItem {
  id: string;
  author: string;
  handle: string;
  text: string;
  url: string;
  createdAt: string;
  platform: string;
}

export interface EconEventItem {
  id: string;
  date: string;
  timeLabel: string;
  cur: string;
  country: string;
  event: string;
  imp: 'HI' | 'MED' | 'LOW';
  actual: string;
  fcst: string;
  prev: string;
  released: boolean;
}

export interface FearGreedComponent {
  key: string;
  name: string;
  val: number;
}

export interface FearGreedData {
  score: number;
  label: string;
  updatedAt: string | null;
  components: FearGreedComponent[];
}

export interface MacroMapCountry {
  countryCode: string;
  countryName: string;
  flag: string;
  region: string;
  value: number;
  previousValue: number | null;
  change: number | null;
  rank: number;
  period: string;
}

export interface MacroMapData {
  indicator: string;
  indicatorName: string;
  unit: string;
  period: string;
  source: string | null;
  isLive: boolean;
  total: number;
  countries: MacroMapCountry[];
}

export interface StreamQuoteEvent {
  symbol: string;
  price: number;
  bid: number | null;
  ask: number | null;
  quantity: number | null;
  isBuyerMaker: boolean | null;
  volumeAvailable: boolean;
  timestampMs: number;
  receivedAtMs: number;
}

export interface TvChannelPreset {
  id: string;
  name: string;
  type: 'video';
  target: string;
  desk: string;
}

// Public 24/7 live broadcast presets
export const TV_CHANNELS: TvChannelPreset[] = [
  { id: 'sky', name: 'LONDON LIVE', type: 'video', target: '9Auq9mYxFEE', desk: 'GLOBAL · LIVE' },
  { id: 'dw', name: 'FRANKFURT LIVE', type: 'video', target: 'nv9UOmD9a1s', desk: 'EU · LIVE' },
  { id: 'markets', name: 'MARKET TV', type: 'video', target: 'coY5sK1s31c', desk: 'US · LIVE' },
  { id: 'lofi', name: 'AMBIENT AUDIO', type: 'video', target: 'jfKfPfyJRdk', desk: 'AUDIO · 24/7' },
];

export const MACRO_INDICATORS = [
  { id: 'inflation', label: 'Inflation Rate' },
  { id: 'interest_rate', label: 'Interest Rate' },
  { id: 'gdp_growth', label: 'GDP Growth' },
  { id: 'unemployment', label: 'Unemployment' },
] as const;

export function normSymbolKey(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/[/\\\-_\s]/g, '');
}

export function shortSymbolLabel(symbol: string): string {
  if (symbol.length <= 12) return symbol;
  return `${symbol.slice(0, 9)}...`;
}

export function inferDecimals(price: number | null | undefined, precision?: number | null): number {
  if (typeof precision === 'number' && Number.isInteger(precision) && precision >= 0 && precision <= 8) {
    return precision;
  }
  if (price == null || !Number.isFinite(price) || price <= 0) return 2;
  if (price >= 1000) return 2;
  if (price >= 100) return 3;
  if (price >= 10) return 2;
  if (price >= 1) return 4;
  return 5;
}

export function formatPrice(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const clamped = Math.min(Math.max(decimals, 0), 6);
  const minFrac = val < 2 && clamped >= 4 ? Math.min(clamped, 4) : Math.min(clamped, 2);
  return val.toLocaleString('en-US', {
    minimumFractionDigits: minFrac,
    maximumFractionDigits: clamped,
  });
}

export function formatSignedPct(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const sign = val > 0 ? '+' : val < 0 ? '−' : '';
  return `${sign}${Math.abs(val).toFixed(2)}%`;
}

export function formatOrderSize(size: number | null | undefined): string {
  if (size === null || size === undefined || !Number.isFinite(size)) return '—';
  if (size >= 1000) return size.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (size >= 1) return size.toFixed(2);
  return size.toFixed(4).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
}

export function formatTradeSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '—';
  if (size < 0.00000001) return size.toExponential(2);
  return size.toFixed(8).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
}

export function computeSpreadBp(bid: number | null | undefined, ask: number | null | undefined): string {
  if (
    bid === null ||
    bid === undefined ||
    ask === null ||
    ask === undefined ||
    !Number.isFinite(bid) ||
    !Number.isFinite(ask) ||
    bid <= 0 ||
    ask <= bid
  ) {
    return '—';
  }
  const mid = (ask + bid) / 2;
  const bp = ((ask - bid) / mid) * 10000;
  return `${bp.toFixed(1)} bp`;
}

export function computePct24h(price: number | null | undefined, close24h: number | null | undefined): number | null {
  if (
    price === null ||
    price === undefined ||
    close24h === null ||
    close24h === undefined ||
    !Number.isFinite(price) ||
    !Number.isFinite(close24h) ||
    price <= 0 ||
    close24h <= 0
  ) {
    return null;
  }
  return ((price - close24h) / close24h) * 100;
}

export function isCryptoUsdtTradeMode(category: string, symbol: string): boolean {
  const norm = symbol.toUpperCase().replace(/[/\-_]/g, '');
  return (
    category.toLowerCase() === 'crypto' &&
    (norm.endsWith('USDT') || norm.endsWith('USDTSPOT') || norm.endsWith('USDTPERP'))
  );
}

export function categoryForHeatmap(assetType: string, symbol: string): HeatmapGroup {
  const sym = symbol.toUpperCase();
  const type = assetType.toLowerCase();
  if (
    type.includes('crypto') ||
    /USDT(_SPOT|_PERP)?$/.test(sym) ||
    sym.startsWith('BTC') ||
    sym.startsWith('ETH') ||
    sym.startsWith('SOL')
  ) {
    return 'Crypto';
  }
  if (
    type.includes('index') ||
    type.includes('indices') ||
    /^(US\s?500|FH_NAS100|FH_SPX500|DE\s?40|JP\s?225|UK\s?100|US\s?30|AUS\s?200|STOXX)/.test(sym)
  ) {
    return 'Indices';
  }
  if (type === 'bond' || type === 'credit' || /TREASURY|BOND|CREDIT|GILT|BUND/.test(sym)) {
    return 'Bonds';
  }
  if (
    type.includes('metal') ||
    type.includes('commodity') ||
    type.includes('energy') ||
    /^(XAU|XAG|WTI|USOIL|UKOIL|BRENT|NAT\.GAS|COPPER|PLATINUM)/.test(sym)
  ) {
    return 'Commodities';
  }
  if (type.includes('forex') || type.includes('fx') || type.includes('currency')) {
    return 'Forex';
  }
  if (type.includes('stock') || type.includes('equity')) {
    return 'Equities';
  }
  if (/^[A-Z]{6}$/.test(sym)) return 'Forex';
  return 'Bonds';
}

export function sizeUnitFor(category: string, symbol: string): string {
  const sym = symbol.toUpperCase();
  const cat = category.toLowerCase();
  if (cat === 'crypto' || /USDT(_SPOT|_PERP)?$/.test(sym)) {
    const match = sym.match(/^([A-Z0-9]+?)(?:USDT(?:_SPOT|_PERP)?|USD(?:\.PERP)?)$/);
    if (match?.[1]) return match[1];
    return 'COIN';
  }
  if (cat === 'metal') return 'OZ';
  if (cat === 'forex') return 'LOT';
  return 'UNIT';
}

export function computeEma(
  bars: OhlcBar[],
  period: number,
): Array<{ time: number; value: number }> {
  const k = 2 / (period + 1);
  let prev: number | null = null;
  const out: Array<{ time: number; value: number }> = [];
  for (let i = 0; i < bars.length; i += 1) {
    const close = bars[i].close;
    prev = prev === null ? close : close * k + prev * (1 - k);
    if (i >= period - 1 && Number.isFinite(prev)) {
      out.push({ time: bars[i].time, value: Number(prev.toFixed(6)) });
    }
  }
  return out;
}

const SYMBOL_ALIASES: Record<string, string[]> = {
  BTC: ['BTCUSDT_SPOT', 'BTCUSDT_PERP', 'BTCUSD'],
  ETH: ['ETHUSDT_PERP', 'ETHUSDT_SPOT', 'ETHUSD'],
  SOL: ['SOLUSDT_SPOT', 'SOLUSDT_PERP'],
  GOLD: ['XAUUSD'],
  XAU: ['XAUUSD'],
  SILVER: ['XAGUSD'],
  XAG: ['XAGUSD'],
  NAS: ['FH_NAS100'],
  NASDAQ: ['FH_NAS100'],
  NAS100: ['FH_NAS100'],
  SPX: ['FH_SPX500', 'US 500'],
  SP500: ['FH_SPX500', 'US 500'],
  OIL: ['USOIL', 'WTI'],
  WTI: ['USOIL', 'WTI'],
  EUR: ['EURUSD'],
  GBP: ['GBPUSD'],
  JPY: ['USDJPY'],
  TREASURY: ['20+ YEAR TREASURY BOND'],
  BOND: ['20+ YEAR TREASURY BOND'],
  DOLLAR: ['DXY', 'DB US DOLLAR INDEX'],
};

export function resolveSymbolQuery(
  rawQuery: string,
  instruments: WatchInstrument[],
  universe: UniverseSymbol[],
): string | null {
  const clean = rawQuery.trim().toUpperCase();
  if (!clean) return null;
  const norm = normSymbolKey(clean);

  const exactWatch = instruments.find((i) => i.symbol.toUpperCase() === clean);
  if (exactWatch) return exactWatch.symbol;

  const exactUniv = universe.find((u) => u.symbol.toUpperCase() === clean);
  if (exactUniv) return exactUniv.symbol;

  const aliasCandidates = SYMBOL_ALIASES[norm] ?? [];
  for (const candidate of aliasCandidates) {
    const inWatch = instruments.find((i) => i.symbol.toUpperCase() === candidate);
    if (inWatch) return inWatch.symbol;
    const inUniv = universe.find((u) => u.symbol.toUpperCase() === candidate);
    if (inUniv) return inUniv.symbol;
  }

  const normWatch = instruments.find((i) => normSymbolKey(i.symbol) === norm);
  if (normWatch) return normWatch.symbol;

  const normUniv = universe.find((u) => normSymbolKey(u.symbol) === norm);
  if (normUniv) return normUniv.symbol;

  const partialWatch = instruments.find(
    (i) =>
      normSymbolKey(i.symbol).includes(norm) ||
      i.name.toUpperCase().includes(clean),
  );
  if (partialWatch) return partialWatch.symbol;

  const partialUniv = universe.find(
    (u) =>
      normSymbolKey(u.symbol).includes(norm) ||
      u.name.toUpperCase().includes(clean),
  );
  if (partialUniv?.symbol) return partialUniv.symbol;

  if (instruments.length === 0 && universe.length === 0) {
    const exactPriority = PRIORITY_SYMBOLS.find((s) => s.toUpperCase() === clean);
    if (exactPriority) return exactPriority;
    const aliasFirst = SYMBOL_ALIASES[norm]?.[0];
    if (aliasFirst) return aliasFirst;
    const normPriority = PRIORITY_SYMBOLS.find((s) => normSymbolKey(s) === norm);
    if (normPriority) return normPriority;
  }

  return null;
}

export function formatRelativeDateTime(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '—';
  const d = new Date(parsed);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatClockTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
