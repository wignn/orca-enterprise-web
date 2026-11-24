import { getOrderBookData } from '@/lib/server/market-data';
import { isPiaConfigured, piaErrorResponse, sanitizeSymbolParam } from '@/lib/server/pia';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  if (!isPiaConfigured()) {
    return Response.json(
      { configured: false, error: 'Market gateway is not configured on the server.' },
      { status: 503, headers: NO_STORE },
    );
  }

  const url = new URL(request.url);
  const symbol = sanitizeSymbolParam(url.searchParams.get('symbol'));
  if (!symbol) {
    return Response.json(
      { error: 'Invalid symbol parameter.' },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const data = await getOrderBookData(symbol, request.signal);
    return Response.json(data, { headers: NO_STORE });
  } catch (err) {
    return piaErrorResponse(err, 'Failed to load order book.');
  }
}
