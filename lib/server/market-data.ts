import 'server-only';
import {
  PRIORITY_SYMBOLS,
  TIMEFRAME_TO_SDK,
  categoryForHeatmap,
  computePct24h,
  computeSpreadBp,
  inferDecimals,
  shortSymbolLabel,
  sizeUnitFor,
  type BenchmarkRow,
  type EconEventItem,
  type FearGreedComponent,
  type FearGreedData,
  type HeatmapTile,
  type MacroMapCountry,
  type MacroMapData,
  type MarketSnapshotResponse,
  type NewsItem,
  type OhlcBar,
  type OrderBookLevelRow,
  type OrderBookSnapshot,
  type SocialItem,
  type TimeframeKey,
  type UniverseSymbol,
  type WatchInstrument,
} from '@/lib/market';
import { RELEASE } from '@/lib/release';
import {
  createPiaClient,
  decodeHtmlText,
  fetchPiaJson,
  finiteNum,
  positiveNum,
  publicPayload,
  record,
  sanitizeHttpUrl,
  sanitizeHttpsUrl,
  text,
} from './pia';

interface CatalogEntry {
  symbol: string;
  name: string;
  assetType: string;
  exchange: string;
  source: string;
  decimals: number;
  lastPrice: number | null;
}

interface DailyBaselineEntry {
  close24h: number | null;
  spark: number[];
  fetchedAt: number;
  ok: boolean;
}

interface MarketDataStore {
  catalog: CatalogEntry[] | null;
  catalogFetchedAt: number;
  catalogPromise: Promise<CatalogEntry[]> | null;
  dailyCache: Map<string, DailyBaselineEntry>;
  dailyInflight: Map<string, Promise<DailyBaselineEntry>>;
}

const STORE_KEY = Symbol.for('orca.website.marketDataStore');
const CATALOG_TTL_MS = 5 * 60_000;
const DAILY_OK_TTL_MS = 15 * 60_000;
const DAILY_ERR_TTL_MS = 60_000;

function getStore(): MarketDataStore {
  const g = globalThis as Record<symbol, MarketDataStore | undefined>;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = {
      catalog: null,
      catalogFetchedAt: 0,
      catalogPromise: null,
      dailyCache: new Map(),
      dailyInflight: new Map(),
    };
  }
  return g[STORE_KEY];
}

function sanitizePublicVenue(
  rawExchange: string,
  rawSource: string,
  category: string,
  symbol: string,
): string {
  const upper = `${rawExchange} ${rawSource}`.toUpperCase();
  const symUpper = symbol.toUpperCase();
  const catLower = category.toLowerCase();
  if (upper.includes('CTRADER')) {
    if (catLower.includes('forex') || catLower === 'fx') return 'FX DESK';
    if (catLower.includes('metal')) return 'METALS';
    if (catLower.includes('index') || catLower.includes('indices')) return 'INDEX CFD';
    if (catLower.includes('bond') || catLower.includes('credit')) return 'RATES';
    return 'ORCA FEED';
  }
  if (upper.includes('BINANCE')) {
    if (symUpper.includes('_PERP')) return 'CRYPTO PERP';
    if (symUpper.includes('_SPOT')) return 'CRYPTO SPOT';
    return 'CRYPTO L2';
  }
  if (upper.includes('FINNHUB')) return 'INDEX FEED';
  if (upper.includes('TRADINGVIEW') || upper.includes('TVSCRAPER')) return 'DESKTOP APP';
  if (catLower.includes('crypto')) return 'CRYPTO FEED';
  if (catLower.includes('forex') || catLower === 'fx') return 'FX DESK';
  if (catLower.includes('metal')) return 'METALS';
  if (catLower.includes('index') || catLower.includes('indices')) return 'INDEX FEED';
  if (catLower.includes('bond') || catLower.includes('credit')) return 'RATES';
  return 'ORCA FEED';
}

function sanitizePublicSource(rawSource: string): string {
  const lower = rawSource.toLowerCase();
  if (lower.includes('ctrader')) return 'multi_asset';
  if (lower.includes('binance')) return 'spot_perp';
  if (lower.includes('finnhub')) return 'index_feed';
  if (lower.includes('tradingview') || lower.includes('tvscraper')) return 'desktop_feed';
  return 'orca_feed';
}

function parseTimestampMs(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw < 1e12 ? Math.round(raw * 1000) : Math.round(raw);
  }
  if (typeof raw === 'string' && raw.trim()) {
    if (/^\d+(\.\d+)?$/.test(raw.trim())) {
      const n = Number(raw.trim());
      if (Number.isFinite(n) && n > 0) {
        return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
      }
    }
    const ms = Date.parse(raw);
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return null;
}

