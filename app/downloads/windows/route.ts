import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';

export const runtime = 'nodejs';
const filename = 'ORCA Enterprise_1.0.1_x64-setup.exe';

async function send(head: boolean) {
  const hosted = process.env.ORCA_WINDOWS_DOWNLOAD_URL;
  if (hosted) {
    try {
      const url = new URL(hosted);
      if (url.protocol === 'https:') return Response.redirect(url, 307);
    } catch { /* A misconfigured URL falls back to the local installer. */ }
  }
  const path = join(process.cwd(), 'public', 'downloads', filename);
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) return new Response(head ? null : 'Installer not available yet. Return to the main page and try again later.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  return new Response(head ? null : Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>, {
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(info.size), 'Content-Disposition': `attachment; filename="${filename}"`, 'X-Content-Type-Options': 'nosniff' },
  });
}

export function GET() { return send(false); }
export function HEAD() { return send(true); }
