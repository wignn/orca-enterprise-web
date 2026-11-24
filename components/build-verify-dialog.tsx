'use client';

import { useState } from 'react';
import { Check, Copy, Download, ShieldCheck, Terminal } from 'lucide-react';
import { RELEASE } from '@/lib/release';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface BuildVerifyDialogProps {
  triggerLabel?: string;
  triggerVariant?: 'outline' | 'ghost';
  triggerSize?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function BuildVerifyDialog({
  triggerLabel = 'Build & SHA-256',
  triggerVariant = 'outline',
  triggerSize = 'lg',
  className,
}: BuildVerifyDialogProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(RELEASE.sha256);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize} className={className}>
          <ShieldCheck className="h-4 w-4 text-amber-orca" aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verify Windows Installer</DialogTitle>
          <DialogDescription>
            Check the SHA-256 digest before running the installer on Windows x64.
          </DialogDescription>
        </DialogHeader>

        <dl className="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-hairline bg-void p-4 font-mono text-xs">
          <div>
            <dt className="text-ivory-dim uppercase">Product</dt>
            <dd className="mt-1 text-ivory">{RELEASE.productName}</dd>
          </div>
          <div>
            <dt className="text-ivory-dim uppercase">Release</dt>
            <dd className="mt-1 text-amber-orca">v{RELEASE.version}</dd>
          </div>
          <div>
            <dt className="text-ivory-dim uppercase">Platform</dt>
            <dd className="mt-1 text-ivory">{RELEASE.platform}</dd>
          </div>
          <div>
            <dt className="text-ivory-dim uppercase">Installer Size</dt>
            <dd className="mt-1 text-ivory tabular-nums">
              {RELEASE.sizeLabel} ({RELEASE.sizeBytes.toLocaleString('en-US')} B)
            </dd>
          </div>
        </dl>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-ivory-muted">
              SHA-256 Digest
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded border border-hairline-strong bg-elevated px-2.5 py-1 font-mono text-[11px] text-ivory transition-colors hover:border-amber-orca/50 hover:text-amber-orca cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-up" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy Hash
                </>
              )}
            </button>
          </div>
          <code className="block break-all rounded-lg border border-hairline bg-void p-3 font-mono text-xs text-ivory-muted select-all">
            {RELEASE.sha256}
          </code>
        </div>

        <div className="mt-4 rounded-lg border border-hairline bg-void p-3">
          <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-ivory-dim">
            <Terminal className="h-3.5 w-3.5 text-amber-orca" />
            <span>Verify in PowerShell</span>
          </div>
          <code className="block whitespace-pre-wrap break-all font-mono text-[11px] text-ivory-muted">
            Get-FileHash &quot;.\{RELEASE.installerName}&quot; -Algorithm SHA256
          </code>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <Button asChild variant="primary" size="md">
            <a href={RELEASE.downloadPath}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Download {RELEASE.installerName}
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