async function getCatalog(
  sdk: ReturnType<typeof createPiaClient>,
  signal?: AbortSignal,
): Promise<CatalogEntry[]> {
  const store = getStore();
  const now = Date.now();
  if (store.catalog && now - store.catalogFetchedAt < CATALOG_TTL_MS) {
    return store.catalog;
  }
  if (store.catalogPromise) {
    return store.catalogPromise;
  }

  store.catalogPromise = (async () => {
    const deduped = new Map<string, CatalogEntry>();
    const pageSize = 500;
    for (let offset = 0; offset < 5000; offset += pageSize) {
      const page = await sdk.market.getSymbols({ limit: pageSize, offset, signal });
      const items = Array.isArray(page?.items) ? page.items : [];
      for (const raw of items) {
        if (!record(raw)) continue;
        const symbol = text(raw.symbol, 64).toUpperCase();
        if (!symbol) continue;
        const lastPrice = positiveNum(raw.last_price);
        const precision = finiteNum(raw.price_precision);
        deduped.set(symbol, {
          symbol,
          name: text(raw.name, 120) || symbol,
          assetType: text(raw.asset_type, 32) || 'instrument',
          exchange: text(raw.exchange, 32) || text(raw.source, 32) || 'ORCA FEED',
          source: text(raw.source, 32) || 'orca_feed',
          decimals: inferDecimals(lastPrice, precision),
          lastPrice,
        });
      }
      const total = finiteNum(page?.total);
      if (items.length === 0 || items.length < pageSize) break;
      if (total !== null && offset + items.length >= total) break;
    }

    const list = Array.from(deduped.values());
    if (list.length > 0) {
      store.catalog = list;
      store.catalogFetchedAt = Date.now();
    }
    return list;
  })();

  try {
    return await store.catalogPromise;
  } finally {
    store.catalogPromise = null;
  }
}

async function fetchDailyBaseline(
  sdk: ReturnType<typeof createPiaClient>,
  symbol: string,
): Promise<DailyBaselineEntry> {
  const store = getStore();
  const key = symbol.toUpperCase();
  const cached = store.dailyCache.get(key);
  const now = Date.now();
  if (cached) {
    const ttl = cached.ok ? DAILY_OK_TTL_MS : DAILY_ERR_TTL_MS;
    if (now - cached.fetchedAt < ttl) return cached;
  }

  const existing = store.dailyInflight.get(key);
  if (existing) return existing;

  const task = (async (): Promise<DailyBaselineEntry> => {
    try {
      const res = await sdk.market.getCandles(key, {
        timeframe: '1h',
        limit: 48,
        signal: AbortSignal.timeout(4500),
      });
      const rows = Array.isArray(res?.candles) ? res.candles : [];
      const byTime = new Map<number, { timeMs: number; open: number; close: number }>();
      for (const raw of rows) {
        if (!record(raw)) continue;
        const t = parseTimestampMs(raw.time ?? raw.timestamp);
        const close = positiveNum(raw.close);
        const open = positiveNum(raw.open ?? raw.close);
        if (t !== null && close !== null && open !== null) {
          byTime.set(t, { timeMs: t, open, close });
        }
      }
      const parsed = Array.from(byTime.values()).sort((a, b) => a.timeMs - b.timeMs);
      if (parsed.length === 0) {
        const entry: DailyBaselineEntry = { close24h: null, spark: [], fetchedAt: Date.now(), ok: false };
        store.dailyCache.set(key, entry);
        return entry;
      }

      const now = Date.now();
      const target = now - 86_400_000;
      const earliest = parsed[0];
      const latest = parsed[parsed.length - 1];
      const isStale = now - latest.timeMs > 36 * 3600_000;
      const tooShort = latest.timeMs - earliest.timeMs < 2 * 3600_000;
      const noCandleIn24h = latest.timeMs <= target;

      let close24h: number | null = null;
      if (!isStale && !tooShort && !noCandleIn24h) {
        const past = parsed.filter((c) => c.timeMs <= target);
        close24h =
          past.length > 0
            ? past[past.length - 1].close
            : (earliest.open ?? earliest.close ?? null);
      }

      const spark =
        parsed.length >= 2 && now - latest.timeMs <= 72 * 3600_000
          ? parsed.slice(-24).map((c) => c.close)
          : [];

      const entry: DailyBaselineEntry = { close24h, spark, fetchedAt: Date.now(), ok: true };
      store.dailyCache.set(key, entry);
      return entry;
    } catch {
      const entry: DailyBaselineEntry = { close24h: null, spark: [], fetchedAt: Date.now(), ok: false };
      store.dailyCache.set(key, entry);
      return entry;
    } finally {
      store.dailyInflight.delete(key);
    }
  })();

  store.dailyInflight.set(key, task);
  return task;
}

async function warmDailyBaselines(
  sdk: ReturnType<typeof createPiaClient>,
  symbols: string[],
  budgetMs = 3500,
): Promise<void> {
  const store = getStore();
  const now = Date.now();
  const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean)));
  const stale = unique.filter((sym) => {
    const cached = store.dailyCache.get(sym);
    if (!cached) return true;
    const ttl = cached.ok ? DAILY_OK_TTL_MS : DAILY_ERR_TTL_MS;
    return now - cached.fetchedAt >= ttl;
  });

  if (stale.length === 0) return;

  let cursor = 0;
  const maxWorkers = 8;
  const deadline = Date.now() + budgetMs;

  const workers = Array.from({ length: Math.min(maxWorkers, stale.length) }, async () => {
    while (cursor < stale.length && Date.now() < deadline) {
      const idx = cursor;
      cursor += 1;
      await fetchDailyBaseline(sdk, stale[idx]);
    }
  });

  await Promise.race([
    Promise.allSettled(workers),
    new Promise<void>((resolve) => setTimeout(resolve, budgetMs)),
  ]);
}

