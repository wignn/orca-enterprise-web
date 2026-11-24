import { isPiaConfigured, sanitizeSymbolParam } from '@/lib/server/pia';
import { subscribeRealtimeFeed } from '@/lib/server/realtime-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return new Response(null, { status: 403 });
  }

  if (!isPiaConfigured()) {
    return Response.json(
      { configured: false, error: 'Market gateway is not configured on the server.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const url = new URL(request.url);
  const focusSymbol = sanitizeSymbolParam(url.searchParams.get('symbol'));

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe = () => {};
      let heartbeat: ReturnType<typeof setInterval>;
      let lifetime: ReturnType<typeof setTimeout>;

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(lifetime);
        request.signal.removeEventListener('abort', cleanup);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      };

      const send = (event: string, data: unknown) => {
        if (!closed) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        }
      };

      request.signal.addEventListener('abort', cleanup, { once: true });
      if (request.signal.aborted) {
        cleanup();
        return;
      }

      try {
        unsubscribe = subscribeRealtimeFeed(send, focusSymbol);
        heartbeat = setInterval(() => {
          if (!closed) {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          }
        }, 15_000);
        lifetime = setTimeout(cleanup, 5 * 60_000);
      } catch {
        send('status', { connected: false });
        cleanup();
      }
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
