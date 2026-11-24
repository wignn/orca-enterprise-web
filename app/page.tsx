import { ArrowDownRight, Download, Monitor } from 'lucide-react';
import { RELEASE } from '@/lib/release';
import { BuildVerifyDialog } from '@/components/build-verify-dialog';
import { FaqSection } from '@/components/faq-section';
import { OrcaBrand, OrcaEmblemCard } from '@/components/orca-brand';
import { TerminalShowcase } from '@/components/terminal-showcase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WorkspaceBento } from '@/components/workspace-bento';

export default function HomePage() {
  return (
    <div id="top" className="min-h-screen bg-void text-ivory">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-40 border-b border-hairline bg-void/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <a
            href="#top"
            aria-label="ORCA Enterprise — back to top"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-orca/70 rounded"
          >
            <OrcaBrand size="sm" />
          </a>

          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-7 text-sm text-ivory-muted md:flex"
          >
            <a href="#terminal" className="transition-colors hover:text-ivory">
              Terminal
            </a>
            <a href="#features" className="transition-colors hover:text-ivory">
              Features
            </a>
            <a href="#download" className="transition-colors hover:text-ivory">
              Download
            </a>
            <a href="#faq" className="transition-colors hover:text-ivory">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <Badge variant="default" className="hidden sm:inline-flex">
              v{RELEASE.version} · {RELEASE.arch}
            </Badge>
            <Button asChild variant="primary" size="sm">
              <a href={RELEASE.downloadPath}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Download .exe
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero + Interactive Desktop Terminal Showcase */}
        <section className="relative overflow-hidden border-b border-hairline pb-16 pt-10 sm:pb-24 sm:pt-14">
          <div
            aria-hidden="true"
            className="orca-grid-backdrop pointer-events-none absolute inset-0"
          />

          <div className="relative mx-auto max-w-[1400px] px-4 sm:px-6">
            <div className="mx-auto max-w-4xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-hairline-strong bg-obsidian px-3.5 py-1.5 font-mono text-[11px] text-ivory-muted">
                <Monitor className="h-3.5 w-3.5 text-amber-orca" aria-hidden="true" />
                <span>WINDOWS DESKTOP APP</span>
                <span className="h-1 w-1 rounded-full bg-hairline-strong" />
                <span className="text-ivory">VERSION {RELEASE.version}</span>
              </div>

              <h1 className="mt-5 text-4xl font-extrabold tracking-[-0.025em] text-ivory sm:text-[54px] sm:leading-[1.06]">
                Cross-asset market terminal for Windows.
              </h1>

              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-ivory-muted sm:text-lg">
                Track live quotes, charts, order book depth, and macro data side by side in a single desktop window.
              </p>

              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <Button asChild variant="primary" size="lg">
                  <a href={RELEASE.downloadPath}>
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download for Windows
                  </a>
                </Button>
                <BuildVerifyDialog />
              </div>

              <p className="mt-3.5 font-mono text-xs text-ivory-dim">
                {RELEASE.installerName} · {RELEASE.sizeLabel} · {RELEASE.platform}
              </p>
            </div>

            <div id="terminal" className="mt-10 scroll-mt-20 sm:mt-12">
              <TerminalShowcase />
            </div>
          </div>
        </section>

        {/* Architecture & Capabilities Bento */}
        <WorkspaceBento />

        {/* Download & Official Brand Emblem Section */}
        <section
          id="download"
          className="scroll-mt-16 border-t border-hairline bg-[#080a0d] py-20 sm:py-24"
        >
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-5 sm:px-8 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <OrcaEmblemCard />
            </div>

            <div className="lg:col-span-7">
              <span className="font-mono text-xs tracking-widest text-amber-orca uppercase">
                Production Release v{RELEASE.version}
              </span>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-ivory sm:text-4xl">
                Install ORCA Enterprise on Windows.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-ivory-muted sm:text-base">
                The x64 installer includes the desktop app and local market data worker. Sign in with your Enterprise account after setup to start streaming live feeds.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-3 rounded-xl border border-hairline bg-void p-4 font-mono text-xs sm:grid-cols-3">
                <div>
                  <span className="block text-[10px] text-ivory-dim uppercase">
                    Installer File
                  </span>
                  <strong className="mt-1 block truncate text-ivory">
                    {RELEASE.installerName}
                  </strong>
                </div>
                <div>
                  <span className="block text-[10px] text-ivory-dim uppercase">
                    Size / Target
                  </span>
                  <strong className="mt-1 block text-ivory tabular-nums">
                    {RELEASE.sizeLabel} · Win x64
                  </strong>
                </div>
                <div>
                  <span className="block text-[10px] text-ivory-dim uppercase">
                    SHA-256 Prefix
                  </span>
                  <strong className="mt-1 block truncate text-amber-orca">
                    {RELEASE.sha256.slice(0, 16)}…
                  </strong>
                </div>
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button asChild variant="amber" size="lg">
                  <a href={RELEASE.downloadPath}>
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download Installer (.exe)
                  </a>
                </Button>
                <BuildVerifyDialog
                  triggerLabel="Copy SHA-256 Checksum"
                  triggerVariant="outline"
                  triggerSize="lg"
                />
              </div>
            </div>
          </div>
        </section>

        {/* System Specs & FAQ Accordion */}
        <FaqSection />
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-hairline bg-void">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-5 py-8 sm:flex-row sm:items-center sm:px-8">
          <a
            href="#top"
            aria-label="Back to top"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-orca/70 rounded"
          >
            <OrcaBrand size="sm" />
          </a>

          <div className="flex flex-wrap items-center gap-5 font-mono text-xs text-ivory-dim">
            <span>Desktop Market Terminal · v{RELEASE.version}</span>
            <a
              href={RELEASE.downloadPath}
              className="inline-flex items-center gap-1 text-ivory-muted transition-colors hover:text-ivory"
            >
              Download Windows x64
              <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