const BENCHMARK_DEFS = [
  { sym: 'DXY', name: 'US Dollar Index', symbols: ['DXY', 'DB US DOLLAR INDEX'] },
  { sym: 'SPX', name: 'S&P 500 Index Cash CFD', symbols: ['FH_SPX500', 'US 500'] },
  { sym: 'WTI', name: 'WTI Crude Oil', symbols: ['XTIUSD', 'USOIL', 'WTI'] },
  { sym: 'XAU', name: 'Gold Spot / U.S. Dollar', symbols: ['XAUUSD'] },
  { sym: 'NAS100', name: 'Nasdaq 100 Index Cash CFD', symbols: ['FH_NAS100', 'US TECH 100'] },
] as const;

const HEATMAP_CANDIDATES: Array<{ symbol: string; label: string; span?: 1 | 2 }> = [
  { symbol: 'EURUSD', label: 'Euro / US Dollar', span: 2 },
  { symbol: 'USDJPY', label: 'US Dollar / Japanese Yen', span: 2 },
  { symbol: 'GBPUSD', label: 'British Pound / US Dollar' },
  { symbol: 'AUDUSD', label: 'Australian Dollar / US Dollar' },
  { symbol: 'USDCAD', label: 'US Dollar / Canadian Dollar' },
  { symbol: 'USDCHF', label: 'US Dollar / Swiss Franc' },
  { symbol: 'FH_SPX500', label: 'S&P 500 Cash CFD', span: 2 },
  { symbol: 'FH_NAS100', label: 'Nasdaq 100 Cash CFD', span: 2 },
  { symbol: 'US 500', label: 'US 500 Index' },
  { symbol: 'GERMANY 40', label: 'Germany 40 Index' },
  { symbol: 'JAPAN 225', label: 'Japan 225 Index' },
  { symbol: 'UK 100', label: 'UK 100 Index' },
  { symbol: 'US 30', label: 'US 30 Index' },
  { symbol: 'XAUUSD', label: 'Gold Spot', span: 2 },
  { symbol: 'XAGUSD', label: 'Silver Spot' },
  { symbol: 'XTIUSD', label: 'WTI Crude Oil' },
  { symbol: 'XBRUSD', label: 'Brent Crude Oil' },
  { symbol: 'NAT.GAS', label: 'Natural Gas' },
  { symbol: 'BTCUSDT_SPOT', label: 'Bitcoin Spot', span: 2 },
  { symbol: 'ETHUSDT_PERP', label: 'Ethereum Perpetual' },
  { symbol: 'ETHUSDT_SPOT', label: 'Ethereum Spot' },
  { symbol: 'SOLUSDT_SPOT', label: 'Solana Spot' },
  { symbol: 'BNBUSDT_PERP', label: 'BNB Perpetual' },
  { symbol: 'XRPUSDT_SPOT', label: 'XRP Spot' },
];

