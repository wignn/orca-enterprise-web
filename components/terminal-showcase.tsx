'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Crosshair,
  Globe2,
  MousePointer2,
  Ruler,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import {
  MACRO_INDICATORS,
  TIMEFRAMES,
  TIMEFRAME_SECONDS,
  TV_CHANNELS,
  computePct24h,
  computeSpreadBp,
  formatClockTime,
  formatOrderSize,
  formatPrice,
  formatRelativeDateTime,
  formatSignedPct,
  formatTradeSize,
  inferDecimals,
  isCryptoUsdtTradeMode,
  normSymbolKey,
  resolveSymbolQuery,
  shortSymbolLabel,
  sizeUnitFor,
  type EconEventItem,
  type FearGreedData,
  type HeatmapGroup,
  type HeatmapTile,
  type MacroMapData,
  type MarketSnapshotResponse,
  type NewsItem,
  type OhlcBar,
  type OrderBookSnapshot,
  type SocialItem,
  type StreamQuoteEvent,
  type TapeRow,
  type TimeframeKey,
  type WatchInstrument,
} from '@/lib/market';
import { RELEASE } from '@/lib/release';
import { cn } from '@/lib/utils';
import { OrcaChart } from '@/components/orca-chart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type TabViewKey =
  | 'mon'
  | 'eval'
  | 'heatmap'
  | 'macromaps'
  | 'news'
  | 'trades'
  | 'log'
  | 'valid';

interface TickPulsePoint {
  price: number;
  receivedAt: number;
  count: number;
}

const FKEY_TABS: Array<{ key: string; id: TabViewKey; label: string }> = [
  { key: 'F1', id: 'mon', label: 'MONITOR' },
  { key: 'F2', id: 'eval', label: 'ORCA ALPHA' },
  { key: 'F3', id: 'heatmap', label: 'HEATMAP' },
  { key: 'F4', id: 'macromaps', label: 'MACRO MAPS' },
  { key: 'F5', id: 'news', label: 'NEWS' },
  { key: 'F6', id: 'trades', label: 'TRADES' },
  { key: 'F7', id: 'log', label: 'SYSTEM LOG' },
  { key: 'F8', id: 'valid', label: 'VALIDATION' },
];

const QUICK_SYMBOLS = ['BTCUSDT_SPOT', 'ETHUSDT_PERP', 'SOLUSDT_SPOT', 'XAUUSD'] as const;

const DRAWING_TOOLS = [
  { id: 'crosshair', icon: Crosshair, label: 'Crosshair' },
  { id: 'cursor', icon: MousePointer2, label: 'Select & move' },
  { id: 'trend', icon: TrendingUp, label: 'Trendline & channel' },
  { id: 'fib', icon: SlidersHorizontal, label: 'Fibonacci retracement' },
  { id: 'ruler', icon: Ruler, label: 'Price & bar range' },
] as const;

function BrandMark() {
  return (
    <svg className="block shrink-0" viewBox="0 0 64 64" width="20" height="20" aria-hidden="true">
      <path
        d="M 10 33 C 15 18, 30 9, 47 17"
        fill="none"
        stroke="#ff9e32"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M 10 39 C 25 29, 36 49, 54 32"
        fill="none"
        stroke="#f0f0ec"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="48" cy="17" r="3" fill="#ff9e32" />
    </svg>
  );
}

function WatchSparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <span className="text-[#626b78]">—</span>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 38;
      const y = span === 0 ? 7 : 13 - ((v - min) / span) * 11;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const up = values[values.length - 1] >= values[0];

  return (
    <svg width="38" height="14" viewBox="0 0 38 14" className="inline-block align-middle" aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke={up ? '#53d391' : '#f26d6d'}
        strokeWidth="1.25"
      />
    </svg>
  );
}

function PanelHeader({
  code,
  children,
  right,
  sub = false,
}: {
  code: string;
  children?: React.ReactNode;
  right?: React.ReactNode;
  sub?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex h-[22px] shrink-0 items-center gap-[6px] overflow-hidden border-b border-[#34383e] bg-[#1b1e22] pr-[6px] font-condensed text-[11px] font-semibold tracking-[0.025em] whitespace-nowrap text-[#f0f0ec] uppercase',
        sub && 'border-t border-[#34383e]',
      )}
    >
      <span className="flex h-full shrink-0 items-center border-r border-[#34383e] bg-[#352719] px-[6px] font-mono text-[10.5px] font-medium tracking-[0.02em] text-[#ff9e32]">
        {code}
      </span>
      <span className="min-w-0 truncate">{children}</span>
      {right !== undefined && (
        <span className="ml-auto flex shrink-0 items-center gap-1 font-mono text-[10px] font-normal tracking-normal text-[#939699] normal-case">
          {right}
        </span>
      )}
    </div>
  );
}

function heatmapTileStyle(changePct: number | null): string {
  if (changePct === null) {
    return 'border-dashed border-[#34383e] bg-[#1b1e22] text-[#939699]';
  }
  if (changePct >= 1.2) {
    return 'border-[#277a4d] bg-[#103824] text-[#f0f0ec]';
  }
  if (changePct > 0) {
    return 'border-[#1f5c3b] bg-[#0d291b] text-[#f0f0ec]';
  }
  if (changePct <= -1.0) {
    return 'border-[#8a2e34] bg-[#401519] text-[#f0f0ec]';
  }
  return 'border-[#612226] bg-[#2a1215] text-[#f0f0ec]';
}

async function readErrorMessage(
  res: Response,
  fallback: string,
): Promise<{ configured: boolean; authError: boolean; message: string }> {
  try {
    const body = (await res.json()) as {
      configured?: boolean;
      authError?: boolean;
      error?: string;
    };
    return {
      configured: body.configured !== false,
      authError: Boolean(body.authError),
      message: body.error || fallback,
    };
  } catch {
    return { configured: true, authError: false, message: fallback };
  }
}

