import { MACRO_INDICATORS } from '@/lib/market';
import { getCalendarAndMacroData } from '@/lib/server/market-data';
import { isPiaConfigured, piaErrorResponse } from '@/lib/server/pia';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const ALLOWED_INDICATORS = new Set<string>(MACRO_INDICATORS.map((m) => m.id));

export async function GET(request: Request) {
  if (!isPiaConfigured()) {
    return Response.json(
      { configured: false, error: 'Market gateway is not configured on the server.' },
      { status: 503, headers: NO_STORE },
    );
  }

  const url = new URL(request.url);
  const rawIndicator = (url.searchParams.get('indicator') ?? 'inflation').trim().toLowerCase();
  const indicator = ALLOWED_INDICATORS.has(rawIndicator) ? rawIndicator : 'inflation';

  try {
    const data = await getCalendarAndMacroData(indicator, request.signal);
    return Response.json(data, { headers: NO_STORE });
  } catch (err) {
    return piaErrorResponse(err, 'Failed to load economic calendar and macro map.');
  }
}