export async function getMarketSnapshotData(signal?: AbortSignal): Promise<MarketSnapshotResponse> {
  const sdk = createPiaClient();
  const reqSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
    : AbortSignal.timeout(10_000);

  const [pricesRes, catalog] = await Promise.all([
    sdk.market.getPrices({ signal: reqSignal }),
    getCatalog(sdk, reqSignal).catch(() => [] as CatalogEntry[]),
  ]);

  const rawItems = Array.isArray(pricesRes?.items) ? pricesRes.items : [];
  if (rawItems.length === 0 && catalog.length === 0) {
    throw new Error('Upstream market snapshot is empty');
  }

  const catalogMap = new Map<string, CatalogEntry>(
    catalog.map((c) => [c.symbol.toUpperCase(), c]),
  );

  interface LivePriceEntry {
    symbol: string;
    price: number;
    bid: number | null;
    ask: number | null;
    high24h: number | null;
    low24h: number | null;
    changePctRaw: number | null;
    volume: number | null;
    assetType: string;
    source: string;
    sessionState: string | null;
    updatedAt: string | null;
  }

  const liveBySym = new Map<string, LivePriceEntry>();
  for (const raw of rawItems) {
    if (!record(raw) || raw.missing === true) continue;
    const symbol = text(raw.symbol, 64).toUpperCase();
    if (!symbol) continue;
    const price = positiveNum(raw.price);
    if (price === null) continue;

    const sessionObj = record(raw.session) ? raw.session : null;
    const tsMs = parseTimestampMs(raw.received_at ?? raw.timestamp_ms ?? raw.timestamp);
    const updatedAt = tsMs ? new Date(tsMs).toISOString() : null;

    liveBySym.set(symbol, {
      symbol,
      price,
      bid: positiveNum(raw.bid),
      ask: positiveNum(raw.ask),
      high24h: positiveNum(raw.high_24h),
      low24h: positiveNum(raw.low_24h),
      changePctRaw: finiteNum(raw.change_24h_pct ?? raw.change_pct ?? raw.pct24h),
      volume: finiteNum(raw.volume_24h ?? raw.volume),
      assetType: text(raw.asset_type, 32),
      source: text(raw.provider_source ?? raw.source, 32),
      sessionState: sessionObj ? text(sessionObj.state, 24) || null : null,
      updatedAt,
    });
  }

  const priorityIndex = new Map<string, number>(
    PRIORITY_SYMBOLS.map((sym, idx) => [sym.toUpperCase(), idx]),
  );

  const nowMs = Date.now();
  const sortedLive = Array.from(liveBySym.values()).sort((a, b) => {
    const ia = priorityIndex.get(a.symbol);
    const ib = priorityIndex.get(b.symbol);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    const aMs = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const bMs = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    const aFresh = Number.isFinite(aMs) && nowMs - aMs <= 36 * 3600_000 ? 1 : 0;
    const bFresh = Number.isFinite(bMs) && nowMs - bMs <= 36 * 3600_000 ? 1 : 0;
    if (aFresh !== bFresh) return bFresh - aFresh;
    return (b.volume ?? 0) - (a.volume ?? 0);
  });

  // Ensure watchlist includes priority symbols even if some only exist in catalog
  const watchSymbols: string[] = [];
  const seenWatch = new Set<string>();
  for (const sym of PRIORITY_SYMBOLS) {
    const key = sym.toUpperCase();
    if (liveBySym.has(key) || catalogMap.has(key)) {
      watchSymbols.push(key);
      seenWatch.add(key);
    }
  }
  for (const entry of sortedLive) {
    if (seenWatch.has(entry.symbol)) continue;
    watchSymbols.push(entry.symbol);
    seenWatch.add(entry.symbol);
    if (watchSymbols.length >= 45) break;
  }

  const benchmarkSyms = BENCHMARK_DEFS.flatMap((d) => [...d.symbols]);
  const heatmapSyms = HEATMAP_CANDIDATES.filter(
    (c) => liveBySym.has(c.symbol.toUpperCase()) || catalogMap.has(c.symbol.toUpperCase()),
  ).map((c) => c.symbol.toUpperCase());

  await warmDailyBaselines(sdk, [...watchSymbols, ...benchmarkSyms, ...heatmapSyms]);
  const store = getStore();

  const instruments: WatchInstrument[] = watchSymbols.map((symbol) => {
    const live = liveBySym.get(symbol);
    const cat = catalogMap.get(symbol);
    const daily = store.dailyCache.get(symbol);
    const price = live?.price ?? cat?.lastPrice ?? null;
    const decimals = cat?.decimals ?? inferDecimals(price, null);
    const category = live?.assetType || cat?.assetType || 'instrument';
    const close24h = daily?.close24h ?? null;
    const changePct =
      live?.changePctRaw !== null && live?.changePctRaw !== undefined
        ? live.changePctRaw
        : computePct24h(price, close24h);
    const bid = live?.bid ?? null;
    const ask = live?.ask ?? null;

    const rawVenue = cat?.exchange || (live?.source ? live.source.toUpperCase() : 'ORCA FEED');
    const rawSource = live?.source || cat?.source || 'orca_feed';

    return {
      symbol,
      shortLabel: shortSymbolLabel(symbol),
      name: cat?.name || symbol,
      category,
      venue: sanitizePublicVenue(rawVenue, rawSource, category, symbol),
      sizeUnit: sizeUnitFor(category, symbol),
      price,
      decimals,
      changePct,
      close24h,
      bid,
      ask,
      spreadBp: computeSpreadBp(bid, ask),
      high24h: live?.high24h ?? null,
      low24h: live?.low24h ?? null,
      volume: live?.volume ?? null,
      source: sanitizePublicSource(rawSource),
      sessionState: live?.sessionState ?? null,
      spark: daily?.spark ?? [],
      updatedAt: live?.updatedAt ?? null,
    };
  });

  const piaBenchmarks: BenchmarkRow[] = BENCHMARK_DEFS.map(({ sym, name, symbols }) => {
    const matchedCode = symbols.find((code) => liveBySym.has(code)) ?? symbols.find((code) => catalogMap.has(code));
    const live = matchedCode ? liveBySym.get(matchedCode) : undefined;
    const cat = matchedCode ? catalogMap.get(matchedCode) : undefined;
    const last = live?.price ?? cat?.lastPrice ?? null;
    const close24h = matchedCode ? (store.dailyCache.get(matchedCode)?.close24h ?? null) : null;
    const pct =
      live?.changePctRaw !== null && live?.changePctRaw !== undefined
        ? live.changePctRaw
        : computePct24h(last, close24h);

    return {
      sym,
      name,
      targetSymbol: matchedCode,
      last,
      pct,
      close24h,
      decimals: cat?.decimals ?? inferDecimals(last, null),
      source: 'ORCA Feed',
    };
  });

  const us10yRow: BenchmarkRow = {
    sym: 'US10Y',
    name: 'US 10-Yr Benchmark Yield',
    last: null,
    pct: null,
    close24h: null,
    decimals: 3,
    source: 'Desktop App',
    unavailableReason: 'Available in the Windows desktop app.',
  };

  const benchmarks: BenchmarkRow[] = [piaBenchmarks[0], us10yRow, ...piaBenchmarks.slice(1)];

  const heatmapSeen = new Set<string>();
  const heatmap: HeatmapTile[] = [];
  for (const cand of HEATMAP_CANDIDATES) {
    const sym = cand.symbol.toUpperCase();
    const live = liveBySym.get(sym);
    const cat = catalogMap.get(sym);
    if (!live && !cat) continue;
    heatmapSeen.add(sym);
    const price = live?.price ?? cat?.lastPrice ?? null;
    const close24h = store.dailyCache.get(sym)?.close24h ?? null;
    const changePct =
      live?.changePctRaw !== null && live?.changePctRaw !== undefined
        ? live.changePctRaw
        : computePct24h(price, close24h);
    const rawCat = live?.assetType || cat?.assetType || '';
    heatmap.push({
      symbol: sym,
      label: cat?.name || cand.label,
      group: categoryForHeatmap(rawCat, sym),
      rawCategory: rawCat || 'instrument',
      price,
      decimals: cat?.decimals ?? inferDecimals(price, null),
      changePct,
      close24h,
      volume: live?.volume ?? null,
      span: cand.span ?? 1,
    });
  }

  // Add remaining live instruments so the heatmap stays richly populated with genuine feeds
  for (const live of sortedLive) {
    if (heatmap.length >= 24) break;
    if (heatmapSeen.has(live.symbol)) continue;
    heatmapSeen.add(live.symbol);
    const cat = catalogMap.get(live.symbol);
    const close24h = store.dailyCache.get(live.symbol)?.close24h ?? null;
    const changePct =
      live.changePctRaw !== null && live.changePctRaw !== undefined
        ? live.changePctRaw
        : computePct24h(live.price, close24h);
    const rawCat = live.assetType || cat?.assetType || '';
    heatmap.push({
      symbol: live.symbol,
      label: cat?.name || live.symbol,
      group: categoryForHeatmap(rawCat, live.symbol),
      rawCategory: rawCat || 'instrument',
      price: live.price,
      decimals: cat?.decimals ?? inferDecimals(live.price, null),
      changePct,
      close24h,
      volume: live.volume,
      span: 1,
    });
  }

  const universe: UniverseSymbol[] = (catalog.length > 0 ? catalog : sortedLive.map((l) => ({
    symbol: l.symbol,
    name: l.symbol,
    assetType: l.assetType || 'instrument',
    exchange: l.source || 'ORCA FEED',
    source: l.source || 'orca_feed',
    decimals: inferDecimals(l.price, null),
    lastPrice: l.price,
  }))).map((entry) => {
    const live = liveBySym.get(entry.symbol.toUpperCase());
    const category = live?.assetType || entry.assetType;
    return {
      symbol: entry.symbol,
      name: entry.name,
      category,
      exchange: sanitizePublicVenue(entry.exchange, entry.source, category, entry.symbol),
      source: sanitizePublicSource(entry.source),
      decimals: entry.decimals,
      price: live?.price ?? entry.lastPrice ?? null,
    };
  });

  const coreCatalogCount = catalog.filter(
    (c) => c.source.toLowerCase() === 'ctrader_fix' || c.exchange.toUpperCase() === 'CTRADER_FIX',
  ).length;

  return publicPayload({
    configured: true,
    timestamp: new Date().toISOString(),
    catalogCount: coreCatalogCount > 0 ? coreCatalogCount : (catalog.length || RELEASE.catalogCount),
    defaultStreamCount: RELEASE.defaultStreamCount,
    activePriceCount: liveBySym.size,
    instruments,
    universe,
    benchmarks,
    heatmap,
  });
}

