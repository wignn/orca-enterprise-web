import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide uppercase',
  {
    variants: {
      variant: {
        default: 'border-hairline-strong bg-elevated/80 text-ivory-muted',
        amber: 'border-amber-orca/35 bg-amber-orca/10 text-amber-orca',
        up: 'border-up/30 bg-up/10 text-up',
        down: 'border-down/30 bg-down/10 text-down',
        kbd: 'border-hairline-strong bg-[#13171f] text-ivory shadow-[inset_0_-1px_0_rgba(0,0,0,0.6)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