export function TerminalShowcase() {
  const [activeTab, setActiveTab] = useState<TabViewKey>('mon');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSDT_SPOT');
  const [timeframe, setTimeframe] = useState<TimeframeKey>('15M');
  const [showEma20, setShowEma20] = useState(true);
  const [showEma50, setShowEma50] = useState(true);

  const [cmdQuery, setCmdQuery] = useState('');
  const [cmdHint, setCmdHint] = useState<string | null>(null);
  const [showUniverse, setShowUniverse] = useState(false);
  const [univFilter, setUnivFilter] = useState('');
  const [showLoginNotice, setShowLoginNotice] = useState(false);

  const [tvChannelId, setTvChannelId] = useState<string>('sky');
  const [tvPlaying, setTvPlaying] = useState(false);
  const [tvMuted, setTvMuted] = useState(true);
  const [econFilter, setEconFilter] = useState<'ALL' | 'HIGH' | 'USD'>('ALL');
  const [activeTool, setActiveTool] = useState<string>('crosshair');
  const [heatmapFilter, setHeatmapFilter] = useState<'All' | HeatmapGroup>('All');
  const [macroIndicator, setMacroIndicator] = useState<string>('inflation');

  const [snapshot, setSnapshot] = useState<MarketSnapshotResponse | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [gatewayConfigured, setGatewayConfigured] = useState<boolean | null>(null);
  const [gatewayAuthError, setGatewayAuthError] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [liveQuotes, setLiveQuotes] = useState<Record<string, StreamQuoteEvent>>({});
  const [bars, setBars] = useState<OhlcBar[]>([]);
  const [candlesLoading, setCandlesLoading] = useState(true);
  const [candlesError, setCandlesError] = useState<string | null>(null);

  const [orderBookState, setOrderBookState] = useState<{
    book: OrderBookSnapshot | null;
    clientReceivedMs: number;
  }>({ book: null, clientReceivedMs: 0 });
  const [orderBookLoading, setOrderBookLoading] = useState(true);

  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [socialItems, setSocialItems] = useState<SocialItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [newsSyncLabel, setNewsSyncLabel] = useState<'SYNC' | 'LOAD' | 'OK'>('SYNC');

  const [econEvents, setEconEvents] = useState<EconEventItem[]>([]);
  const [macroMap, setMacroMap] = useState<MacroMapData | null>(null);
  const [calLoading, setCalLoading] = useState(true);
  const [calError, setCalError] = useState<string | null>(null);

  const [fearGreed, setFearGreed] = useState<FearGreedData | null>(null);
  const [fgiLoading, setFgiLoading] = useState(true);
  const [fgiError, setFgiError] = useState<string | null>(null);

  const [tapeRows, setTapeRows] = useState<TapeRow[]>([]);
  const [tickHistory, setTickHistory] = useState<TickPulsePoint[]>([]);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const [wsConnected, setWsConnected] = useState(false);
  const [wsMsgs, setWsMsgs] = useState(0);
  const [lastMsgAt, setLastMsgAt] = useState<number | null>(null);
  const [wsError, setWsError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const selectedSymbolRef = useRef(selectedSymbol);
  selectedSymbolRef.current = selectedSymbol;
  const timeframeRef = useRef(timeframe);
  timeframeRef.current = timeframe;
  const gatewayBlocked = gatewayConfigured === false || gatewayAuthError;
  const gatewayBlockedRef = useRef(gatewayBlocked);
  gatewayBlockedRef.current = gatewayBlocked;

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const findLiveQuote = useCallback(
    (symbol: string): StreamQuoteEvent | undefined => {
      const upper = symbol.toUpperCase();
      if (liveQuotes[upper]) return liveQuotes[upper];
      const norm = normSymbolKey(upper);
      for (const [k, v] of Object.entries(liveQuotes)) {
        if (normSymbolKey(k) === norm) return v;
      }
      return undefined;
    },
    [liveQuotes],
  );

  // Merge REST snapshot watchlist with live SSE quotes
  const mergedInstruments: WatchInstrument[] = useMemo(() => {
    const base = snapshot?.instruments ?? [];
    return base.map((item) => {
      const q = findLiveQuote(item.symbol);
      if (!q) return item;
      const bid = q.bid ?? item.bid;
      const ask = q.ask ?? item.ask;
      const pct = item.close24h ? computePct24h(q.price, item.close24h) : item.changePct;
      return {
        ...item,
        price: q.price,
        bid,
        ask,
        spreadBp: bid !== null && ask !== null ? computeSpreadBp(bid, ask) : item.spreadBp,
        changePct: pct,
        updatedAt: new Date(q.receivedAtMs).toISOString(),
      };
    });
  }, [findLiveQuote, snapshot?.instruments]);

  const activeInstrument: WatchInstrument = useMemo(() => {
    const inWatch = mergedInstruments.find(
      (i) => i.symbol.toUpperCase() === selectedSymbol.toUpperCase(),
    );
    if (inWatch) return inWatch;

    const quote = findLiveQuote(selectedSymbol);
    const inUniv = snapshot?.universe.find(
      (u) => u.symbol.toUpperCase() === selectedSymbol.toUpperCase(),
    );
    const price = quote?.price ?? inUniv?.price ?? null;
    const bid = quote?.bid ?? null;
    const ask = quote?.ask ?? null;
    const decimals = inUniv?.decimals ?? inferDecimals(price, null);
    const category =
      inUniv?.category ??
      (/USDT(_SPOT|_PERP)?$/i.test(selectedSymbol) ? 'crypto' : 'instrument');

    return {
      symbol: selectedSymbol,
      shortLabel: shortSymbolLabel(selectedSymbol),
      name: inUniv?.name ?? selectedSymbol,
      category,
      venue: inUniv?.exchange ?? 'ORCA FEED',
      sizeUnit: sizeUnitFor(category, selectedSymbol),
      price,
      decimals,
      changePct: null,
      close24h: null,
      bid,
      ask,
      spreadBp: computeSpreadBp(bid, ask),
      high24h: null,
      low24h: null,
      volume: null,
      source: inUniv?.source ?? 'orca_feed',
      sessionState: null,
      spark: [],
      updatedAt: quote ? new Date(quote.receivedAtMs).toISOString() : null,
    };
  }, [findLiveQuote, mergedInstruments, selectedSymbol, snapshot?.universe]);

  const activeCategoryRef = useRef(activeInstrument.category);
  activeCategoryRef.current = activeInstrument.category;

  const mergedBenchmarks = useMemo(() => {
    const base = snapshot?.benchmarks ?? [];
    return base.map((bm) => {
      if (!bm.targetSymbol) return bm;
      const q = findLiveQuote(bm.targetSymbol);
      if (!q) return bm;
      const pct = bm.close24h ? computePct24h(q.price, bm.close24h) : bm.pct;
      return { ...bm, last: q.price, pct };
    });
  }, [findLiveQuote, snapshot?.benchmarks]);

  const mergedHeatmap = useMemo(() => {
    const base = snapshot?.heatmap ?? [];
    return base.map((tile) => {
      const q = findLiveQuote(tile.symbol);
      if (!q) return tile;
      const pct = tile.close24h ? computePct24h(q.price, tile.close24h) : tile.changePct;
      return { ...tile, price: q.price, changePct: pct };
    });
  }, [findLiveQuote, snapshot?.heatmap]);

  const imapTiles = useMemo(
    () =>
      mergedInstruments
        .filter((r) => r.price !== null && r.price > 0)
        .slice(0, 8),
    [mergedInstruments],
  );

  // 1. Fetch Market Snapshot (initial + every 30s)
  const fetchSnapshot = useCallback(async () => {
    const t0 = performance.now();
    try {
      const res = await fetch('/api/market/snapshot', { cache: 'no-store' });
      if (!res.ok) {
        const err = await readErrorMessage(res, 'Market snapshot unavailable.');
        setGatewayConfigured(err.configured);
        setGatewayAuthError(err.authError);
        setSnapshotError(err.message);
        return;
      }
      const data = (await res.json()) as MarketSnapshotResponse;
      setGatewayConfigured(true);
      setGatewayAuthError(false);
      setSnapshot(data);
      setSnapshotError(null);
      const rtt = Math.round(performance.now() - t0);
      setLatencyMs((prev) => prev ?? rtt);
      if (
        data.instruments.length > 0 &&
        !data.instruments.some((i) => i.symbol === selectedSymbolRef.current) &&
        !data.universe.some((u) => u.symbol === selectedSymbolRef.current)
      ) {
        setSelectedSymbol(data.instruments[0].symbol);
      }
    } catch {
      setSnapshotError('Failed to reach market snapshot server.');
    } finally {
      setSnapshotLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSnapshot();
    const timer = setInterval(() => {
      if (!gatewayBlockedRef.current) void fetchSnapshot();
    }, 30_000);
    return () => clearInterval(timer);
  }, [fetchSnapshot, reloadNonce]);

  // 2. Fetch News & Social (initial + every 60s + manual SYNC)
  const fetchNews = useCallback(async (manual = false) => {
    if (manual) setNewsSyncLabel('LOAD');
    try {
      const res = await fetch('/api/market/news', { cache: 'no-store' });
      if (!res.ok) {
        const err = await readErrorMessage(res, 'News wire unavailable.');
        if (!err.configured) setGatewayConfigured(false);
        if (err.authError) setGatewayAuthError(true);
        setNewsError(err.message);
        if (manual) setNewsSyncLabel('SYNC');
        return;
      }
      const data = (await res.json()) as { news: NewsItem[]; social: SocialItem[] };
      setGatewayConfigured(true);
      setGatewayAuthError(false);
      setNewsItems(Array.isArray(data.news) ? data.news : []);
      setSocialItems(Array.isArray(data.social) ? data.social : []);
      setNewsError(null);
      if (manual) {
        setNewsSyncLabel('OK');
        setTimeout(() => setNewsSyncLabel('SYNC'), 1400);
      }
    } catch {
      setNewsError('Failed to load news wire.');
      if (manual) setNewsSyncLabel('SYNC');
    } finally {
      setNewsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNews(false);
    const timer = setInterval(() => {
      if (!gatewayBlockedRef.current) void fetchNews(false);
    }, 60_000);
    return () => clearInterval(timer);
  }, [fetchNews, reloadNonce]);

  // 3. Fetch Fear & Greed (initial + every 5m)
  const fetchFearGreed = useCallback(async () => {
    try {
      const res = await fetch('/api/market/fear-greed', { cache: 'no-store' });
      if (!res.ok) {
        const err = await readErrorMessage(res, 'Sentiment index unavailable.');
        if (!err.configured) setGatewayConfigured(false);
        if (err.authError) setGatewayAuthError(true);
        setFgiError(err.message);
        return;
      }
      const data = (await res.json()) as FearGreedData;
      setGatewayConfigured(true);
      setGatewayAuthError(false);
      setFearGreed(data);
      setFgiError(null);
    } catch {
      setFgiError('Failed to load Fear & Greed Index.');
    } finally {
      setFgiLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFearGreed();
    const timer = setInterval(() => {
      if (!gatewayBlockedRef.current) void fetchFearGreed();
    }, 5 * 60_000);
    return () => clearInterval(timer);
  }, [fetchFearGreed, reloadNonce]);

  // 4. Fetch Economic Calendar + Macro Map
  const fetchCalendarAndMacro = useCallback(async (indicator: string) => {
    if (gatewayBlockedRef.current) {
      setCalLoading(false);
      return;
    }
    setCalLoading(true);
    try {
      const res = await fetch(
        `/api/market/calendar?indicator=${encodeURIComponent(indicator)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        const err = await readErrorMessage(res, 'Calendar & macro map unavailable.');
        if (!err.configured) setGatewayConfigured(false);
        if (err.authError) setGatewayAuthError(true);
        setCalError(err.message);
        return;
      }
      const data = (await res.json()) as {
        events: EconEventItem[];
        macroMap: MacroMapData | null;
      };
      setGatewayConfigured(true);
      setGatewayAuthError(false);
      setEconEvents(Array.isArray(data.events) ? data.events : []);
      setMacroMap(data.macroMap ?? null);
      setCalError(null);
    } catch {
      setCalError('Failed to load economic calendar & macro map.');
    } finally {
      setCalLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCalendarAndMacro(macroIndicator);
    const timer = setInterval(() => {
      if (!gatewayBlockedRef.current) void fetchCalendarAndMacro(macroIndicator);
    }, 5 * 60_000);
    return () => clearInterval(timer);
  }, [fetchCalendarAndMacro, macroIndicator, reloadNonce]);

  // 5. Fetch Candles on symbol/timeframe change
  useEffect(() => {
    if (gatewayBlockedRef.current) {
      setBars([]);
      setCandlesLoading(false);
      return;
    }
    const controller = new AbortController();
    setBars([]);
    setCandlesLoading(true);
    setCandlesError(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/market/candles?symbol=${encodeURIComponent(selectedSymbol)}&tf=${encodeURIComponent(timeframe)}&limit=160`,
          { cache: 'no-store', signal: controller.signal },
        );
        if (!res.ok) {
          const err = await readErrorMessage(res, 'Candle history unavailable.');
          if (!controller.signal.aborted) {
            if (!err.configured) setGatewayConfigured(false);
            if (err.authError) setGatewayAuthError(true);
            setCandlesError(err.message);
          }
          return;
        }
        const data = (await res.json()) as { candles?: OhlcBar[] };
        if (!controller.signal.aborted) {
          setGatewayConfigured(true);
          setGatewayAuthError(false);
          const incoming = Array.isArray(data.candles) ? data.candles : [];
          setBars((prev) => {
            if (incoming.length === 0) return prev;
            if (prev.length === 0) return incoming;
            const lastIncoming = incoming[incoming.length - 1];
            const latestPrev = prev[prev.length - 1];
            if (latestPrev.time === lastIncoming.time) {
              const merged = incoming.slice();
              merged[merged.length - 1] = {
                ...lastIncoming,
                high: Math.max(lastIncoming.high, latestPrev.high),
                low: Math.min(lastIncoming.low, latestPrev.low),
                close: latestPrev.close,
                volume: Math.max(lastIncoming.volume, latestPrev.volume),
              };
              return merged;
            }
            if (latestPrev.time > lastIncoming.time) {
              return [...incoming, latestPrev].slice(-400);
            }
            return incoming;
          });
          setCandlesError(null);
        }
      } catch {
        if (!controller.signal.aborted) {
          setCandlesError('Failed to load candle history.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setCandlesLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [selectedSymbol, timeframe, reloadNonce]);

  // 6. Fetch OrderBook on symbol change + clear symbol tape/pulse
  useEffect(() => {
    setTapeRows([]);
    setTickHistory([]);
    if (gatewayBlockedRef.current) {
      setOrderBookState({ book: null, clientReceivedMs: 0 });
      setOrderBookLoading(false);
      return;
    }
    const controller = new AbortController();
    setOrderBookLoading(true);
    setOrderBookState({ book: null, clientReceivedMs: 0 });

    (async () => {
      try {
        const res = await fetch(
          `/api/market/orderbook?symbol=${encodeURIComponent(selectedSymbol)}`,
          { cache: 'no-store', signal: controller.signal },
        );
        if (!res.ok) {
          const err = await readErrorMessage(res, 'Order book unavailable.');
          if (!controller.signal.aborted) {
            if (!err.configured) setGatewayConfigured(false);
            if (err.authError) setGatewayAuthError(true);
            setOrderBookState({ book: null, clientReceivedMs: 0 });
          }
          return;
        }
        const data = (await res.json()) as OrderBookSnapshot;
        if (!controller.signal.aborted) {
          setGatewayConfigured(true);
          setGatewayAuthError(false);
          setOrderBookState({ book: data, clientReceivedMs: Date.now() });
        }
      } catch {
        if (!controller.signal.aborted) {
          setOrderBookState({ book: null, clientReceivedMs: 0 });
        }
      } finally {
        if (!controller.signal.aborted) {
          setOrderBookLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [selectedSymbol, reloadNonce]);

  // 7. Connect SSE realtime stream when gateway is configured and authenticated
  useEffect(() => {
    if (gatewayBlocked) {
      setWsConnected(false);
      return;
    }

    const es = new EventSource(
      `/api/market/stream?symbol=${encodeURIComponent(selectedSymbol)}`,
    );

    let pendingQuotes: Record<string, StreamQuoteEvent> = {};
    let pendingHistory: TickPulsePoint[] = [];
    let pendingTape: TapeRow[] = [];
    let pendingBarTick: StreamQuoteEvent | null = null;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushBatch = () => {
      flushTimer = null;
      const now = Date.now();

      if (Object.keys(pendingQuotes).length > 0) {
        const quoteMap = pendingQuotes;
        pendingQuotes = {};
        setLiveQuotes((prev) => ({ ...prev, ...quoteMap }));
      }

      if (pendingHistory.length > 0) {
        const histBatch = pendingHistory;
        pendingHistory = [];
        setTickHistory((prev) => {
          const cutoff = now - 30_000;
          const next = prev.filter((p) => p.receivedAt >= cutoff);
          for (const pt of histBatch) {
            const last = next[next.length - 1];
            if (last && last.receivedAt === pt.receivedAt) {
              last.price = pt.price;
              last.count += pt.count;
            } else {
              next.push(pt);
            }
          }
          return next.slice(-320);
        });
      }

      if (pendingTape.length > 0) {
        const tapeBatch = pendingTape;
        pendingTape = [];
        setTapeRows((prev) => [...tapeBatch, ...prev].slice(0, 30));
      }

      if (pendingBarTick) {
        const q = pendingBarTick;
        pendingBarTick = null;
        const intervalSec = TIMEFRAME_SECONDS[timeframeRef.current];
        const sourceMs =
          q.timestampMs > 0 && q.timestampMs <= now + 5_000 ? q.timestampMs : now;
        const validSec = Math.floor(sourceMs / 1000);
        const bucketStart = Math.floor(validSec / intervalSec) * intervalSec;
        const tradeVol =
          q.isBuyerMaker !== null && q.quantity !== null && q.quantity > 0 ? q.quantity : 0;

        setBars((prev) => {
          if (prev.length === 0) {
            return [
              {
                time: bucketStart,
                open: q.price,
                high: q.price,
                low: q.price,
                close: q.price,
                volume: Number(tradeVol.toFixed(4)),
              },
            ];
          }
          const last = prev[prev.length - 1];
          const targetStart = Math.floor(Math.max(validSec, last.time) / intervalSec) * intervalSec;
          if (targetStart === last.time) {
            const next = prev.slice();
            next[next.length - 1] = {
              ...last,
              high: Math.max(last.high, q.price),
              low: Math.min(last.low, q.price),
              close: q.price,
              volume: Number((last.volume + tradeVol).toFixed(4)),
            };
            return next;
          }
          if (targetStart > last.time) {
            const next = [
              ...prev,
              {
                time: targetStart,
                open: q.price,
                high: q.price,
                low: q.price,
                close: q.price,
                volume: Number(tradeVol.toFixed(4)),
              },
            ];
            return next.length > 400 ? next.slice(-400) : next;
          }
          return prev;
        });
      }
    };

    const scheduleFlush = () => {
      if (!flushTimer) {
        flushTimer = setTimeout(flushBatch, 150);
      }
    };

    es.addEventListener('status', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { connected?: boolean };
        const connected = Boolean(data.connected);
        setWsConnected(connected);
        if (connected) {
          setGatewayConfigured(true);
          setGatewayAuthError(false);
          setWsError(null);
        }
      } catch {
        // Ignore malformed status event
      }
    });

    es.addEventListener('quote', (ev) => {
      try {
        const q = JSON.parse((ev as MessageEvent).data) as StreamQuoteEvent;
        if (!q?.symbol || !Number.isFinite(q.price) || q.price <= 0) return;

        const now = Date.now();
        pendingQuotes[q.symbol.toUpperCase()] = q;
        setWsMsgs((c) => c + 1);
        setLastMsgAt(now);

        const rawLag = q.receivedAtMs - q.timestampMs;
        if (Number.isFinite(rawLag) && rawLag >= 0 && rawLag < 60_000) {
          setLatencyMs(Math.round(rawLag));
        }

        if (normSymbolKey(q.symbol) === normSymbolKey(selectedSymbolRef.current)) {
          const bucket = Math.floor(now / 100) * 100;
          const lastPt = pendingHistory[pendingHistory.length - 1];
          if (lastPt && lastPt.receivedAt === bucket) {
            lastPt.price = q.price;
            lastPt.count += 1;
          } else {
            pendingHistory.push({ price: q.price, receivedAt: bucket, count: 1 });
          }

          const timeLabel = formatClockTime(now);
          const id = `${q.symbol}-${now}-${Math.random().toString(36).slice(2, 6)}`;
          const tradeMode = isCryptoUsdtTradeMode(
            activeCategoryRef.current,
            selectedSymbolRef.current,
          );

          if (tradeMode) {
            if (q.quantity !== null && q.quantity > 0 && q.isBuyerMaker !== null) {
              pendingTape.unshift({
                kind: 'trade',
                id,
                time: timeLabel,
                side: q.isBuyerMaker ? 'SELL' : 'BUY',
                size: q.quantity,
                price: q.price,
              });
              pendingTape = pendingTape.slice(0, 30);
            }
          } else {
            pendingTape.unshift({
              kind: 'quote',
              id,
              time: timeLabel,
              bid: q.bid,
              ask: q.ask,
              price: q.price,
            });
            pendingTape = pendingTape.slice(0, 30);
          }

          pendingBarTick = q;
        }

        scheduleFlush();
      } catch {
        // Ignore malformed quote
      }
    });

    es.addEventListener('orderbook', (ev) => {
      try {
        const book = JSON.parse((ev as MessageEvent).data) as OrderBookSnapshot;
        if (
          book?.symbol &&
          normSymbolKey(book.symbol) === normSymbolKey(selectedSymbolRef.current)
        ) {
          setOrderBookState((prev) => {
            if (
              prev.book?.isLive &&
              prev.book.sourceTimestampMs &&
              book.sourceTimestampMs &&
              book.sourceTimestampMs < prev.book.sourceTimestampMs
            ) {
              return prev;
            }
            return { book, clientReceivedMs: Date.now() };
          });
          setWsMsgs((c) => c + 1);
          setLastMsgAt(Date.now());
        }
      } catch {
        // Ignore malformed orderbook event
      }
    });

    es.onerror = () => {
      setWsConnected(false);
      setWsError('Waiting for live stream connection...');
    };

    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      es.close();
    };
  }, [gatewayBlocked, selectedSymbol, reloadNonce]);

  const isCryptoTradeMode = isCryptoUsdtTradeMode(
    activeInstrument.category,
    activeInstrument.symbol,
  );
  const activeChannel =
    TV_CHANNELS.find((c) => c.id === tvChannelId) ?? TV_CHANNELS[0];

  const visibleEcon = econEvents.filter((ev) => {
    if (econFilter === 'HIGH') return ev.imp === 'HI';
    if (econFilter === 'USD') return ev.cur === 'USD';
    return true;
  });

  const visibleHeatmap =
    heatmapFilter === 'All'
      ? mergedHeatmap
      : mergedHeatmap.filter((tile) => tile.group === heatmapFilter);

  const autocompleteMatches = useMemo(() => {
    const raw = cmdQuery.trim().toUpperCase();
    if (!raw) return [];
    const norm = normSymbolKey(raw);
    const pool =
      snapshot?.universe && snapshot.universe.length > 0
        ? snapshot.universe
        : mergedInstruments.map((i) => ({
            symbol: i.symbol,
            name: i.name,
            category: i.category,
            exchange: i.venue,
            source: i.source,
            decimals: i.decimals,
            price: i.price,
          }));
    return pool
      .filter(
        (item) =>
          normSymbolKey(item.symbol).includes(norm) ||
          item.name.toUpperCase().includes(raw),
      )
      .slice(0, 8);
  }, [cmdQuery, mergedInstruments, snapshot?.universe]);

  const filteredUniverse = useMemo(() => {
    const pool =
      snapshot?.universe && snapshot.universe.length > 0
        ? snapshot.universe
        : mergedInstruments.map((i) => ({
            symbol: i.symbol,
            name: i.name,
            category: i.category,
            exchange: i.venue,
            source: i.source,
            decimals: i.decimals,
            price: i.price,
          }));
    const raw = univFilter.trim().toUpperCase();
    if (!raw) return pool.slice(0, 90);
    const norm = normSymbolKey(raw);
    return pool
      .filter(
        (item) =>
          normSymbolKey(item.symbol).includes(norm) ||
          item.name.toUpperCase().includes(raw),
      )
      .slice(0, 90);
  }, [mergedInstruments, snapshot?.universe, univFilter]);

  const effectiveBook = useMemo(() => {
    const { book, clientReceivedMs } = orderBookState;
    if (!book) return null;
    if (!book.isLive) return book;
    if (nowTick - clientReceivedMs > 10_000) {
      return {
        ...book,
        isLive: false,
        asks: [],
        bids: [],
        spreadBp: null,
        unavailableReason: 'Latest L2 snapshot exceeded the 10-second freshness window.',
      };
    }
    return book;
  }, [nowTick, orderBookState]);

  const pulseSummary = useMemo(() => {
    const cutoff30 = nowTick - 30_000;
    const cutoff10 = nowTick - 10_000;
    const recent = tickHistory.filter((p) => p.receivedAt >= cutoff30);
    const total30 = recent.reduce((acc, p) => acc + p.count, 0);
    const rate10 =
      recent
        .filter((p) => p.receivedAt >= cutoff10)
        .reduce((acc, p) => acc + p.count, 0) / 10;

    if (recent.length < 2) {
      return {
        points: [] as Array<{ x: number; y: number }>,
        path: '',
        up: (activeInstrument.changePct ?? 0) >= 0,
        rate10,
        total30,
      };
    }

    const prices = recent.map((p) => p.price);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const spanP = maxP - minP || Math.max(1e-6, minP * 0.0001);

    const points = recent.map((p) => {
      const fracX = Math.min(1, Math.max(0, (p.receivedAt - cutoff30) / 30_000));
      const x = 24 + fracX * 752;
      const y = 172 - ((p.price - minP) / spanP) * 144;
      return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
    });

    const path = points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x},${pt.y}`).join(' ');
    const up = recent[recent.length - 1].price >= recent[0].price;

    return { points, path, up, rate10, total30 };
  }, [activeInstrument.changePct, nowTick, tickHistory]);

  const flashHint = (txt: string) => {
    setCmdHint(txt);
    setTimeout(() => setCmdHint(null), 2600);
  };

  const handleCmdSubmit = (e: FormEvent) => {
    e.preventDefault();
    const raw = cmdQuery.trim().toUpperCase();
    setCmdQuery('');
    if (!raw) return;

    const matchedSym = resolveSymbolQuery(
      raw,
      mergedInstruments,
      snapshot?.universe ?? [],
    );
    if (matchedSym) {
      setSelectedSymbol(matchedSym);
      return;
    }

    const tfMap: Record<string, TimeframeKey> = {
      '1M': '1M',
      '5M': '5M',
      '15M': '15M',
      '1H': '1H',
      '4H': '4H',
    };
    if (tfMap[raw]) {
      setTimeframe(tfMap[raw]);
      return;
    }

    const viewMap: Record<string, TabViewKey> = {
      MON: 'mon',
      EVAL: 'eval',
      ALPHA: 'eval',
      HEATMAP: 'heatmap',
      HEAT: 'heatmap',
      MACRO: 'macromaps',
      MAPS: 'macromaps',
      NEWS: 'news',
      TRADES: 'trades',
      TRD: 'trades',
      LOG: 'log',
      VALID: 'valid',
    };
    if (viewMap[raw]) {
      setActiveTab(viewMap[raw]);
      return;
    }

    if (raw === 'UNIV' || raw === 'SYMBOLS') {
      setShowUniverse((prev) => !prev);
      return;
    }

    if (raw === 'LOGIN') {
      setShowLoginNotice((prev) => !prev);
      return;
    }

    if (raw === 'HELP') {
      flashHint('COMMANDS: SYMBOL (EURUSD/XAU/BTC) · 1M/5M/15M/1H/4H · HEATMAP/MACRO/NEWS · UNIV');
      return;
    }

    flashHint(`UNKNOWN COMMAND "${raw}" · TYPE HELP OR A SYMBOL`);
  };

  const handleHeatmapSelect = (tile: HeatmapTile) => {
    setSelectedSymbol(tile.symbol);
    setActiveTab('mon');
  };

  const catalogCount = snapshot?.catalogCount ?? RELEASE.catalogCount;
  const defaultStreamCount = snapshot?.defaultStreamCount ?? RELEASE.defaultStreamCount;
  const spreadText =
    effectiveBook?.isLive && effectiveBook.spreadBp
      ? effectiveBook.spreadBp
      : activeInstrument.spreadBp;

  return (
    <div className="relative border border-[#34383e] bg-[#08090b] font-mono text-[11.5px] leading-[1.35] text-[#f0f0ec] tabular-nums shadow-[0_28px_80px_rgba(0,0,0,0.85)]">
      {/* 1. Custom Frameless Desktop Window Titlebar */}
      <div className="flex h-[28px] w-full items-center justify-between border-b border-[#25292e] bg-[#08090b] select-none">
        <div className="flex h-full items-center gap-[8px] pl-[10px] text-[11px]">
          <span className="rounded-[2px] bg-[#ff9e32] px-[5px] py-[1px] text-[9px] leading-[1.2] font-bold tracking-[0.05em] text-[#08090b]">
            ORCA
          </span>
          <span className="font-medium tracking-[0.04em] whitespace-nowrap text-[#939699]">
            ENTERPRISE · {activeInstrument.symbol}
          </span>
        </div>

        <div className="flex h-full items-center">
          <span className="hidden h-full items-center border-r border-[#25292e] px-2.5 text-[9.5px] tracking-[0.05em] text-[#939699] uppercase sm:inline-flex">
            {gatewayConfigured === false
              ? 'MARKET GATEWAY UNCONFIGURED'
              : gatewayAuthError
                ? 'MARKET GATEWAY AUTH ERROR (401/403)'
                : 'LIVE MARKET GATEWAY'}
          </span>
          <div className="hidden h-full items-center sm:flex" aria-hidden="true">
            <span className="grid h-[28px] w-[38px] place-items-center text-[#c8c9c7]">
              <svg width="10" height="1" viewBox="0 0 10 1">
                <rect width="10" height="1" fill="currentColor" />
              </svg>
            </span>
            <span className="grid h-[28px] w-[38px] place-items-center text-[#c8c9c7]">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="1" y="1" width="8" height="8" stroke="currentColor" strokeWidth="1" />
              </svg>
            </span>
            <span className="grid h-[28px] w-[38px] place-items-center text-[#c8c9c7]">
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path
                  d="M1 1L9 9M9 1L1 9"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </div>
        </div>
      </div>

      {/* 2. Command Bar */}
      <div className="relative flex flex-wrap items-stretch gap-[8px] border-b border-[#34383e] bg-[#15171a] px-[10px] py-[5px]">
        <div className="flex items-center gap-[8px]">
          <BrandMark />
          <span className="font-condensed text-[17px] leading-none font-semibold tracking-[0.03em] whitespace-nowrap text-[#f0f0ec]">
            ORCA <span className="font-normal text-[#ff9e32]">ENTERPRISE</span>
          </span>
        </div>

        <form
          onSubmit={handleCmdSubmit}
          autoComplete="off"
          className="relative flex min-w-[210px] flex-1 border border-[#34383e] bg-[#101215]"
        >
          <span className="border-r border-[#34383e] bg-[#1b1e22] px-[8px] py-[4px] font-semibold whitespace-nowrap text-[#ff9e32]">
            {activeInstrument.symbol}
          </span>
          <input
            value={cmdQuery}
            onChange={(e) => setCmdQuery(e.target.value)}
            spellCheck={false}
            aria-label="Terminal command bar"
            placeholder={cmdHint ?? 'SYMBOL · HELP · LOGIN (e.g. EURUSD, XAU, 1H)'}
            className="min-w-0 flex-1 border-0 bg-transparent px-[8px] py-[4px] font-mono text-[12px] text-[#f0f0ec] uppercase caret-[#ff9e32] outline-none placeholder:text-[#939699] placeholder:normal-case"
          />
          <button
            type="submit"
            className="cursor-pointer border-0 bg-[#ff9e32] px-[12px] font-semibold tracking-[0.05em] text-[#08090b] transition-colors hover:brightness-105"
          >
            GO
          </button>

          {autocompleteMatches.length > 0 && (
            <div
              role="listbox"
              aria-label="Symbol search results"
              className="absolute top-full left-0 z-30 max-h-[240px] min-w-[290px] overflow-y-auto border border-[#404952] bg-[#161c23]"
            >
              {autocompleteMatches.map((candidate) => (
                <button
                  key={candidate.symbol}
                  type="button"
                  role="option"
                  aria-selected={candidate.symbol === activeInstrument.symbol}
                  onClick={() => {
                    setSelectedSymbol(candidate.symbol);
                    setCmdQuery('');
                  }}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 border-0 border-b border-[#303943] bg-transparent px-[10px] py-[6px] text-left text-[11px] text-[#e5e7eb] hover:bg-[#1b1e22]"
                >
                  <span className="truncate">
                    <span className="font-semibold text-[#ff9e32]">{candidate.symbol}</span>{' '}
                    <span className="text-[#98a2ad]">{candidate.name}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-[#c8c9c7]">
                    {formatPrice(candidate.price, candidate.decimals)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </form>

        <div className="flex items-center gap-[6px]">
          <button
            type="button"
            onClick={() => setShowUniverse((prev) => !prev)}
            className={cn(
              'cursor-pointer border px-[9px] py-[3px] font-medium tracking-[0.04em] transition-colors',
              showUniverse
                ? 'border-[#ff9e32] bg-[#352719] text-[#ff9e32]'
                : 'border-[#34383e] bg-[#1b1e22] text-[#c8c9c7] hover:border-[#939699] hover:text-[#f0f0ec]',
            )}
          >
            SYMBOLS
          </button>
          <button
            type="button"
            onClick={() => setShowLoginNotice((prev) => !prev)}
            className="cursor-pointer border border-[#ff9e32] bg-[#ff9e32] px-[9px] py-[3px] font-semibold tracking-[0.04em] text-[#08090b] transition-colors hover:brightness-105"
          >
            LOGIN
          </button>
        </div>

        {/* Inline Universe Popover */}
        {showUniverse && (
          <div className="absolute top-full right-[10px] z-30 mt-0.5 w-[min(520px,calc(100%-20px))] border border-[#34383e] bg-[#101215] shadow-2xl">
            <PanelHeader
              code="UNIV"
              right={
                <button
                  type="button"
                  onClick={() => setShowUniverse(false)}
                  className="cursor-pointer border border-[#34383e] bg-[#1b1e22] px-1.5 text-[10px] text-[#c8c9c7] hover:text-[#f0f0ec]"
                >
                  CLOSE
                </button>
              }
            >
              MARKET CATALOG ({catalogCount} SYMBOLS · {defaultStreamCount} STREAMS)
            </PanelHeader>
            <div className="border-b border-[#25292e] bg-[#15171a] p-1.5">
              <input
                value={univFilter}
                onChange={(e) => setUnivFilter(e.target.value)}
                placeholder="Filter catalog symbols (e.g. EUR, XAU, TREASURY)..."
                className="w-full border border-[#34383e] bg-[#101215] px-2 py-1 font-mono text-[10.5px] text-[#f0f0ec] outline-none placeholder:text-[#939699]"
              />
            </div>
            <div className="orca-scroll grid max-h-[260px] grid-cols-2 gap-[1px] overflow-y-auto bg-[#25292e] p-[1px] sm:grid-cols-3">
              {filteredUniverse.length === 0 ? (
                <div className="col-span-full bg-[#101215] px-3 py-5 text-center text-[10.5px] text-[#939699]">
                  {snapshotLoading
                    ? 'Loading instrument catalog...'
                    : 'No matching instruments in catalog.'}
                </div>
              ) : (
                filteredUniverse.map((item) => (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => {
                      setSelectedSymbol(item.symbol);
                      setShowUniverse(false);
                    }}
                    className={cn(
                      'cursor-pointer bg-[#101215] px-2.5 py-2 text-left transition-colors hover:bg-[#1b1e22]',
                      item.symbol === activeInstrument.symbol && 'bg-[#35281b]',
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-[11px] font-semibold text-[#ff9e32]">
                        {item.symbol}
                      </span>
                      <span className="shrink-0 text-[9.5px] text-[#c8c9c7]">
                        {formatPrice(item.price, item.decimals)}
                      </span>
                    </div>
                    <div className="truncate text-[10px] text-[#939699]">{item.name}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Inline Login Notice */}
        {showLoginNotice && (
          <div className="w-full border border-[#34383e] border-l-[3px] border-l-[#ff9e32] bg-[#101215] px-2.5 py-1.5 text-[11px] text-[#c8c9c7]">
            <span className="font-semibold text-[#ff9e32]">DESKTOP AUTH:</span> In the Windows desktop app, LOGIN opens Enterprise sign-in to connect to the live market gateway ({defaultStreamCount} default streams / {catalogCount} catalog symbols).
          </div>
        )}

        {/* Gateway / Configuration Banner */}
        {(gatewayConfigured === false || snapshotError) && (
          <div className="flex w-full flex-wrap items-center justify-between gap-2 border border-[#34383e] border-l-[3px] border-l-[#f26d6d] bg-[#101215] px-2.5 py-1.5 text-[11px] text-[#c8c9c7]">
            <div>
              <span className="font-semibold text-[#f26d6d]">
                {gatewayConfigured === false
                  ? 'SERVER CONFIG:'
                  : gatewayAuthError
                    ? 'GATEWAY AUTH:'
                    : 'FEED OFFLINE:'}
              </span>{' '}
              {gatewayConfigured === false
                ? 'Set the server API key on the server to load live market data.'
                : snapshotError}
            </div>
            <button
              type="button"
              onClick={() => {
                setGatewayConfigured(null);
                setGatewayAuthError(false);
                setSnapshotLoading(true);
                setSnapshotError(null);
                setWsError(null);
                setReloadNonce((n) => n + 1);
              }}
              className="cursor-pointer border border-[#34383e] bg-[#1b1e22] px-2 py-0.5 text-[10px] text-[#ff9e32] hover:border-[#ff9e32]"
            >
              RETRY
            </button>
          </div>
        )}
      </div>

      {/* 3. F-Keys Navigation Bar */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabViewKey)}>
        <div className="orca-scroll flex items-center gap-[2px] overflow-x-auto border-b border-[#34383e] bg-[#08090b] px-[10px] py-[3px]">
          <TabsList className="h-auto gap-[2px] rounded-none border-0 bg-transparent p-0">
            {FKEY_TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="group rounded-none border-0 bg-[#1b1e22] px-[9px] py-[3px] pl-[4px] font-mono text-[11px] font-medium tracking-[0.05em] text-[#c8c9c7] shadow-none hover:text-[#f0f0ec] data-[state=active]:bg-[#ff9e32] data-[state=active]:font-semibold data-[state=active]:text-[#08090b] data-[state=active]:shadow-none"
              >
                <b className="mr-[5px] bg-[#101215] px-[4px] font-semibold text-[#ff9e32] group-data-[state=active]:bg-[#08090b] group-data-[state=active]:text-[#ff9e32]">
                  {tab.key}
                </b>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1" />
          <div className="hidden pl-3 text-[11px] whitespace-nowrap text-[#939699] xl:block">
            ORCA MARKET DATA · {snapshot?.activePriceCount ?? 0} ACTIVE
          </div>
        </div>

        {/* F1 MONITOR — Exact 4-Column 3-Row Institutional Grid */}
        <TabsContent value="mon" className="m-0 bg-[#08090b] p-[4px_6px_6px] sm:p-[6px_10px_8px]">
          <div className="grid grid-cols-1 gap-[4px] sm:grid-cols-2 lg:grid-cols-[minmax(210px,1.02fr)_minmax(0,1.5fr)_minmax(0,1.22fr)_minmax(210px,1.02fr)] lg:grid-rows-[405px_265px_245px]">
            {/* ROW 1 COL 1: MON Watchlist + WEI Cross-asset Benchmarks */}
            <section className="flex max-h-[380px] min-h-0 min-w-0 flex-col border border-[#34383e] bg-[#101215] lg:col-start-1 lg:row-start-1 lg:max-h-none">
              <PanelHeader
                code="MON"
                right={
                  <>
                    <span className="inline-flex items-center gap-[4px]">
                      <span
                        className={cn(
                          'h-[6px] w-[6px]',
                          wsConnected
                            ? 'orca-live-dot bg-[#53d391]'
                            : snapshot
                              ? 'bg-[#ff9e32]'
                              : 'bg-[#f26d6d]',
                        )}
                      />
                      {wsConnected ? 'LIVE' : snapshot ? 'REST' : 'OFF'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowUniverse((prev) => !prev)}
                      className="h-[16px] cursor-pointer border border-[#34383e] bg-[#101215] px-[4px] text-[10px] leading-[14px] text-[#ff9e32] hover:bg-[#ff9e32] hover:text-[#08090b]"
                    >
                      UNIV
                    </button>
                  </>
                }
              >
                Watchlist
              </PanelHeader>

              <div className="orca-scroll min-h-[165px] flex-1 overflow-x-hidden overflow-y-auto">
                <table className="w-full table-fixed border-collapse text-[10.5px]">
                  <thead>
                    <tr className="sticky top-0 z-[1] border-b border-[#34383e] bg-[#15171a] font-condensed text-[10.5px] tracking-[0.04em] text-[#d8a06a] uppercase">
                      <th className="w-[29%] py-[3px] pr-1 pl-[8px] text-left font-medium">SYM</th>
                      <th className="w-[30%] px-1 py-[3px] text-right font-medium">LAST</th>
                      <th className="w-[20%] px-1 py-[3px] text-right font-medium">24H</th>
                      <th className="w-[21%] py-[3px] pr-[6px] pl-1 text-right font-medium">SPARK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mergedInstruments.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-2 py-8 text-center text-[10.5px] text-[#939699]">
                          {snapshotLoading
                            ? 'Loading watchlist...'
                            : snapshotError || 'No active instrument feeds.'}
                        </td>
                      </tr>
                    ) : (
                      mergedInstruments.map((item) => {
                        const selected = item.symbol === activeInstrument.symbol;
                        const pct = item.changePct;
                        return (
                          <tr
                            key={item.symbol}
                            onClick={() => setSelectedSymbol(item.symbol)}
                            className={cn(
                              'cursor-pointer border-b border-[#25292e] transition-colors',
                              selected
                                ? 'bg-[#35281b] shadow-[inset_3px_0_0_#ff9e32]'
                                : 'hover:bg-[#1b1e22]',
                            )}
                          >
                            <td className="truncate py-[2px] pr-1 pl-[8px] font-semibold text-[#ff9e32]">
                              {item.shortLabel}
                            </td>
                            <td className="truncate px-1 py-[2px] text-right text-[#f0f0ec]">
                              {formatPrice(item.price, item.decimals)}
                            </td>
                            <td
                              className={cn(
                                'truncate px-1 py-[2px] text-right',
                                pct === null
                                  ? 'text-[#939699]'
                                  : pct >= 0
                                    ? 'text-[#53d391]'
                                    : 'text-[#f26d6d]',
                              )}
                            >
                              {formatSignedPct(pct)}
                            </td>
                            <td className="py-[2px] pr-[6px] pl-1 text-right">
                              <WatchSparkline values={item.spark} />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <PanelHeader code="WEI" sub>
                Cross-asset Benchmarks
              </PanelHeader>
              <div className="shrink-0">
                <table className="w-full table-fixed border-collapse text-[10.5px]">
                  <tbody>
                    {mergedBenchmarks.length === 0 ? (
                      <tr>
                        <td className="px-2 py-3 text-center text-[10px] text-[#939699]">
                          {snapshotLoading ? 'Loading benchmarks...' : 'Benchmarks unavailable.'}
                        </td>
                      </tr>
                    ) : (
                      mergedBenchmarks.map((bm) => (
                        <tr
                          key={bm.sym}
                          onClick={() => bm.targetSymbol && setSelectedSymbol(bm.targetSymbol)}
                          title={bm.unavailableReason || bm.source}
                          className={cn(
                            'border-b border-[#25292e] last:border-b-0',
                            bm.targetSymbol && 'cursor-pointer hover:bg-[#1b1e22]',
                          )}
                        >
                          <td className="w-[20%] py-[2px] pr-1 pl-[8px] font-semibold text-[#ff9e32]">
                            {bm.sym}
                          </td>
                          <td className="w-[38%] truncate px-1 py-[2px] text-[#939699]">
                            {bm.name}
                          </td>
                          <td className="w-[22%] px-1 py-[2px] text-right text-[#f0f0ec]">
                            {formatPrice(bm.last, bm.decimals)}
                          </td>
                          <td
                            className={cn(
                              'w-[20%] py-[2px] pr-[8px] pl-1 text-right',
                              bm.pct === null
                                ? 'text-[#939699]'
                                : bm.pct >= 0
                                  ? 'text-[#53d391]'
                                  : 'text-[#f26d6d]',
                            )}
                          >
                            {formatSignedPct(bm.pct)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ROW 1 COL 2-3: CHART */}
            <section className="flex min-h-[340px] min-w-0 flex-col border border-[#34383e] bg-[#101215] sm:col-span-2 lg:col-span-2 lg:col-start-2 lg:row-start-1 lg:min-h-0">
              <div className="flex min-h-[22px] shrink-0 flex-wrap items-center gap-[4px] border-b border-[#34383e] bg-[#1b1e22] py-0.5 pr-[6px] pl-0 font-condensed text-[11px] font-semibold tracking-[0.025em] text-[#f0f0ec] uppercase lg:h-[22px] lg:flex-nowrap lg:gap-[5px] lg:overflow-hidden lg:py-0">
                <span className="flex h-[22px] shrink-0 items-center border-r border-[#34383e] bg-[#352719] px-[6px] font-mono text-[10.5px] font-medium text-[#ff9e32]">
                  CHART
                </span>

                <div className="flex min-w-0 flex-wrap items-center gap-[2px] pl-[4px] lg:shrink-0 lg:flex-nowrap lg:gap-[1px] lg:pl-0">
                  {QUICK_SYMBOLS.map((sym) => {
                    const label = sym === 'XAUUSD' ? 'GOLD' : shortSymbolLabel(sym);
                    const isOn = activeInstrument.symbol === sym;
                    return (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => setSelectedSymbol(sym)}
                        className={cn(
                          'h-[16px] shrink-0 cursor-pointer border px-[5px] font-mono text-[10px] leading-[14px] font-medium transition-colors',
                          isOn
                            ? 'border-[#ff9e32] bg-[#ff9e32] text-[#08090b]'
                            : 'border-[#34383e] bg-[#101215] text-[#939699] hover:text-[#f0f0ec]',
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setShowUniverse((prev) => !prev)}
                    className="h-[16px] shrink-0 cursor-pointer border border-[#34383e] bg-[#1b1e22] px-[5px] font-mono text-[10px] leading-[14px] text-[#c8c9c7] hover:text-[#f0f0ec]"
                  >
                    ▾ UNIV
                  </button>
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-[1px] pl-[4px] sm:pl-0 lg:shrink-0 lg:flex-nowrap">
                  {TIMEFRAMES.map((tf) => (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setTimeframe(tf)}
                      className={cn(
                        'h-[16px] shrink-0 cursor-pointer border px-[5px] font-mono text-[10px] leading-[14px] font-medium transition-colors',
                        timeframe === tf
                          ? 'border-[#ff9e32] bg-[#ff9e32] text-[#08090b]'
                          : 'border-[#34383e] bg-[#101215] text-[#939699] hover:text-[#f0f0ec]',
                      )}
                    >
                      {tf}
                    </button>
                  ))}
                </div>

                <div className="flex shrink-0 items-center gap-2 pl-1 font-mono text-[10px] font-normal tracking-normal normal-case">
                  <button
                    type="button"
                    onClick={() => setShowEma20((prev) => !prev)}
                    className={cn(
                      'inline-flex cursor-pointer items-center gap-1 transition-opacity',
                      showEma20 ? 'text-[#c8c9c7]' : 'text-[#626b78] opacity-60',
                    )}
                  >
                    <span className="inline-block h-[2px] w-[10px] bg-[#ff9e32]" />
                    EMA20
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEma50((prev) => !prev)}
                    className={cn(
                      'inline-flex cursor-pointer items-center gap-1 transition-opacity',
                      showEma50 ? 'text-[#c8c9c7]' : 'text-[#626b78] opacity-60',
                    )}
                  >
                    <span className="inline-block h-[2px] w-[10px] bg-[#77aef5]" />
                    EMA50
                  </button>
                </div>

                <span className="ml-auto hidden truncate font-mono text-[10px] font-normal tracking-normal text-[#939699] 2xl:inline">
                  LIVE MARKET DATA · OHLCV
                </span>
              </div>

              <OrcaChart
                symbol={activeInstrument.symbol}
                decimals={activeInstrument.decimals}
                bars={bars}
                loading={candlesLoading}
                error={candlesError}
                showEma20={showEma20}
                showEma50={showEma50}
                heightClass="h-[290px] sm:h-[340px] lg:h-full lg:min-h-[360px]"
              />
            </section>

            {/* ROW 1 COL 4: NEWS WIRE */}
            <section className="flex max-h-[340px] min-h-[260px] min-w-0 flex-col border border-[#34383e] bg-[#101215] lg:col-start-4 lg:row-start-1 lg:max-h-none lg:min-h-0">
              <PanelHeader
                code="NEWS"
                right={
                  <>
                    <span className="inline-flex items-center gap-[4px]">
                      <span
                        className={cn(
                          'h-[6px] w-[6px]',
                          newsItems.length > 0 ? 'orca-live-dot bg-[#53d391]' : 'bg-[#939699]',
                        )}
                      />
                      WIRE
                    </span>
                    <button
                      type="button"
                      onClick={() => void fetchNews(true)}
                      className="h-[16px] cursor-pointer border border-[#34383e] bg-[#101215] px-[5px] text-[10px] leading-[14px] text-[#ff9e32] hover:bg-[#ff9e32] hover:text-[#08090b]"
                    >
                      {newsSyncLabel}
                    </button>
                  </>
                }
              >
                News Wire
              </PanelHeader>

              <div className="orca-scroll flex-1 overflow-y-auto">
                {newsItems.length === 0 ? (
                  <div className="px-3 py-8 text-center text-[10.5px] text-[#939699]">
                    {newsLoading
                      ? 'Loading news wire...'
                      : newsError || 'No news headlines available.'}
                  </div>
                ) : (
                  newsItems.map((item) => (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex gap-[8px] border-b border-[#25292e] p-[7px] transition-colors hover:bg-[#1b1e22]"
                    >
                      <div className="flex h-[48px] w-[68px] shrink-0 flex-col items-center justify-center gap-[2px] border border-[#34383e] bg-gradient-to-br from-[#1b1e22] to-[#101215] font-condensed text-[8.5px] font-semibold tracking-[0.05em] text-[#d8a06a] uppercase">
                        <svg width="24" height="16" viewBox="0 0 26 18" fill="none" aria-hidden="true">
                          <path
                            d="M2 13L7 7L13 11L20 3L24 6"
                            stroke="#ff9e32"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M7 14V7M13 16V11M20 9V3"
                            stroke="#d8a06a"
                            strokeOpacity="0.4"
                            strokeWidth="1"
                          />
                        </svg>
                        <span className="max-w-[60px] truncate">{item.source}</span>
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                        <div className="flex flex-wrap items-center gap-[5px] text-[9.5px] leading-tight">
                          <span className="font-condensed font-semibold tracking-[0.05em] text-[#ff9e32] uppercase">
                            {item.source}
                          </span>
                          <span className="text-[#939699]">
                            · {formatRelativeDateTime(item.publishedAt)}
                          </span>
                          {item.impact === 'HIGH' && (
                            <span className="border border-[#f26d6d] bg-[#f26d6d]/15 px-[3px] text-[8.5px] font-semibold text-[#f26d6d]">
                              HIGH
                            </span>
                          )}
                        </div>
                        <h4 className="line-clamp-2 text-[11px] leading-[1.25] font-semibold text-[#f0f0ec]">
                          {item.title}
                        </h4>
                        {item.summary && (
                          <p className="line-clamp-2 text-[10px] leading-[1.3] text-[#c8c9c7]/85">
                            {item.summary}
                          </p>
                        )}
                      </div>
                    </a>
                  ))
                )}
              </div>
            </section>

            {/* ROW 2 COL 1: TV */}
            <section className="flex min-h-[210px] min-w-0 flex-col border border-[#34383e] bg-[#101215] lg:col-start-1 lg:row-start-2 lg:min-h-0">
              <div className="flex h-[22px] shrink-0 items-center gap-[5px] border-b border-[#34383e] bg-[#1b1e22] pr-[6px] font-condensed text-[11px] font-semibold uppercase">
                <span className="flex h-full shrink-0 items-center border-r border-[#34383e] bg-[#352719] px-[6px] font-mono text-[10.5px] font-medium text-[#ff9e32]">
                  TV
                </span>
                <select
                  aria-label="Select broadcast channel"
                  value={tvChannelId}
                  onChange={(e) => setTvChannelId(e.target.value)}
                  className="h-[16px] border border-[#34383e] bg-[#101215] px-1 font-mono text-[10px] text-[#ff9e32] outline-none"
                >
                  {TV_CHANNELS.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setTvMuted((m) => !m)}
                  className="h-[16px] cursor-pointer border border-[#34383e] bg-[#1b1e22] px-1.5 font-mono text-[9.5px] text-[#c8c9c7] hover:text-[#f0f0ec]"
                >
                  {tvMuted ? 'MUTE' : 'AUDIO'}
                </button>
                <button
                  type="button"
                  onClick={() => setTvPlaying((p) => !p)}
                  className="ml-auto h-[16px] cursor-pointer border border-[#ff9e32] bg-[#352719] px-1.5 font-mono text-[9.5px] text-[#ff9e32] hover:bg-[#ff9e32] hover:text-[#08090b]"
                >
                  {tvPlaying ? 'STOP' : 'PLAY'}
                </button>
              </div>

              {tvPlaying ? (
                <div className="relative flex flex-1 flex-col bg-[#08090b]">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${activeChannel.target}?autoplay=1&mute=${tvMuted ? 1 : 0}&rel=0`}
                    title={`${activeChannel.name} live stream`}
                    className="h-full w-full flex-1 border-0"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="relative flex flex-1 flex-col justify-between overflow-hidden bg-[#08090b] p-3">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="border border-[#f26d6d]/60 bg-[#f26d6d]/15 px-1.5 py-0.5 font-semibold text-[#f26d6d]">
                      READY · {activeChannel.name}
                    </span>
                    <span className="text-[#939699]">{activeChannel.desk}</span>
                  </div>

                  <div className="my-auto border border-[#25292e] bg-[#101215]/90 p-2.5">
                    <div className="font-condensed text-[11px] tracking-[0.06em] text-[#ff9e32] uppercase">
                      LIVE MARKET BROADCAST
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-[#c8c9c7]">
                      Click <span className="text-[#ff9e32]">PLAY</span> to load {activeChannel.name} without slowing down initial page load.
                    </p>
                  </div>

                  <div className="truncate border-t border-[#25292e] pt-1.5 text-[10px] text-[#d8a06a]">
                    {activeInstrument.symbol} · LAST{' '}
                    {formatPrice(activeInstrument.price, activeInstrument.decimals)} · 24H{' '}
                    {formatSignedPct(activeInstrument.changePct)} · SPREAD {spreadText}
                  </div>
                </div>
              )}
            </section>

            {/* ROW 2 COL 2: TAPE Live Trades / Quote Activity */}
            <section className="flex max-h-[260px] min-h-[210px] min-w-0 flex-col border border-[#34383e] bg-[#101215] lg:col-start-2 lg:row-start-2 lg:max-h-none lg:min-h-0">
              <PanelHeader code="TAPE">
                {isCryptoTradeMode ? 'Live Trades' : 'Quote Activity'} · {activeInstrument.symbol}
              </PanelHeader>

              <div className="orca-scroll flex-1 overflow-x-hidden overflow-y-auto">
                <table className="w-full table-fixed border-collapse text-[10.5px]">
                  <thead>
                    <tr className="sticky top-0 z-[1] border-b border-[#34383e] bg-[#15171a] font-condensed text-[10.5px] tracking-[0.04em] text-[#d8a06a] uppercase">
                      <th className="w-[26%] py-[3px] pr-1 pl-[8px] text-left font-medium">Time</th>
                      <th className="w-[18%] px-1 py-[3px] text-left font-medium">
                        {isCryptoTradeMode ? 'Side' : 'Bid'}
                      </th>
                      <th className="w-[24%] px-1 py-[3px] text-right font-medium">
                        {isCryptoTradeMode ? 'Size' : 'Ask'}
                      </th>
                      <th className="w-[32%] py-[3px] pr-[8px] pl-1 text-right font-medium">
                        {isCryptoTradeMode ? 'Price' : 'Spread / Last'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tapeRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-2 py-8 text-center text-[10px] text-[#939699]">
                          {gatewayConfigured === false
                            ? 'Gateway not connected.'
                            : gatewayAuthError
                              ? 'Upstream API key rejected.'
                              : wsConnected
                                ? `Waiting for live ticks on ${activeInstrument.symbol}...`
                                : 'Connecting to live tick stream...'}
                        </td>
                      </tr>
                    ) : (
                      tapeRows.map((row) => (
                        <tr key={row.id} className="border-b border-[#25292e]">
                          <td className="truncate py-[2px] pr-1 pl-[8px] text-[#939699]">
                            {row.time}
                          </td>
                          {row.kind === 'trade' ? (
                            <>
                              <td
                                className={cn(
                                  'px-1 py-[2px] font-medium',
                                  row.side === 'BUY' ? 'text-[#53d391]' : 'text-[#f26d6d]',
                                )}
                              >
                                {row.side}
                              </td>
                              <td className="truncate px-1 py-[2px] text-right text-[#f0f0ec]">
                                {formatTradeSize(row.size)}
                              </td>
                              <td className="truncate py-[2px] pr-[8px] pl-1 text-right text-[#f0f0ec]">
                                {formatPrice(row.price, activeInstrument.decimals)}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="truncate px-1 py-[2px] text-[#f0f0ec]">
                                {formatPrice(row.bid, activeInstrument.decimals)}
                              </td>
                              <td className="truncate px-1 py-[2px] text-right text-[#f0f0ec]">
                                {formatPrice(row.ask, activeInstrument.decimals)}
                              </td>
                              <td className="truncate py-[2px] pr-[8px] pl-1 text-right text-[#c8c9c7]">
                                {row.bid && row.ask
                                  ? computeSpreadBp(row.bid, row.ask)
                                  : formatPrice(row.price, activeInstrument.decimals)}
                              </td>
                            </>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ROW 2 COL 3: IMAP Global Market Map */}
            <section className="flex min-h-[210px] min-w-0 flex-col border border-[#34383e] bg-[#101215] lg:col-start-3 lg:row-start-2 lg:min-h-0">
              <PanelHeader code="IMAP" right="Live market snapshot">
                Global Market Map
              </PanelHeader>

              {imapTiles.length === 0 ? (
                <div className="flex flex-1 items-center justify-center bg-[#08090b] p-4 text-center text-[10.5px] text-[#939699]">
                  {snapshotLoading ? 'Loading market map...' : 'No active market prices.'}
                </div>
              ) : (
                <div className="grid flex-1 grid-cols-2 gap-[3px] bg-[#08090b] p-[4px] sm:grid-cols-4">
                  {imapTiles.map((tile) => {
                    const pct = tile.changePct;
                    const isSelected = tile.symbol === activeInstrument.symbol;
                    const boxClasses =
                      pct === null
                        ? 'border-[#34383e] bg-[#1b1e22]'
                        : pct >= 0
                          ? 'border-[#53d391]/70 bg-[#53d391]/15'
                          : 'border-[#f26d6d]/70 bg-[#f26d6d]/15';

                    return (
                      <button
                        key={tile.symbol}
                        type="button"
                        onClick={() => setSelectedSymbol(tile.symbol)}
                        className={cn(
                          'flex cursor-pointer flex-col justify-between border p-1.5 text-left transition-colors hover:brightness-110',
                          boxClasses,
                          isSelected && 'ring-1 ring-[#ff9e32]',
                        )}
                      >
                        <span className="truncate text-[9px] font-semibold text-[#ff9e32]">
                          {tile.symbol}
                        </span>
                        <span className="truncate text-[11px] font-semibold text-[#f0f0ec]">
                          {formatPrice(tile.price, tile.decimals)}
                        </span>
                        <span className="text-[9px] text-[#c8c9c7]">
                          {pct === null ? '24h N/A' : `24h ${formatSignedPct(pct)}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ROW 2 COL 4: L2 Order Book Depth */}
            <section className="flex min-h-[210px] min-w-0 flex-col border border-[#34383e] bg-[#101215] lg:col-start-4 lg:row-start-2 lg:min-h-0">
              <PanelHeader
                code="L2"
                right={`${activeInstrument.symbol} · ${effectiveBook?.venue ?? activeInstrument.venue}`}
              >
                Order Book Depth
              </PanelHeader>

              {effectiveBook && effectiveBook.isLive && effectiveBook.asks.length > 0 && effectiveBook.bids.length > 0 ? (
                <div className="flex-1 overflow-hidden">
                  <table className="w-full table-fixed border-collapse text-[10px]">
                    <colgroup>
                      <col style={{ width: '22%' }} />
                      <col style={{ width: '28%' }} />
                      <col style={{ width: '28%' }} />
                      <col style={{ width: '22%' }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-[#34383e] bg-[#15171a] font-condensed text-[10px] text-[#d8a06a] uppercase">
                        <th className="truncate py-[2px] pl-[6px] text-left font-medium whitespace-nowrap">
                          Bid ({effectiveBook.sizeUnit || activeInstrument.sizeUnit})
                        </th>
                        <th className="px-1 py-[2px] text-right font-medium whitespace-nowrap">Bid</th>
                        <th className="px-1 py-[2px] text-left font-medium whitespace-nowrap">Ask</th>
                        <th className="truncate py-[2px] pr-[6px] text-right font-medium whitespace-nowrap">
                          Ask ({effectiveBook.sizeUnit || activeInstrument.sizeUnit})
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {effectiveBook.asks.map((ask, idx) => (
                        <tr key={`ask-${idx}`} className="border-b border-[#25292e]">
                          <td className="py-[1.5px] pl-[6px] text-[#939699]">—</td>
                          <td className="px-1 py-[1.5px] text-right text-[#939699]">—</td>
                          <td className="relative overflow-hidden px-1 py-[1.5px] text-[#f26d6d]">
                            <span
                              className="absolute inset-y-[1px] right-0 bg-[#f26d6d]/25"
                              style={{ width: `${ask.pct}%` }}
                            />
                            <span className="relative">
                              {formatPrice(ask.price, activeInstrument.decimals)}
                            </span>
                          </td>
                          <td className="py-[1.5px] pr-[6px] text-right text-[#f0f0ec]">
                            {formatOrderSize(ask.size)}
                          </td>
                        </tr>
                      ))}

                      <tr className="border-y border-[#34383e] bg-[#1b1e22] text-center text-[#ff9e32]">
                        <td colSpan={4} className="py-[2px]">
                          SPREAD: <strong className="font-semibold">{spreadText}</strong>
                        </td>
                      </tr>

                      {effectiveBook.bids.map((bid, idx) => (
                        <tr key={`bid-${idx}`} className="border-b border-[#25292e]">
                          <td className="relative overflow-hidden py-[1.5px] pl-[6px] text-[#f0f0ec]">
                            <span
                              className="absolute inset-y-[1px] right-0 bg-[#53d391]/25"
                              style={{ width: `${bid.pct}%` }}
                            />
                            <span className="relative">{formatOrderSize(bid.size)}</span>
                          </td>
                          <td className="px-1 py-[1.5px] text-right text-[#53d391]">
                            {formatPrice(bid.price, activeInstrument.decimals)}
                          </td>
                          <td className="px-1 py-[1.5px] text-[#939699]">—</td>
                          <td className="py-[1.5px] pr-[6px] text-right text-[#939699]">—</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 text-center text-[10.5px] text-[#939699]">
                  {orderBookLoading ? (
                    <span>Loading L2 snapshot...</span>
                  ) : (
                    <>
                      <span className="font-semibold text-[#c8c9c7]">
                        EXCHANGE L2 UNAVAILABLE
                      </span>
                      <span className="text-[10px]">
                        {effectiveBook?.unavailableReason ||
                          'No active exchange L2 snapshot for this symbol.'}
                      </span>
                      {(activeInstrument.bid !== null || activeInstrument.ask !== null) && (
                        <span className="mt-1 border border-[#25292e] bg-[#15171a] px-2 py-0.5 text-[10px] text-[#d8a06a]">
                          TOP QUOTE: {formatPrice(activeInstrument.bid, activeInstrument.decimals)} /{' '}
                          {formatPrice(activeInstrument.ask, activeInstrument.decimals)} ({spreadText})
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>

            {/* ROW 3 COL 1: FGI Fear & Greed Index */}
            <section className="flex min-h-[210px] min-w-0 flex-col border border-[#34383e] bg-[#101215] lg:col-start-1 lg:row-start-3 lg:min-h-0">
              <PanelHeader code="FGI" right="0–100 INDEX">
                Fear & Greed Index
              </PanelHeader>

              {fearGreed ? (
                <div className="flex flex-1 flex-col justify-between gap-[4px] overflow-hidden px-[8px] py-[5px]">
                  <div className="flex items-center gap-[10px] border-b border-[#25292e] pb-[4px]">
                    <strong className="font-condensed text-[38px] leading-[0.88] font-semibold text-[#ff9e32]">
                      {fearGreed.score}
                    </strong>
                    <div className="flex min-w-0 flex-col gap-[2px]">
                      <span className="font-condensed text-[15px] leading-none font-semibold text-[#f0f0ec]">
                        {fearGreed.label}
                      </span>
                      <small className="text-[9.5px] text-[#939699]">
                        {fearGreed.updatedAt
                          ? `Updated ${formatRelativeDateTime(fearGreed.updatedAt)}`
                          : 'Market sentiment · 0–100'}
                      </small>
                    </div>
                  </div>

                  <div className="flex flex-col gap-[3px]">
                    <div
                      className="relative mx-[3px] h-[7px]"
                      style={{
                        background:
                          'linear-gradient(90deg, #c74f50 0%, #e58d50 25%, #a8a59b 50%, #a7b76c 75%, #53b778 100%)',
                      }}
                    >
                      <span
                        className="absolute top-[-2.5px] h-[12px] w-[2px] -translate-x-1/2 bg-[#f0f0ec] shadow-[0_0_0_2px_#101215]"
                        style={{ left: `${fearGreed.score}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] leading-tight text-[#939699]">
                      <span>Extreme Fear</span>
                      <span>Extreme Greed</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-[3px] border-t border-[#25292e] pt-[4px]">
                    {fearGreed.components.map((comp) => (
                      <div
                        key={comp.key}
                        className="grid grid-cols-[minmax(80px,1fr)_minmax(45px,1.1fr)_22px] items-center gap-[6px] text-[9.5px] leading-[1.2] text-[#c8c9c7]"
                      >
                        <span className="truncate">{comp.name}</span>
                        <div className="h-[4px] bg-[#1b1e22]">
                          <div
                            className="h-full bg-[#d8a06a]"
                            style={{ width: `${comp.val}%` }}
                          />
                        </div>
                        <b className="text-right font-medium text-[#f0f0ec]">{comp.val}</b>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center px-3 text-center text-[10.5px] text-[#939699]">
                  {fgiLoading
                    ? 'Loading Fear & Greed Index...'
                    : fgiError || 'Sentiment index unavailable.'}
                </div>
              )}
            </section>

            {/* ROW 3 COL 2: ECON Economic Calendar */}
            <section className="flex max-h-[260px] min-h-[210px] min-w-0 flex-col border border-[#34383e] bg-[#101215] lg:col-start-2 lg:row-start-3 lg:max-h-none lg:min-h-0">
              <PanelHeader
                code="ECON"
                right={
                  <>
                    {(['ALL', 'HIGH', 'USD'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setEconFilter(f)}
                        className={cn(
                          'h-[16px] cursor-pointer border bg-[#101215] px-[5px] text-[10px] leading-[14px]',
                          econFilter === f
                            ? 'border-[#d8a06a] text-[#ff9e32]'
                            : 'border-[#34383e] text-[#939699] hover:text-[#f0f0ec]',
                        )}
                      >
                        {f}
                      </button>
                    ))}
                  </>
                }
              >
                Economic Calendar
              </PanelHeader>

              <div className="orca-scroll flex-1 overflow-x-hidden overflow-y-auto">
                <table className="w-full table-fixed border-collapse text-[10px]">
                  <thead>
                    <tr className="sticky top-0 z-[1] border-b border-[#34383e] bg-[#15171a] font-condensed text-[10px] tracking-[0.04em] text-[#d8a06a] uppercase">
                      <th className="w-[21%] py-[3px] pl-[6px] text-left font-medium">Time</th>
                      <th className="w-[12%] px-1 py-[3px] text-left font-medium">Cur</th>
                      <th className="w-[34%] px-1 py-[3px] text-left font-medium">Macro Event</th>
                      <th className="w-[11%] px-1 py-[3px] text-left font-medium">Imp</th>
                      <th className="w-[11%] px-1 py-[3px] text-right font-medium">Actual</th>
                      <th className="w-[11%] py-[3px] pr-[6px] text-right font-medium">Fcst</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEcon.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-2 py-8 text-center text-[10px] text-[#939699]">
                          {calLoading
                            ? 'Loading economic calendar...'
                            : calError || 'No matching economic releases.'}
                        </td>
                      </tr>
                    ) : (
                      visibleEcon.map((ev) => (
                        <tr
                          key={ev.id}
                          className={cn(
                            'border-b border-[#25292e]',
                            ev.released && 'opacity-65',
                          )}
                        >
                          <td className="truncate py-[3px] pl-[6px] text-[#c8c9c7]">
                            {ev.timeLabel}
                          </td>
                          <td className="px-1 py-[3px]">
                            <span
                              className={cn(
                                'inline-block rounded-[2px] px-[4px] py-[1px] text-[9px] font-semibold',
                                ev.cur === 'USD'
                                  ? 'bg-[#352719] text-[#ff9e32]'
                                  : ev.cur === 'EUR'
                                    ? 'bg-[#3987e5]/20 text-[#77aef5]'
                                    : ev.cur === 'JPY'
                                      ? 'bg-[#d95926]/20 text-[#e08a63]'
                                      : 'bg-[#d55181]/20 text-[#cb8db1]',
                              )}
                            >
                              {ev.cur}
                            </span>
                          </td>
                          <td className="truncate px-1 py-[3px] font-semibold text-[#f0f0ec]">
                            {ev.event}
                          </td>
                          <td className="px-1 py-[3px]">
                            <span
                              className={cn(
                                'inline-block rounded-[2px] px-[4px] py-[1px] font-condensed text-[8.5px] font-bold',
                                ev.imp === 'HI'
                                  ? 'border border-[#f26d6d] bg-[#f26d6d]/15 text-[#f26d6d]'
                                  : ev.imp === 'MED'
                                    ? 'border border-[#f4c16b] bg-[#2a2116] text-[#f4c16b]'
                                    : 'bg-[#858585]/15 text-[#939699]',
                              )}
                            >
                              {ev.imp}
                            </span>
                          </td>
                          <td className="truncate px-1 py-[3px] text-right text-[#f0f0ec]">
                            {ev.actual}
                          </td>
                          <td className="truncate py-[3px] pr-[6px] text-right text-[#939699]">
                            {ev.fcst}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ROW 3 COL 3-4: TICK Live Price Pulse */}
            <section className="flex min-h-[210px] min-w-0 flex-col border border-[#34383e] bg-[#101215] sm:col-span-2 lg:col-span-2 lg:col-start-3 lg:row-start-3 lg:min-h-0">
              <PanelHeader code="TICK" right={`${activeInstrument.symbol} · stream`}>
                Live Price Pulse
              </PanelHeader>

              <div className="flex min-h-0 flex-1 flex-col justify-between px-[12px] py-[8px]">
                <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
                  <span className={pulseSummary.up ? 'text-[#53d391]' : 'text-[#f26d6d]'}>
                    {formatPrice(activeInstrument.price, activeInstrument.decimals)}
                  </span>
                  <span className="text-[#c8c9c7]">
                    {pulseSummary.rate10.toFixed(1)} ticks/sec · last 10s
                  </span>
                  <span className={wsConnected ? 'text-[#53d391]' : 'text-[#939699]'}>
                    {wsConnected ? 'LIVE' : 'STANDBY'}
                  </span>
                </div>

                {pulseSummary.points.length >= 2 ? (
                  <svg
                    className="my-1 min-h-[95px] w-full flex-1"
                    viewBox="0 0 800 205"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label={`Live price pulse for ${activeInstrument.symbol}`}
                  >
                    {[0, 0.5, 1].map((frac) => (
                      <line
                        key={frac}
                        x1="24"
                        x2="776"
                        y1={24 + frac * 150}
                        y2={24 + frac * 150}
                        stroke="#25292e"
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                    <path
                      d={pulseSummary.path}
                      fill="none"
                      stroke={pulseSummary.up ? '#53d391' : '#f26d6d'}
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle
                      cx={pulseSummary.points[pulseSummary.points.length - 1].x}
                      cy={pulseSummary.points[pulseSummary.points.length - 1].y}
                      r="4"
                      fill={pulseSummary.up ? '#53d391' : '#f26d6d'}
                    />
                    <text x="24" y="196" fill="#939699" fontSize="10">
                      -30s
                    </text>
                    <text x="776" y="196" textAnchor="end" fill="#939699" fontSize="10">
                      now
                    </text>
                  </svg>
                ) : (
                  <div className="my-auto flex items-center justify-center border border-[#25292e] bg-[#08090b] py-6 text-[10.5px] text-[#939699]">
                    {wsConnected
                      ? `Waiting for live ticks on ${activeInstrument.symbol} (30s window)...`
                      : 'No live ticks received for this symbol yet.'}
                  </div>
                )}

                <div className="text-right text-[10px] text-[#939699]">
                  {pulseSummary.total30} ticks · 30-second window · live stream
                </div>
              </div>
            </section>
          </div>
        </TabsContent>

        {/* F2 ORCA ALPHA */}
        <TabsContent value="eval" className="m-0 bg-[#08090b] p-[6px_10px_8px]">
          <div className="grid grid-cols-1 gap-[4px] lg:grid-cols-12">
            <div className="flex items-center gap-1 border border-[#34383e] bg-[#101215] p-1.5 lg:col-span-1 lg:flex-col lg:py-2">
              {DRAWING_TOOLS.map(({ id, icon: Icon, label }) => (
                <Tooltip key={id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setActiveTool(id)}
                      aria-label={label}
                      className={cn(
                        'grid h-8 w-8 cursor-pointer place-items-center border transition-colors',
                        activeTool === id
                          ? 'border-[#ff9e32] bg-[#352719] text-[#ff9e32]'
                          : 'border-transparent text-[#939699] hover:bg-[#1b1e22] hover:text-[#f0f0ec]',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{label}</TooltipContent>
                </Tooltip>
              ))}
            </div>

            <div className="flex flex-col border border-[#34383e] bg-[#101215] lg:col-span-8">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#34383e] bg-[#1b1e22] pr-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="flex h-[22px] items-center border-r border-[#34383e] bg-[#352719] px-2 text-[10.5px] font-medium text-[#ff9e32]">
                    ALPHA
                  </span>
                  {QUICK_SYMBOLS.map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => setSelectedSymbol(sym)}
                      className={cn(
                        'cursor-pointer border px-1.5 py-[1px] text-[10px]',
                        sym === activeInstrument.symbol
                          ? 'border-[#ff9e32] bg-[#352719] text-[#ff9e32]'
                          : 'border-[#34383e] bg-[#101215] text-[#c8c9c7] hover:text-[#f0f0ec]',
                      )}
                    >
                      {sym}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-[1px]">
                  {TIMEFRAMES.map((tf) => (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setTimeframe(tf)}
                      className={cn(
                        'h-[16px] cursor-pointer border px-1.5 text-[10px]',
                        timeframe === tf
                          ? 'border-[#ff9e32] bg-[#ff9e32] font-semibold text-[#08090b]'
                          : 'border-[#34383e] bg-[#101215] text-[#939699]',
                      )}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              <OrcaChart
                symbol={activeInstrument.symbol}
                decimals={activeInstrument.decimals}
                bars={bars}
                loading={candlesLoading}
                error={candlesError}
                showEma20={showEma20}
                showEma50={showEma50}
                heightClass="h-[310px] sm:h-[360px]"
              />
            </div>

            <div className="flex flex-col justify-between border border-[#34383e] bg-[#101215] lg:col-span-3">
              <div>
                <PanelHeader code="QUOTE" right="LIVE FEED">
                  {activeInstrument.symbol}
                </PanelHeader>
                <div className="grid grid-cols-2 gap-2 p-3">
                  <div className="border border-[#53d391]/40 bg-[#53d391]/10 p-2.5">
                    <span className="block text-[10px] text-[#53d391]">ASK / BUY</span>
                    <strong className="mt-0.5 block text-[13px] text-[#f0f0ec]">
                      {formatPrice(
                        effectiveBook?.asks[0]?.price ??
                          activeInstrument.ask ??
                          activeInstrument.price,
                        activeInstrument.decimals,
                      )}
                    </strong>
                  </div>
                  <div className="border border-[#f26d6d]/40 bg-[#f26d6d]/10 p-2.5">
                    <span className="block text-[10px] text-[#f26d6d]">BID / SELL</span>
                    <strong className="mt-0.5 block text-[13px] text-[#f0f0ec]">
                      {formatPrice(
                        effectiveBook?.bids[0]?.price ??
                          activeInstrument.bid ??
                          activeInstrument.price,
                        activeInstrument.decimals,
                      )}
                    </strong>
                  </div>
                </div>

                <div className="border-t border-[#25292e]">
                  {[
                    ['Last Price', formatPrice(activeInstrument.price, activeInstrument.decimals)],
                    ['24H Change', formatSignedPct(activeInstrument.changePct)],
                    ['Spread', spreadText],
                    ['Venue / Source', `${activeInstrument.venue} (${activeInstrument.source})`],
                  ].map(([k, v]) => (
                    <div
                      key={k}
                      className="flex justify-between gap-2 border-b border-[#25292e] px-3 py-1.5 text-[11px]"
                    >
                      <span className="font-condensed text-[#d8a06a] uppercase">{k}</span>
                      <span className="truncate text-[#f0f0ec]">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="border-t border-[#25292e] p-3 text-[10.5px] leading-relaxed text-[#939699]">
                ORCA Alpha in the Windows desktop app supports multi-tab charts, saved trendlines, and local paper order tickets.
              </p>
            </div>
          </div>
        </TabsContent>

        {/* F3 HEATMAP */}
        <TabsContent value="heatmap" className="m-0 bg-[#08090b] p-[8px_10px]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border border-[#34383e] bg-[#101215] px-3 py-2">
            <div className="flex flex-wrap items-center gap-1">
              {(['All', 'Crypto', 'Forex', 'Indices', 'Commodities', 'Bonds'] as const).map(
                (grp) => (
                  <button
                    key={grp}
                    type="button"
                    onClick={() => setHeatmapFilter(grp)}
                    className={cn(
                      'cursor-pointer border px-2 py-0.5 text-[10.5px]',
                      heatmapFilter === grp
                        ? 'border-[#ff9e32] bg-[#352719] text-[#ff9e32]'
                        : 'border-[#34383e] bg-[#1b1e22] text-[#c8c9c7] hover:text-[#f0f0ec]',
                    )}
                  >
                    {grp}
                  </button>
                ),
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[10px] text-[#939699]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 border border-[#8a2e34] bg-[#401519]" />
                Negative
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 border border-[#277a4d] bg-[#103824]" />
                Positive
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 border border-dashed border-[#34383e] bg-[#1b1e22]" />
                N/A (not 0.00%)
              </span>
            </div>
          </div>

          {visibleHeatmap.length === 0 ? (
            <div className="border border-[#34383e] bg-[#101215] px-4 py-10 text-center text-[#939699]">
              {snapshotLoading
                ? 'Loading cross-asset heatmap...'
                : 'No instruments in this heatmap category.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-[4px] sm:grid-cols-4 lg:grid-cols-6">
              {visibleHeatmap.map((tile) => {
                const isAvailable = tile.changePct !== null;
                return (
                  <Tooltip key={tile.symbol}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => handleHeatmapSelect(tile)}
                        className={cn(
                          'flex min-h-[78px] cursor-pointer flex-col justify-between border p-2.5 text-left transition-colors hover:brightness-110',
                          tile.span === 2 ? 'col-span-2' : 'col-span-1',
                          heatmapTileStyle(tile.changePct),
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="truncate text-[11px] font-semibold text-[#ff9e32]">
                            {tile.symbol}
                          </span>
                          <span className="text-[9.5px] text-[#939699] uppercase">
                            {tile.group}
                          </span>
                        </div>

                        <div className="mt-2 flex items-baseline justify-between gap-2">
                          <span className="text-[11px] text-[#c8c9c7]">
                            {formatPrice(tile.price, tile.decimals)}
                          </span>
                          <span
                            className={cn(
                              'text-[11px] font-bold',
                              !isAvailable
                                ? 'text-[#939699]'
                                : tile.changePct! >= 0
                                  ? 'text-[#53d391]'
                                  : 'text-[#f26d6d]',
                            )}
                          >
                            {!isAvailable ? 'N/A' : formatSignedPct(tile.changePct)}
                          </span>
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="font-mono text-[11px]">
                        <div className="font-semibold text-[#f0f0ec]">
                          {tile.symbol} · {tile.label}
                        </div>
                        <div className="text-[#c8c9c7]">
                          {tile.changePct === null
                            ? '24h snapshot unavailable — shown separately from 0.00%.'
                            : `24h change: ${formatSignedPct(tile.changePct)}`}
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* F4 MACRO MAPS */}
        <TabsContent value="macromaps" className="m-0 bg-[#08090b] p-[8px_10px]">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border border-[#34383e] bg-[#101215] px-3 py-2">
            <div className="flex items-center gap-2">
              <Globe2 className="h-3.5 w-3.5 text-[#ff9e32]" />
              <span className="font-condensed text-[12px] font-semibold tracking-wider text-[#f0f0ec] uppercase">
                {macroMap?.indicatorName || 'Global Macro Indicators'}
                {macroMap?.source ? ` · ${macroMap.source}` : ''}
                {macroMap?.period ? ` (${macroMap.period})` : ''}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {MACRO_INDICATORS.map((ind) => (
                <button
                  key={ind.id}
                  type="button"
                  onClick={() => setMacroIndicator(ind.id)}
                  className={cn(
                    'cursor-pointer border px-2 py-0.5 text-[10px]',
                    macroIndicator === ind.id
                      ? 'border-[#ff9e32] bg-[#352719] text-[#ff9e32]'
                      : 'border-[#34383e] bg-[#1b1e22] text-[#c8c9c7] hover:text-[#f0f0ec]',
                  )}
                >
                  {ind.label}
                </button>
              ))}
            </div>
          </div>

          {!macroMap || macroMap.countries.length === 0 ? (
            <div className="border border-[#34383e] bg-[#101215] px-4 py-10 text-center text-[#939699]">
              {calLoading
                ? 'Loading global macro data...'
                : calError || 'Macro map data unavailable.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-[4px] sm:grid-cols-2 lg:grid-cols-4">
              {macroMap.countries.map((c) => {
                const chg = c.change;
                return (
                  <div key={c.countryCode} className="border border-[#34383e] bg-[#101215] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] font-semibold text-[#f0f0ec]">
                        {c.flag ? `${c.flag} ` : ''}
                        {c.countryName}
                      </span>
                      <span className="shrink-0 border border-[#34383e] bg-[#1b1e22] px-1.5 py-[1px] text-[9px] font-semibold text-[#ff9e32]">
                        #{c.rank} · {c.countryCode}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-[#939699]">
                      {c.region} · Period {c.period}
                    </div>
                    <div className="mt-3 flex items-baseline justify-between border-t border-[#25292e] pt-2">
                      <strong className="text-[14px] font-semibold text-[#f0f0ec]">
                        {c.value.toFixed(2)}
                        {macroMap.unit}
                      </strong>
                      <span
                        className={cn(
                          'text-[10.5px]',
                          chg === null
                            ? 'text-[#939699]'
                            : chg >= 0
                              ? 'text-[#53d391]'
                              : 'text-[#f26d6d]',
                        )}
                      >
                        {chg === null
                          ? '—'
                          : `Δ ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}${macroMap.unit}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* F5 NEWS */}
        <TabsContent value="news" className="m-0 bg-[#08090b] p-[8px_10px]">
          <div className="grid grid-cols-1 gap-[4px] lg:grid-cols-12">
            <section className="border border-[#34383e] bg-[#101215] lg:col-span-7">
              <PanelHeader code="NEWS" right="LATEST FIRST">
                News Wire ({newsItems.length})
              </PanelHeader>
              <div>
                {newsItems.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[#939699]">
                    {newsLoading
                      ? 'Loading news wire...'
                      : newsError || 'No news available.'}
                  </div>
                ) : (
                  newsItems.map((item) => (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block border-b border-[#25292e] p-3 transition-colors last:border-b-0 hover:bg-[#1b1e22]"
                    >
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="font-condensed font-semibold text-[#ff9e32]">
                          {item.source}
                        </span>
                        <span className="text-[#939699]">
                          {formatRelativeDateTime(item.publishedAt)}
                        </span>
                      </div>
                      <h4 className="mt-1 font-condensed text-[15px] leading-tight font-semibold text-[#f0f0ec]">
                        {item.title}
                      </h4>
                      {item.summary && (
                        <p className="mt-1 text-[10.5px] text-[#c8c9c7]">{item.summary}</p>
                      )}
                    </a>
                  ))
                )}
              </div>
            </section>

            <section className="border border-[#34383e] bg-[#101215] lg:col-span-5">
              <PanelHeader code="FEED" right="MARKET SOCIAL WIRE">
                Market Conversation ({socialItems.length})
              </PanelHeader>
              <div>
                {socialItems.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[#939699]">
                    {newsLoading
                      ? 'Loading market social feed...'
                      : newsError || 'No social posts available.'}
                  </div>
                ) : (
                  socialItems.map((post) => (
                    <a
                      key={post.id}
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block border-b border-[#25292e] p-3 transition-colors last:border-b-0 hover:bg-[#1b1e22]"
                    >
                      <div className="flex items-baseline gap-2 text-[10px]">
                        <strong className="text-[#ff9e32]">{post.author}</strong>
                        <span className="text-[#939699]">{post.handle}</span>
                        <span className="ml-auto text-[#939699]">
                          {formatRelativeDateTime(post.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-[#c8c9c7]">
                        {post.text}
                      </p>
                    </a>
                  ))
                )}
              </div>
            </section>
          </div>
        </TabsContent>

        {/* F6 TRADES */}
        <TabsContent value="trades" className="m-0 bg-[#08090b] p-[8px_10px]">
          <div className="mb-1 flex items-center gap-2">
            <span className="bg-[#ff9e32] px-1.5 py-[1px] font-semibold text-[#08090b]">
              TRADES
            </span>
            <b className="font-condensed text-[13px] tracking-[0.06em] uppercase">Executions</b>
          </div>
          <section className="border border-[#34383e] bg-[#101215]">
            <PanelHeader code="FILLS">Execution log</PanelHeader>
            <div className="px-4 py-10 text-center text-[#939699]">
              No order execution history is connected in the web preview. In the Windows desktop app, F6 tracks account fills and execution logs separately from market ticks.
            </div>
          </section>
        </TabsContent>

        {/* F7 SYSTEM LOG */}
        <TabsContent value="log" className="m-0 bg-[#08090b] p-[8px_10px]">
          <div className="mb-1 flex items-center gap-2">
            <span className="bg-[#ff9e32] px-1.5 py-[1px] font-semibold text-[#08090b]">LOG</span>
            <b className="font-condensed text-[13px] tracking-[0.06em] uppercase">
              Connection status
            </b>
          </div>
          <section className="border border-[#34383e] bg-[#101215]">
            <PanelHeader code="STATUS">Live feed</PanelHeader>
            <div className="space-y-1 p-3 text-[11px] text-[#f0f0ec]">
              <div>
                WebSocket Gateway:{' '}
                <span className={wsConnected ? 'text-[#53d391]' : 'text-[#f26d6d]'}>
                  {wsConnected
                    ? 'Connected (Live Stream)'
                    : gatewayConfigured === false
                      ? 'Unconfigured (API key not set)'
                      : gatewayAuthError
                        ? 'Unauthorized (API key rejected upstream)'
                        : 'Disconnected'}
                </span>
              </div>
              <div>Messages: {wsMsgs.toLocaleString('en-US')}</div>
              <div>Last message: {lastMsgAt ? formatClockTime(lastMsgAt) : '—'}</div>
              <div>Error: {wsError || snapshotError || '—'}</div>
              <div>Catalog Instruments: {catalogCount} symbols</div>
              <div>Default Quote Stream: {defaultStreamCount} selected symbols</div>
              <div className="text-[#939699]">
                Internal server stream logs are not exposed to the browser · Desktop Target: v
                {RELEASE.version}-ENTERPRISE ({RELEASE.platform})
              </div>
            </div>
          </section>
        </TabsContent>

        {/* F8 VALIDATION */}
        <TabsContent value="valid" className="m-0 bg-[#08090b] p-[8px_10px]">
          <div className="mb-1 flex items-center gap-2">
            <span className="bg-[#ff9e32] px-1.5 py-[1px] font-semibold text-[#08090b]">
              VALID
            </span>
            <b className="font-condensed text-[13px] tracking-[0.06em] uppercase">
              Model validation
            </b>
          </div>
          <section className="border border-[#34383e] bg-[#101215]">
            <PanelHeader code="DATA">Calibration metrics</PanelHeader>
            <div className="px-4 py-10 text-center text-[#939699]">
              Calibration metrics are not connected in the web preview. Brier score, win rate, and model validation run during active evaluation sessions in the Windows desktop app.
            </div>
          </section>
        </TabsContent>
      </Tabs>

      {/* 5. Bottom Desktop Status Line */}
      <footer className="flex min-h-[24px] flex-wrap items-center gap-x-[16px] gap-y-1 border-t border-[#34383e] bg-[#15171a] px-[10px] py-[3px] text-[10.5px] text-[#939699]">
        <div className="flex items-center">
          <span
            className={cn(
              'mr-[5px] inline-block h-[7px] w-[7px]',
              wsConnected ? 'bg-[#53d391]' : gatewayConfigured === false ? 'bg-[#ff9e32]' : 'bg-[#f26d6d]',
            )}
          />
          WS GATEWAY:{' '}
          <b className="ml-1 font-medium text-[#c8c9c7]">
            {wsConnected
              ? 'CONNECTED'
              : gatewayConfigured === false
                ? 'UNCONFIGURED'
                : gatewayAuthError
                  ? 'UNAUTHORIZED'
                  : 'DISCONNECTED'}
          </b>
        </div>
        <div>
          MSGS: <b className="font-medium text-[#c8c9c7]">{wsMsgs.toLocaleString('en-US')}</b>
        </div>
        <div>
          LATENCY:{' '}
          <b className="font-medium text-[#c8c9c7]">
            {latencyMs !== null ? `${latencyMs} ms` : '—'}
          </b>
        </div>
        <div className="hidden sm:block">
          CATALOG: <b className="font-medium text-[#c8c9c7]">{catalogCount}</b> · STREAM:{' '}
          <b className="font-medium text-[#c8c9c7]">{defaultStreamCount}</b>
        </div>
        <div className="ml-auto">
          VERSION: <b className="font-medium text-[#c8c9c7]">v{RELEASE.version}-ENTERPRISE</b>
        </div>
      </footer>
    </div>
  );
}