export async function getCandlesData(
  symbol: string,
  timeframe: TimeframeKey,
  limit = 160,
  signal?: AbortSignal,
): Promise<{ symbol: string; timeframe: TimeframeKey; decimals: number; candles: OhlcBar[] }> {
  const sdk = createPiaClient();
  const reqSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
    : AbortSignal.timeout(10_000);

  const clampedLimit = Math.min(Math.max(Math.trunc(limit), 10), 400);
  const res = await sdk.market.getCandles(symbol, {
    timeframe: TIMEFRAME_TO_SDK[timeframe],
    limit: clampedLimit,
    signal: reqSignal,
  });

  const rawCandles = Array.isArray(res?.candles) ? res.candles : [];
  const byTime = new Map<number, OhlcBar>();
  for (const raw of rawCandles) {
    if (!record(raw)) continue;
    const ms = parseTimestampMs(raw.time ?? raw.timestamp);
    const open = positiveNum(raw.open);
    const high = positiveNum(raw.high);
    const low = positiveNum(raw.low);
    const close = positiveNum(raw.close);
    if (ms === null || open === null || high === null || low === null || close === null) continue;
    const timeSec = Math.floor(ms / 1000);
    if (timeSec <= 0) continue;
    const vol = Math.max(0, finiteNum(raw.volume) ?? 0);
    byTime.set(timeSec, {
      time: timeSec,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
      volume: vol,
    });
  }

  const candles = Array.from(byTime.values()).sort((a, b) => a.time - b.time);
  const store = getStore();
  const cat = store.catalog?.find((c) => c.symbol.toUpperCase() === symbol.toUpperCase());
  const latestClose = candles[candles.length - 1]?.close ?? cat?.lastPrice ?? null;
  const decimals = cat?.decimals ?? inferDecimals(latestClose, null);

  return publicPayload({
    symbol: symbol.toUpperCase(),
    timeframe,
    decimals,
    candles,
  });
}

function parseBookLevels(raw: unknown): Array<{ price: number; size: number }> {
  if (!Array.isArray(raw)) return [];
  const levels: Array<{ price: number; size: number }> = [];
  for (const entry of raw) {
    if (Array.isArray(entry) && entry.length >= 2) {
      const price = positiveNum(entry[0]);
      const size = positiveNum(entry[1]);
      if (price !== null && size !== null) {
        levels.push({ price, size });
      }
      continue;
    }
    if (record(entry)) {
      const price = positiveNum(entry.price);
      const size = positiveNum(entry.size ?? entry.quantity ?? entry.volume);
      if (price !== null && size !== null) {
        levels.push({ price, size });
      }
    }
  }
  return levels;
}

