import { getNewsAndSocialData } from '@/lib/server/market-data';
import { isPiaConfigured, piaErrorResponse } from '@/lib/server/pia';

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
  try {
    const data = await getNewsAndSocialData(request.signal);
    return Response.json(data, { headers: NO_STORE });
  } catch (err) {
    return piaErrorResponse(err, 'Failed to load news wire and social feed.');
  }
}
