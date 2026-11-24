import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { RELEASE } from '@/lib/release';

const FAQ_ITEMS = [
  {
    q: 'Which operating systems are supported?',
    a: 'This installer is built for 64-bit Windows 10 and Windows 11 (x64). macOS, Linux, and Windows ARM packages are not offered here.',
  },
  {
    q: 'How do I install and sign in?',
    a: `Download ${RELEASE.installerName}, run the Windows installer, and launch ORCA Enterprise from the Start Menu or desktop shortcut. Sign in with your Enterprise credentials to access live market feeds.`,
  },
  {
    q: 'Do all 830 catalog symbols stream live quotes continuously?',
    a: `No. The catalog holds ${RELEASE.catalogCount} instruments for symbol lookup and candle history, while default live quote subscriptions focus on ${RELEASE.defaultStreamCount} priority symbols. Markets outside active trading hours hold their last quote until the next session opens.`,
  },
  {
    q: 'How can I verify the installer checksum before running it?',
    a: 'Open Build & SHA-256 on this page to copy the official SHA-256 digest, then compare it against the output of Get-FileHash in PowerShell on your downloaded .exe file.',
  },
];

const SYSTEM_SPECS = [
  ['Operating System', 'Windows 10 / 11 (64-bit x64)'],
  ['Package Format', 'NSIS Setup Executable (.exe)'],
  ['Build Version', `v${RELEASE.version} Enterprise`],
  ['Download Size', RELEASE.sizeLabel],
  ['Connectivity', 'HTTPS & WebSocket (WSS)'],
  ['Minimum Resolution', '1080 × 680 px (1440+ recommended)'],
];

export function FaqSection() {
  return (
    <section
      id="faq"
      className="mx-auto max-w-7xl scroll-mt-16 border-t border-hairline px-5 py-20 sm:px-8 sm:py-24"
    >
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <span className="font-mono text-xs tracking-widest text-amber-orca uppercase">
            FAQ & Specs
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-ivory">
            Common questions and system requirements
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ivory-muted">
            Basic details on setup, Windows x64 support, and how market data feeds behave.
          </p>

          <dl className="mt-8 divide-y divide-hairline rounded-xl border border-hairline bg-obsidian">
            {SYSTEM_SPECS.map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 px-4 py-3 text-xs"
              >
                <dt className="text-ivory-dim">{label}</dt>
                <dd className="text-right font-mono text-ivory">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="lg:col-span-7">
          <Accordion type="single" collapsible>
            {FAQ_ITEMS.map((item, idx) => (
              <AccordionItem key={item.q} value={`item-${idx}`}>
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent>{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