export function normalizeOrderBookPayload(symbol: string, rawInput: unknown): OrderBookSnapshot {
  const dataLayer = record(rawInput) && record(rawInput.data) ? rawInput.data : rawInput;
  const bookLayer = record(dataLayer) && record(dataLayer.book) ? dataLayer.book : dataLayer;
  const obj = record(bookLayer) ? bookLayer : {};

  const cleanSym = (text(obj.symbol, 64) || symbol).toUpperCase();
  const depthType = text(obj.depth_type, 64) || 'unavailable';
  const synthetic = Boolean(obj.synthetic);
  const rawVenue = text(obj.venue, 64);
  const venue = rawVenue ? sanitizePublicVenue(rawVenue, '', 'crypto', cleanSym) : null;
  const rawSizeUnit = text(obj.size_unit, 32);
  const sizeUnit = !rawSizeUnit
    ? null
    : rawSizeUnit.toLowerCase() === 'base_asset'
      ? sizeUnitFor('crypto', cleanSym)
      : rawSizeUnit;
  const rawUnavailableReason = text(obj.unavailable_reason, 200);
  const unavailableReason =
    rawUnavailableReason &&
    !/\b(ctrader|ctrade|binance|finnhub|tradingview|tvscraper|yahoo|pia)\b/i.test(rawUnavailableReason)
      ? rawUnavailableReason
      : rawUnavailableReason
        ? 'No active exchange L2 snapshot for this symbol.'
        : null;

  const now = Date.now();
  const receivedAtMs = parseTimestampMs(obj.received_at_ms ?? obj.timestamp);
  const sourceTimestampMs = parseTimestampMs(obj.source_timestamp_ms);

  const rawBids = parseBookLevels(obj.bids)
    .sort((a, b) => b.price - a.price)
    .slice(0, 5);
  const rawAsks = parseBookLevels(obj.asks)
    .sort((a, b) => a.price - b.price)
    .slice(0, 5);

  const hasValidSpread =
    rawBids.length > 0 &&
    rawAsks.length > 0 &&
    rawBids[0].price < rawAsks[0].price;

  const hasExchangeBook =
    depthType === 'exchange_l2_snapshot' &&
    !synthetic &&
    hasValidSpread;

  const ageOk =
    receivedAtMs !== null &&
    now - receivedAtMs >= -5_000 &&
    now - receivedAtMs <= 10_000;
  const srcAgeOk =
    sourceTimestampMs === null ||
    (sourceTimestampMs - now <= 5_000 && now - sourceTimestampMs <= 10_000);

  const isLive =
    Boolean(obj.is_live) &&
    hasExchangeBook &&
    ageOk &&
    srcAgeOk;

  if (!isLive) {
    return publicPayload({
      symbol: (text(obj.symbol, 64) || symbol).toUpperCase(),
      isLive: false,
      depthType,
      venue,
      sizeUnit,
      spreadBp: null,
      sourceTimestampMs,
      receivedAtMs,
      unavailableReason:
        unavailableReason ||
        (!hasExchangeBook
          ? 'No active L2 order book snapshot for this instrument.'
          : 'Latest L2 snapshot exceeded the 10-second freshness window.'),
      asks: [],
      bids: [],
    });
  }

  const maxSize = Math.max(
    1e-9,
    ...rawBids.map((b) => b.size),
    ...rawAsks.map((a) => a.size),
  );

  const bestBid = rawBids[0]?.price ?? null;
  const bestAsk = rawAsks[0]?.price ?? null;
  const spreadBp = computeSpreadBp(bestBid, bestAsk);

  const asks: OrderBookLevelRow[] = [...rawAsks]
    .reverse()
    .map((a) => ({
      price: a.price,
      size: a.size,
      pct: Math.min(100, Math.max(4, Math.round((a.size / maxSize) * 100))),
    }));

  const bids: OrderBookLevelRow[] = rawBids.map((b) => ({
    price: b.price,
    size: b.size,
    pct: Math.min(100, Math.max(4, Math.round((b.size / maxSize) * 100))),
  }));

  return publicPayload({
    symbol: (text(obj.symbol, 64) || symbol).toUpperCase(),
    isLive: true,
    depthType,
    venue,
    sizeUnit,
    spreadBp,
    sourceTimestampMs,
    receivedAtMs,
    unavailableReason: null,
    asks,
    bids,
  });
}

export async function getOrderBookData(
  symbol: string,
  signal?: AbortSignal,
): Promise<OrderBookSnapshot> {
  const raw = await fetchPiaJson(
    `/api/v1/market/orderbook/${encodeURIComponent(symbol.toUpperCase())}`,
    signal,
    { allowOrderBookUnsupported: true },
  );
  return normalizeOrderBookPayload(symbol, raw);
}

