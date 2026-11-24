import {
  CandlestickChart,
  Database,
  Grid2X2,
  Layers3,
} from 'lucide-react';
import { RELEASE } from '@/lib/release';
import { Badge } from '@/components/ui/badge';

const WORKSPACE_KEYS = [
  { key: 'F1', label: 'MONITOR' },
  { key: 'F2', label: 'ORCA ALPHA' },
  { key: 'F3', label: 'HEATMAP' },
  { key: 'F4', label: 'MACRO MAPS' },
  { key: 'F5', label: 'NEWS' },
  { key: 'F6', label: 'TRADES' },
  { key: 'F7', label: 'SYSTEM LOG' },
  { key: 'F8', label: 'VALIDATION' },
];

const CAPABILITIES = [
  {
    code: 'F1 · MONITOR',
    icon: CandlestickChart,
    title: 'Multi-panel market screen',
    description:
      'Watchlist, benchmark strip, candlestick chart, order book depth, and news wire in one fixed layout.',
    meta: 'Mon · Wei · Chart · Book · News',
  },
  {
    code: 'F2 · ORCA ALPHA',
    icon: Layers3,
    title: 'Focused chart workspace',
    description:
      'Multi-tab charting with drawing tools, EMA overlays, quick symbol search, and local paper order shortcuts.',
    meta: 'Shift+B / Shift+S / Shift+X',
  },
  {
    code: 'F3 · HEATMAP',
    icon: Grid2X2,
    title: 'Cross-asset heatmap',
    description:
      'Scan 24-hour moves across FX, indices, metals, commodities, bonds, and crypto. Missing snapshots show N/A instead of 0%.',
    meta: 'Squarified & Spiral Layout',
  },
  {
    code: '830 SYMBOLS · 154 STREAMS',
    icon: Database,
    title: 'Full symbol catalog with curated streams',
    description: `Browse ${RELEASE.catalogCount} instruments and candle history, with ${RELEASE.defaultStreamCount} priority symbols streaming live by default.`,
    meta: 'Windows x64 Native App',
  },
];

export function WorkspaceBento() {
  return (
    <section id="features" className="mx-auto max-w-7xl scroll-mt-16 px-5 py-20 sm:px-8 sm:py-24">
      <div className="flex flex-col justify-between gap-6 border-b border-hairline pb-10 lg:flex-row lg:items-end">
        <div className="max-w-2xl">
          <span className="font-mono text-xs tracking-widest text-amber-orca uppercase">
            Workspace
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-ivory sm:text-4xl">
            Eight market views in one desktop window.
          </h2>
        </div>
        <p className="max-w-md text-sm leading-relaxed text-ivory-muted">
          Switch between views with F1 through F8 without reloading browser tabs.
        </p>
      </div>

      {/* F1-F8 Command Strip */}
      <div className="mt-8 flex flex-wrap gap-2">
        {WORKSPACE_KEYS.map((item, idx) => (
          <div
            key={item.key}
            className="inline-flex items-center gap-2 rounded-md border border-hairline bg-obsidian px-3 py-1.5 font-mono text-xs"
          >
            <Badge variant={idx < 4 ? 'amber' : 'kbd'} className="px-1.5 py-0 text-[10px]">
              {item.key}
            </Badge>
            <span className="text-ivory-muted">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Asymmetric 2x2 Architectural Grid */}
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        {CAPABILITIES.map(({ code, icon: Icon, title, description, meta }) => (
          <article
            key={code}
            className="group flex flex-col justify-between rounded-xl border border-hairline bg-obsidian p-6 transition-colors hover:border-hairline-strong hover:bg-[#0d1015] sm:p-7"
          >
            <div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[11px] font-semibold tracking-wider text-amber-orca uppercase">
                  {code}
                </span>
                <span className="grid h-9 w-9 place-items-center rounded-lg border border-hairline bg-void text-ivory-muted transition-colors group-hover:border-hairline-strong group-hover:text-ivory">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-tight text-ivory">
                {title}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-ivory-muted">
                {description}
              </p>
            </div>

            <div className="mt-6 border-t border-hairline pt-4 font-mono text-[11px] text-ivory-dim">
              {meta}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
