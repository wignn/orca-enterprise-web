import 'server-only';
import { PRIORITY_SYMBOLS, type OrderBookSnapshot, type StreamQuoteEvent } from '@/lib/market';
import { normalizeOrderBookPayload } from './market-data';
import { createPiaClient, positiveNum, publicPayload, record, text } from './pia';

type StreamListener = (event: 'status' | 'quote' | 'orderbook', data: unknown) => void;

interface RealtimeFeedStore {
  client: ReturnType<typeof createPiaClient> | null;
  connected: boolean;
  listeners: Set<StreamListener>;
  listenerFocus: Map<StreamListener, string | null>;
  subscribed: Set<string>;
  subscribedOrderbooks: Set<string>;
  latestQuotes: Map<string, StreamQuoteEvent>;
  latestBooks: Map<string, OrderBookSnapshot>;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

const FEED_KEY = Symbol.for('orca.website.realtimeFeed');
const MAX_LISTENERS = 128;
const MAX_SUBSCRIBED = 64;
const MAX_ORDERBOOKS = 12;
const IDLE_GRACE_MS = 15_000;

function isOrderBookCryptoSymbol(symbol: string): boolean {
  return /USDT(_SPOT|_PERP)?$/.test(symbol.trim().toUpperCase());
}

function getFeedStore(): RealtimeFeedStore {
  const g = globalThis as Record<symbol, RealtimeFeedStore | undefined>;
  if (!g[FEED_KEY]) {
    g[FEED_KEY] = {
      client: null,
      connected: false,
      listeners: new Set(),
      listenerFocus: new Map(),
      subscribed: new Set([
        ...PRIORITY_SYMBOLS,
        'DXY',
        'FH_SPX500',
        'XTIUSD',
        'US 500',
        'GERMANY 40',
        'JAPAN 225',
        'XAGUSD',
        'AUDUSD',
        'USDCAD',
        'USDCHF',
      ]),
      subscribedOrderbooks: new Set(),
      latestQuotes: new Map(),
      latestBooks: new Map(),
      disconnectTimer: null,
    };
  }
  return g[FEED_KEY];
}

function parseTsMs(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw < 1e12 ? Math.round(raw * 1000) : Math.round(raw);
  }
  if (typeof raw === 'string' && raw.trim()) {
    const ms = Date.parse(raw);
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return null;
}

function normalizeTick(raw: unknown): StreamQuoteEvent | null {
  if (!record(raw)) return null;
  const symbol = text(raw.symbol, 64).toUpperCase();
  const price = positiveNum(raw.price ?? raw.last);
  if (!symbol || price === null) return null;

  const receivedAtMs = Date.now();
  const timestampMs =
    parseTsMs(raw.trade_time_ms ?? raw.timestamp_ms ?? raw.timestamp ?? raw.received_at) ??
    receivedAtMs;

  const bid = positiveNum(raw.bid);
  const ask = positiveNum(raw.ask);
  const quantity = positiveNum(raw.quantity ?? raw.volume ?? raw.size);
  const isBuyerMaker =
    typeof raw.is_buyer_maker === 'boolean' ? raw.is_buyer_maker : null;
  const volumeAvailable =
    typeof raw.volume_available === 'boolean'
      ? raw.volume_available
      : quantity !== null;

  return publicPayload({
    symbol,
    price,
    bid,
    ask,
    quantity,
    isBuyerMaker,
    volumeAvailable,
    timestampMs,
    receivedAtMs,
  });
}

function broadcast(
  store: RealtimeFeedStore,
  event: 'status' | 'quote' | 'orderbook',
  data: unknown,
  onlySymbol?: string,
) {
  for (const listener of store.listeners) {
    if (onlySymbol && event === 'orderbook') {
      const focus = store.listenerFocus.get(listener);
      if (!focus || focus !== onlySymbol) continue;
    }
    try {
      listener(event, data);
    } catch {
      // Ignore closed subscriber callbacks
    }
  }
}

function ensureConnected(store: RealtimeFeedStore): void {
  if (store.disconnectTimer) {
    clearTimeout(store.disconnectTimer);
    store.disconnectTimer = null;
  }
  if (store.client) return;

  const client = createPiaClient();
  store.client = client;

  const handleQuote = (payload: unknown, isLiveTick: boolean) => {
    const q = normalizeTick(payload);
    if (!q) return;
    if (!isLiveTick && !store.subscribed.has(q.symbol)) return;

    const prev = store.latestQuotes.get(q.symbol);
    if (prev && prev.timestampMs > q.timestampMs + 500) return;

    if (!isLiveTick && prev) {
      const samePrice = prev.price === q.price && prev.bid === q.bid && prev.ask === q.ask;
      if (samePrice && q.timestampMs <= prev.timestampMs) {
        return;
      }
    }

    store.latestQuotes.set(q.symbol, q);
    broadcast(store, 'quote', q);
  };

  client.realtime.on('authenticated', () => {
    store.connected = true;
    broadcast(store, 'status', { connected: true });
  });

  client.realtime.on('tick', (payload: unknown) => handleQuote(payload, true));

  client.realtime.on('snapshot', (snapshot: unknown) => {
    if (record(snapshot) && Array.isArray(snapshot.items)) {
      for (const item of snapshot.items) handleQuote(item, false);
    }
  });

  client.realtime.on('raw', (payload: unknown) => {
    if (!record(payload)) return;

    if (payload.event === 'market.price' && payload.data) {
      const tick =
        record(payload.data) && record(payload.data.tick)
          ? payload.data.tick
          : payload.data;
      handleQuote(tick, true);
      return;
    }

    if (payload.event === 'orderbook.snapshot' && record(payload.data)) {
      const rawBook = record(payload.data.book) ? payload.data.book : payload.data;
      const sym =
        text(rawBook.symbol, 64).toUpperCase() ||
        text(payload.data.symbol, 64).toUpperCase();
      if (!sym) return;
      const book = normalizeOrderBookPayload(sym, rawBook);
      const prev = store.latestBooks.get(sym);
      if (
        prev?.isLive &&
        prev.sourceTimestampMs &&
        book.sourceTimestampMs &&
        book.sourceTimestampMs < prev.sourceTimestampMs
      ) {
        return;
      }
      store.latestBooks.set(sym, book);
      broadcast(store, 'orderbook', book, sym);
    }
  });

  const handleDown = () => {
    store.connected = false;
    broadcast(store, 'status', { connected: false });
  };

  client.realtime.on('disconnect', handleDown);
  client.realtime.on('error', () => {
    handleDown();
  });

  const initialChannels = Array.from(
    new Set([...store.subscribed, ...store.subscribedOrderbooks]),
  );
  if (initialChannels.length > 0) {
    client.realtime.subscribe(initialChannels);
  }
  client.realtime.connect();
}

export function subscribeRealtimeFeed(
  listener: StreamListener,
  focusSymbol?: string | null,
): () => void {
  const store = getFeedStore();
  if (store.listeners.size >= MAX_LISTENERS) {
    throw new Error('Stream capacity reached');
  }

  const clean = focusSymbol ? focusSymbol.trim().toUpperCase() : '';
  store.listeners.add(listener);
  store.listenerFocus.set(listener, clean || null);

  if (clean) {
    if (!store.subscribed.has(clean)) {
      if (store.subscribed.size >= MAX_SUBSCRIBED) {
        for (const candidate of store.subscribed) {
          if (!PRIORITY_SYMBOLS.includes(candidate as (typeof PRIORITY_SYMBOLS)[number])) {
            store.subscribed.delete(candidate);
            store.client?.realtime.unsubscribe([candidate]);
            break;
          }
        }
      }
      store.subscribed.add(clean);
      store.client?.realtime.subscribe([clean]);
    }

    if (isOrderBookCryptoSymbol(clean)) {
      const obChannel = `ORDERBOOK:${clean}`;
      if (!store.subscribedOrderbooks.has(obChannel)) {
        if (store.subscribedOrderbooks.size >= MAX_ORDERBOOKS) {
          const oldest = store.subscribedOrderbooks.values().next().value;
          if (oldest) {
            store.subscribedOrderbooks.delete(oldest);
            store.client?.realtime.unsubscribe([oldest]);
          }
        }
        store.subscribedOrderbooks.add(obChannel);
        store.client?.realtime.subscribe([obChannel]);
      }
    }
  }

  try {
    ensureConnected(store);
  } catch (err) {
    store.listeners.delete(listener);
    store.listenerFocus.delete(listener);
    if (clean && isOrderBookCryptoSymbol(clean)) {
      const obChannel = `ORDERBOOK:${clean}`;
      const stillWatched = Array.from(store.listenerFocus.values()).some((f) => f === clean);
      if (!stillWatched && store.subscribedOrderbooks.has(obChannel)) {
        store.subscribedOrderbooks.delete(obChannel);
        store.client?.realtime.unsubscribe([obChannel]);
      }
    }
    throw err;
  }

  listener('status', { connected: store.connected });
  const now = Date.now();
  for (const quote of store.latestQuotes.values()) {
    if (now - quote.receivedAtMs <= 30_000) {
      listener('quote', quote);
    }
  }
  if (clean) {
    const cachedBook = store.latestBooks.get(clean);
    if (cachedBook && cachedBook.isLive && now - (cachedBook.receivedAtMs ?? 0) <= 10_000) {
      listener('orderbook', cachedBook);
    }
  }

  return () => {
    store.listeners.delete(listener);
    store.listenerFocus.delete(listener);

    if (clean && isOrderBookCryptoSymbol(clean)) {
      const obChannel = `ORDERBOOK:${clean}`;
      const stillWatched = Array.from(store.listenerFocus.values()).some((f) => f === clean);
      if (!stillWatched && store.subscribedOrderbooks.has(obChannel)) {
        store.subscribedOrderbooks.delete(obChannel);
        store.client?.realtime.unsubscribe([obChannel]);
      }
    }

    if (store.listeners.size === 0 && !store.disconnectTimer) {
      store.disconnectTimer = setTimeout(() => {
        store.disconnectTimer = null;
        if (store.listeners.size === 0 && store.client) {
          const prev = store.client;
          store.client = null;
          store.connected = false;
          store.latestQuotes.clear();
          store.latestBooks.clear();
          store.subscribedOrderbooks.clear();
          try {
            prev.realtime.disconnect();
          } catch {
            // Ignore teardown errors
          }
        }
      }, IDLE_GRACE_MS);
    }
  };
}