function normalizeNewsItems(raw: unknown): NewsItem[] {
  const list = record(raw)
    ? (Array.isArray(raw.items) ? raw.items : Array.isArray(raw.articles) ? raw.articles : [])
    : Array.isArray(raw)
      ? raw
      : [];

  const result: NewsItem[] = [];
  const seen = new Set<string>();

  for (const entry of list) {
    if (!record(entry)) continue;
    const title = decodeHtmlText(text(entry.title, 260) || text(entry.original_title, 260), 220);
    const url = sanitizeHttpUrl(entry.url ?? entry.original_url);
    const publishedMs = parseTimestampMs(entry.published_at ?? entry.publishedAt);
    if (!title || !url || publishedMs === null) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    const rawSummary = text(entry.summary, 600);
    const cleanSummary = decodeHtmlText(rawSummary, 220);
    const impactRaw = text(entry.impact_level, 20).toUpperCase();
    const impact: NewsItem['impact'] =
      impactRaw === 'HIGH' ? 'HIGH' : impactRaw === 'LOW' ? 'LOW' : 'MEDIUM';

    result.push({
      id: text(entry.id, 80) || url,
      title,
      summary: cleanSummary,
      source: text(entry.source_name, 60) || text(entry.source, 60) || 'WIRE',
      url,
      imageUrl: sanitizeHttpsUrl(entry.media_url),
      publishedAt: new Date(publishedMs).toISOString(),
      impact,
    });
  }

  return result
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 24);
}

function normalizeSocialItems(raw: unknown): SocialItem[] {
  const list = record(raw)
    ? (Array.isArray(raw.items) ? raw.items : Array.isArray(raw.posts) ? raw.posts : [])
    : Array.isArray(raw)
      ? raw
      : [];

  const result: SocialItem[] = [];
  const seen = new Set<string>();

  for (const entry of list) {
    if (!record(entry)) continue;
    const url = sanitizeHttpUrl(entry.url);
    const body = decodeHtmlText(text(entry.text ?? entry.content, 500), 280);
    const createdMs = parseTimestampMs(entry.created_at ?? entry.posted_at);
    if (!url || !body || createdMs === null) continue;
    const id = text(entry.event_id ?? entry.post_id ?? entry.id, 80) || url;
    if (seen.has(id)) continue;
    seen.add(id);

    const username = text(entry.author_username ?? entry.author_handle, 50) || 'marketwire';
    const displayName = text(entry.author_display_name ?? entry.author, 60) || username;

    result.push({
      id,
      author: displayName,
      handle: username.startsWith('@') ? username : `@${username}`,
      text: body,
      url,
      createdAt: new Date(createdMs).toISOString(),
      platform: text(entry.platform, 24) || 'social',
    });
  }

  return result
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 12);
}

export async function getNewsAndSocialData(
  signal?: AbortSignal,
): Promise<{ news: NewsItem[]; social: SocialItem[]; timestamp: string }> {
  const sdk = createPiaClient();
  const reqSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
    : AbortSignal.timeout(10_000);

  const [newsRes, socialRes] = await Promise.allSettled([
    sdk.news.getNews({ category: 'all', limit: 40, signal: reqSignal }),
    sdk.social.getPosts({ limit: 20, signal: reqSignal }),
  ]);

  if (newsRes.status === 'rejected' && socialRes.status === 'rejected') {
    throw newsRes.reason ?? socialRes.reason;
  }

  const news = newsRes.status === 'fulfilled' ? normalizeNewsItems(newsRes.value) : [];
  const social = socialRes.status === 'fulfilled' ? normalizeSocialItems(socialRes.value) : [];

  return publicPayload({
    news,
    social,
    timestamp: new Date().toISOString(),
  });
}

function formatCalendarTimeLabel(rawDate: string, rawTime: string): string {
  const parsed = Date.parse(rawDate);
  if (Number.isFinite(parsed)) {
    const d = new Date(parsed);
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    });
  }
  const day = rawDate.slice(5, 10);
  const timePart = rawTime.slice(0, 5);
  return [day, timePart].filter(Boolean).join(' ') || '—';
}

