'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { computeEma, formatPrice, type OhlcBar } from '@/lib/market';

interface OrcaChartProps {
  symbol: string;
  decimals: number;
  bars: OhlcBar[];
  loading: boolean;
  error: string | null;
  showEma20: boolean;
  showEma50: boolean;
  heightClass?: string;
}

export function OrcaChart({
  symbol,
  decimals = 2,
  bars = [],
  loading = false,
  error = null,
  showEma20,
  showEma50,
  heightClass = 'h-[280px] sm:h-[325px] lg:h-full lg:min-h-[340px]',
}: OrcaChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<OhlcBar | null>(null);
  const byTimeRef = useRef<Map<number, OhlcBar>>(new Map());
  const prevSeriesRef = useRef<{
    symbol: string;
    decimals: number;
    firstTime: number | null;
    lastTime: number | null;
    length: number;
  }>({
    symbol: '',
    decimals: 2,
    firstTime: null,
    lastTime: null,
    length: 0,
  });

  const chartRef = useRef<{
    chart: IChartApi;
    candles: ISeriesApi<'Candlestick'>;
    ema20: ISeriesApi<'Line'>;
    ema50: ISeriesApi<'Line'>;
    volume: ISeriesApi<'Histogram'>;
  } | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const initialW = Math.max(el.clientWidth, 300);
    const initialH = Math.max(el.clientHeight, 260);

    const chart = createChart(el, {
      width: initialW,
      height: initialH,
      layout: {
        background: { type: ColorType.Solid, color: '#101215' },
        textColor: '#939699',
        fontFamily: 'JetBrains Mono, Consolas, monospace',
        fontSize: 10.5,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#25292e' },
        horzLines: { color: '#25292e' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#939699',
          labelBackgroundColor: '#1b1e22',
        },
        horzLine: {
          color: '#939699',
          labelBackgroundColor: '#1b1e22',
        },
      },
      rightPriceScale: {
        borderColor: '#34383e',
        scaleMargins: { top: 0.09, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#34383e',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
      },
      handleScale: {
        mouseWheel: false,
        pinch: true,
      },
    });

    const candles = chart.addCandlestickSeries({
      upColor: '#53d391',
      downColor: '#f26d6d',
      borderVisible: false,
      wickUpColor: '#53d391',
      wickDownColor: '#f26d6d',
      priceLineVisible: true,
      priceLineColor: '#ff9e32',
      priceLineStyle: LineStyle.Dotted,
      lastValueVisible: true,
    });

    const ema20 = chart.addLineSeries({
      color: '#ff9e32',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const ema50 = chart.addLineSeries({
      color: '#77aef5',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const volume = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
      lastValueVisible: false,
      priceLineVisible: false,
    });

    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.84, bottom: 0 },
    });

    const onCrosshair = (param: { time?: unknown }) => {
      if (typeof param.time === 'number') {
        setHovered(byTimeRef.current.get(param.time) ?? null);
      } else {
        setHovered(null);
      }
    };
    chart.subscribeCrosshairMove(onCrosshair);

    chartRef.current = { chart, candles, ema20, ema50, volume };

    const observer = new ResizeObserver(() => {
      const nextW = el.clientWidth;
      const nextH = el.clientHeight;
      if (nextW > 0 && nextH > 0) {
        chart.resize(nextW, nextH, true);
      }
    });
    observer.observe(el);

    return () => {
      chart.unsubscribeCrosshairMove(onCrosshair);
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      byTimeRef.current.clear();
      prevSeriesRef.current = {
        symbol: '',
        decimals: 2,
        firstTime: null,
        lastTime: null,
        length: 0,
      };
    };
  }, []);

  useEffect(() => {
    setHovered(null);
  }, [symbol]);

  useEffect(() => {
    const api = chartRef.current;
    if (!api) return;

    const displayDecimals = Math.min(Math.max(decimals, 0), 5);
    const minMove = 1 / 10 ** displayDecimals;
    const priceFormat = {
      type: 'price' as const,
      precision: displayDecimals,
      minMove,
    };

    api.candles.applyOptions({ priceFormat });
    api.ema20.applyOptions({ priceFormat });
    api.ema50.applyOptions({ priceFormat });

    byTimeRef.current = new Map(bars.map((b) => [b.time, b]));

    if (bars.length === 0) {
      api.candles.setData([]);
      api.volume.setData([]);
      api.ema20.setData([]);
      api.ema50.setData([]);
      prevSeriesRef.current = {
        symbol,
        decimals,
        firstTime: null,
        lastTime: null,
        length: 0,
      };
      return;
    }

    const prev = prevSeriesRef.current;
    const firstTime = bars[0].time;
    const lastBar = bars[bars.length - 1];
    const isIncremental =
      prev.symbol === symbol &&
      prev.decimals === decimals &&
      prev.firstTime === firstTime &&
      prev.lastTime !== null &&
      (bars.length === prev.length || bars.length === prev.length + 1) &&
      lastBar.time >= prev.lastTime;

    if (isIncremental) {
      api.candles.update({
        time: lastBar.time as UTCTimestamp,
        open: lastBar.open,
        high: lastBar.high,
        low: lastBar.low,
        close: lastBar.close,
      });
      api.volume.update({
        time: lastBar.time as UTCTimestamp,
        value: lastBar.volume,
        color:
          lastBar.close >= lastBar.open
            ? 'rgba(83, 211, 145, 0.35)'
            : 'rgba(242, 109, 109, 0.35)',
      });
    } else {
      api.candles.setData(
        bars.map((b) => ({
          time: b.time as UTCTimestamp,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        })),
      );
      api.volume.setData(
        bars.map((b) => ({
          time: b.time as UTCTimestamp,
          value: b.volume,
          color:
            b.close >= b.open
              ? 'rgba(83, 211, 145, 0.35)'
              : 'rgba(242, 109, 109, 0.35)',
        })),
      );
      api.chart.timeScale().fitContent();
    }

    api.ema20.setData(
      showEma20
        ? computeEma(bars, 20).map((p) => ({
            time: p.time as UTCTimestamp,
            value: p.value,
          }))
        : [],
    );

    api.ema50.setData(
      showEma50
        ? computeEma(bars, 50).map((p) => ({
            time: p.time as UTCTimestamp,
            value: p.value,
          }))
        : [],
    );

    prevSeriesRef.current = {
      symbol,
      decimals,
      firstTime,
      lastTime: lastBar.time,
      length: bars.length,
    };
  }, [bars, decimals, showEma20, showEma50, symbol]);

  const activeBar = hovered ?? bars[bars.length - 1] ?? null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[#101215]">
      <div className="pointer-events-none absolute top-1 right-16 left-2 z-10 flex flex-wrap items-center gap-x-2 font-mono text-[10px] text-[#c8c9c7] tabular-nums sm:right-20 sm:text-[10.5px]">
        <span>
          <b className="font-medium text-[#d8a06a]">O</b>{' '}
          {activeBar ? formatPrice(activeBar.open, decimals) : '—'}
        </span>
        <span>
          <b className="font-medium text-[#d8a06a]">H</b>{' '}
          {activeBar ? formatPrice(activeBar.high, decimals) : '—'}
        </span>
        <span>
          <b className="font-medium text-[#d8a06a]">L</b>{' '}
          {activeBar ? formatPrice(activeBar.low, decimals) : '—'}
        </span>
        <span>
          <b className="font-medium text-[#d8a06a]">C</b>{' '}
          {activeBar ? formatPrice(activeBar.close, decimals) : '—'}
        </span>
        <span>
          <b className="font-medium text-[#d8a06a]">V</b>{' '}
          {activeBar ? activeBar.volume.toLocaleString('en-US') : '—'}
        </span>
      </div>

      <div
        ref={hostRef}
        className={`w-full flex-1 ${heightClass}`}
        aria-label={`${symbol} candlestick chart`}
      />

      {bars.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#101215]/75 px-4 text-center">
          <div className="max-w-sm border border-[#34383e] bg-[#15171a] px-3 py-2 font-mono text-[11px] text-[#c8c9c7]">
            {loading
              ? `Loading ${symbol} candles...`
              : error || `No candle history available for ${symbol}.`}
          </div>
        </div>
      )}
    </div>
  );
}
