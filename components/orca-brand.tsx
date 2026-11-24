import Image from 'next/image';
import { cn } from '@/lib/utils';

interface OrcaBrandProps {
  size?: 'sm' | 'md';
  className?: string;
}

export function OrcaBrand({ size = 'md', className }: OrcaBrandProps) {
  const isSmall = size === 'sm';
  return (
    <span className={cn('inline-flex items-center select-none', isSmall ? 'gap-2.5' : 'gap-3', className)}>
      <Image
        src="/orca-mark.png"
        alt=""
        width={isSmall ? 34 : 42}
        height={isSmall ? 20 : 25}
        className="shrink-0 object-contain"
        priority={!isSmall}
      />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            'font-extrabold tracking-[0.14em] text-ivory uppercase',
            isSmall ? 'text-[17px]' : 'text-[21px]',
          )}
        >
          ORCA
        </span>
        <span
          className={cn(
            'font-condensed font-semibold tracking-[0.28em] text-ivory-muted uppercase',
            isSmall ? 'mt-0.5 text-[9px]' : 'mt-1 text-[10px]',
          )}
        >
          ENTERPRISE
        </span>
      </span>
    </span>
  );
}

export function OrcaEmblemCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-hairline-strong bg-[#050608] px-8 py-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <Image
          src="/orca-mark.png"
          alt="ORCA Enterprise logo"
          width={86}
          height={51}
          className="h-auto w-[74px] sm:w-[86px] object-contain"
        />
        <div className="flex flex-col leading-none">
          <span className="text-[34px] sm:text-[40px] font-extrabold tracking-[0.1em] text-ivory uppercase">
            ORCA
          </span>
          <span className="mt-1.5 font-condensed text-[13px] sm:text-[14px] font-semibold tracking-[0.34em] text-ivory-muted uppercase">
            ENTERPRISE
          </span>
        </div>
      </div>
      <div className="mt-6 flex items-center gap-2 border-t border-hairline pt-4 font-mono text-[11px] tracking-wider text-ivory-dim uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-orca" />
        <span>Desktop Terminal · Windows x64</span>
      </div>
    </div>
  );
}