function normalizeCalendarEvents(raw: unknown): EconEventItem[] {
  const list = record(raw)
    ? (Array.isArray(raw.events) ? raw.events : Array.isArray(raw.items) ? raw.items : [])
    : Array.isArray(raw)
      ? raw
      : [];

  const now = Date.now();
  const todayIso = new Date(now).toISOString().slice(0, 10);
  const out: EconEventItem[] = [];
  const seen = new Set<string>();

  for (const entry of list) {
    if (!record(entry)) continue;
    const title = text(entry.title ?? entry.name ?? entry.event, 140);
    const rawDate = text(entry.date, 48);
    if (!title || !rawDate) continue;

    const dayPart = rawDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayPart)) continue;
    const parsedMs = Date.parse(rawDate);
    const utcDay = Number.isFinite(parsedMs) ? new Date(parsedMs).toISOString().slice(0, 10) : dayPart;
    if (utcDay < todayIso) continue;

    const rawTime = text(entry.time, 48);
    const cur = (text(entry.currency, 10) || text(entry.country, 10) || 'GLB').toUpperCase();
    const country = text(entry.country, 48) || cur;
    const impRaw = text(entry.impact, 20).toUpperCase();
    const imp: EconEventItem['imp'] =
      impRaw.startsWith('HI') ? 'HI' : impRaw.startsWith('MED') ? 'MED' : 'LOW';

    const actualRaw = entry.actual;
    const actualStr =
      typeof actualRaw === 'number' && Number.isFinite(actualRaw)
        ? String(actualRaw)
        : text(actualRaw, 32);
    const fcstStr =
      typeof entry.forecast === 'number' && Number.isFinite(entry.forecast)
        ? String(entry.forecast)
        : text(entry.forecast, 32);
    const prevStr =
      typeof entry.previous === 'number' && Number.isFinite(entry.previous)
        ? String(entry.previous)
        : text(entry.previous, 32);

    const dedupeKey = `${rawDate}|${cur}|${title}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({
      id: text(entry.id, 100) || dedupeKey,
      date: rawDate,
      timeLabel: formatCalendarTimeLabel(rawDate, rawTime),
      cur,
      country,
      event: title,
      imp,
      actual: actualStr || '—',
      fcst: fcstStr || '—',
      prev: prevStr || '—',
      released: Boolean(actualStr) || (Number.isFinite(parsedMs) && parsedMs < now - 15 * 60_000),
    });
  }

  return out
    .sort((a, b) => {
      const ta = Date.parse(a.date);
      const tb = Date.parse(b.date);
      if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
      return a.date.localeCompare(b.date);
    })
    .slice(0, 30);
}

function normalizeMacroMap(raw: unknown, indicator: string): MacroMapData {
  const obj = record(raw) ? raw : {};
  const listRaw = Array.isArray(obj.countries)
    ? obj.countries
    : Array.isArray(obj.sample)
      ? obj.sample
      : Array.isArray(obj.items)
        ? obj.items
        : [];

  const countries: MacroMapCountry[] = [];
  for (const item of listRaw) {
    if (!record(item)) continue;
    const countryCode = text(item.country_code, 8).toUpperCase();
    const countryName = text(item.country_name, 80);
    const value = finiteNum(item.value);
    if (!countryCode || !countryName || value === null) continue;
    countries.push({
      countryCode,
      countryName,
      flag: text(item.flag, 8),
      region: text(item.region, 40) || 'Global',
      value,
      previousValue: finiteNum(item.previous_value),
      change: finiteNum(item.change),
      rank: finiteNum(item.rank) ?? countries.length + 1,
      period: text(item.period, 16) || text(obj.period, 16) || '—',
    });
  }

  return {
    indicator: text(obj.indicator, 32) || indicator,
    indicatorName: text(obj.indicator_name, 80) || indicator.replace(/_/g, ' ').toUpperCase(),
    unit: text(obj.unit, 16) || '%',
    period: text(obj.period, 16) || '—',
    source: null,
    isLive: Boolean(obj.is_live),
    total: finiteNum(obj.total) ?? countries.length,
    countries: countries.sort((a, b) => a.rank - b.rank).slice(0, 16),
  };
}

export async function getCalendarAndMacroData(
  indicator = 'inflation',
  signal?: AbortSignal,
): Promise<{ events: EconEventItem[]; macroMap: MacroMapData | null; timestamp: string }> {
  const sdk = createPiaClient();
  const reqSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
    : AbortSignal.timeout(10_000);

  const [calRes, mapRes] = await Promise.allSettled([
    sdk.economic.getCalendar({ limit: 150, signal: reqSignal }),
    sdk.economic.getMacroMap({ indicator, signal: reqSignal }),
  ]);

  if (calRes.status === 'rejected' && mapRes.status === 'rejected') {
    throw calRes.reason ?? mapRes.reason;
  }

  const events = calRes.status === 'fulfilled' ? normalizeCalendarEvents(calRes.value) : [];
  const macroMap =
    mapRes.status === 'fulfilled' ? normalizeMacroMap(mapRes.value, indicator) : null;

  return publicPayload({
    events,
    macroMap,
    timestamp: new Date().toISOString(),
  });
}

const COMPONENT_LABELS: Record<string, string> = {
  momentum: 'Momentum',
  volatility: 'Volatility',
  safe_haven: 'Safe Haven',
  news_risk: 'News Risk',
  positioning: 'Positioning',
};

export async function getFearGreedData(signal?: AbortSignal): Promise<FearGreedData> {
  const sdk = createPiaClient();
  const reqSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(8_000)])
    : AbortSignal.timeout(8_000);

  const raw = await sdk.macro.getFearGreed({ signal: reqSignal });
  if (!record(raw)) throw new Error('Invalid fear & greed payload');

  const scoreRaw = finiteNum(raw.score ?? raw.value);
  if (scoreRaw === null) throw new Error('Missing fear & greed score');

  const score = Math.min(100, Math.max(0, Math.round(scoreRaw)));
  const rawLabel = text(raw.label ?? raw.classification, 40) || 'Neutral';
  const label = rawLabel
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  const components: FearGreedComponent[] = [];
  if (record(raw.components)) {
    for (const [key, val] of Object.entries(raw.components)) {
      const n = finiteNum(val);
      if (n === null) continue;
      components.push({
        key,
        name: COMPONENT_LABELS[key] ?? key.replace(/_/g, ' '),
        val: Math.min(100, Math.max(0, Math.round(n))),
      });
    }
  } else if (Array.isArray(raw.components)) {
    for (const item of raw.components) {
      if (!record(item)) continue;
      const name = text(item.name ?? item.key, 40);
      const n = finiteNum(item.value ?? item.val ?? item.score);
      if (!name || n === null) continue;
      components.push({
        key: name.toLowerCase(),
        name,
        val: Math.min(100, Math.max(0, Math.round(n))),
      });
    }
  }

  const updatedMs = parseTimestampMs(raw.created_at ?? raw.date);

  return publicPayload({
    score,
    label,
    updatedAt: updatedMs ? new Date(updatedMs).toISOString() : null,
    components,
  });
}
