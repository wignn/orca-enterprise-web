import 'server-only';
import { AuthenticationError, PermissionError, PiaClient } from '@piaa/sdk';

const DEFAULT_BASE_URL = 'https://api-engine.wign.dev';
const DEFAULT_WS_URL = 'wss://api-engine.wign.dev/api/v1/ws';

const SENSITIVE_KEY_RE =
  /^(api[_-]?key|apikey|token|access_token|refresh_token|authorization|password|secret|desktop_credential|x-api-key)$/i;

export function isPiaConfigured(): boolean {
  return Boolean(process.env.PIA_API_KEY?.trim());
}

export function resolvePiaEndpoints(): { baseUrl: string; wsUrl: string } {
  const rawBase = process.env.PIA_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const rawWs = process.env.PIA_WS_URL?.trim() || DEFAULT_WS_URL;

  const baseUrl = new URL(rawBase);
  if (baseUrl.protocol !== 'https:') {
    throw new Error('Invalid PIA base URL protocol');
  }
  const wsUrl = new URL(rawWs);
  if (wsUrl.protocol !== 'wss:') {
    throw new Error('Invalid PIA WS URL protocol');
  }
  return { baseUrl: baseUrl.toString().replace(/\/$/, ''), wsUrl: wsUrl.toString() };
}

export function createPiaClient(): PiaClient {
  const apiKey = process.env.PIA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('PIA_UNCONFIGURED');
  }
  const { baseUrl, wsUrl } = resolvePiaEndpoints();
  return new PiaClient({
    apiKey,
    baseUrl,
    wsUrl,
    timeoutMs: 10000,
    maxRetries: 0,
    logLevel: 'silent',
  });
}

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function text(value: unknown, maxLen = 300): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLen) : '';
}

export function finiteNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function positiveNum(value: unknown): number | null {
  const n = finiteNum(value);
  return n !== null && n > 0 ? n : null;
}

export function sanitizeSymbolParam(raw: string | null): string | null {
  if (!raw) return null;
  const clean = raw.trim().toUpperCase();
  if (!clean || clean.length > 64) return null;
  if (!/^[A-Z0-9._+\-/ ]+$/.test(clean)) return null;
  return clean;
}

export async function fetchPiaJson(
  endpoint: string,
  signal?: AbortSignal,
  options?: { allowOrderBookUnsupported?: boolean },
): Promise<unknown> {
  const apiKey = process.env.PIA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('PIA_UNCONFIGURED');
  }
  const { baseUrl } = resolvePiaEndpoints();
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const reqSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(8_000)])
    : AbortSignal.timeout(8_000);

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'x-api-key': apiKey,
      Accept: 'application/json',
      'User-Agent': 'orca-enterprise-web/1.0',
    },
    cache: 'no-store',
    signal: reqSignal,
  });

  if (options?.allowOrderBookUnsupported && res.status === 404) {
    const body = await res.json().catch(() => null);
    if (record(body) && body.code === 'ORDER_BOOK_NOT_SUPPORTED') {
      return {
        depth_type: 'unavailable',
        is_live: false,
        synthetic: false,
        unavailable_reason:
          text(body.message, 180) || 'Order book is not available for this instrument.',
      };
    }
  }

  if (!res.ok) {
    const err = new Error(`PIA upstream returned HTTP ${res.status}`) as Error & {
      statusCode?: number;
    };
    err.statusCode = res.status;
    throw err;
  }

  return res.json();
}

export function isPiaAuthError(err: unknown): boolean {
  if (err instanceof AuthenticationError || err instanceof PermissionError) {
    return true;
  }
  if (record(err)) {
    const code = finiteNum(err.statusCode);
    return code === 401 || code === 403;
  }
  return false;
}

export function piaErrorResponse(err: unknown, fallback: string): Response {
  const authError = isPiaAuthError(err);
  return Response.json(
    {
      configured: true,
      authError,
      error: authError
        ? 'Market gateway authentication failed (401/403).'
        : fallback,
    },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function publicPayload<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => publicPayload(item)) as T;
  }
  if (!record(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY_RE.test(key))
      .map(([key, item]) => [key, publicPayload(item)]),
  ) as T;
}

export function sanitizeHttpUrl(raw: unknown): string | null {
  const candidate = text(raw, 2000);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function sanitizeHttpsUrl(raw: unknown): string | undefined {
  const candidate = text(raw, 2000);
  if (!candidate) return undefined;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      return undefined;
    }
    return parsed.href;
  } catch {
    return undefined;
  }
}

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&#038;': '&',
  '&#38;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#34;': '"',
  '&#039;': "'",
  '&#39;': "'",
  '&apos;': "'",
  '&#8216;': "'",
  '&#8217;': "'",
  '&#8220;': '"',
  '&#8221;': '"',
  '&#8211;': '-',
  '&#8212;': '—',
  '&#8230;': '...',
  '&nbsp;': ' ',
};

export function decodeHtmlText(raw: string, maxLen = 280): string {
  const decoded = raw
    .replace(/&(?:#\d+|#x[\da-fA-F]+|[a-zA-Z]+);/g, (entity) => ENTITY_MAP[entity] ?? '')
    .replace(/\[…\]|\[\.\.\.\]/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
  if (decoded.length <= maxLen) return decoded;
  return `${decoded.slice(0, maxLen - 1).trimEnd()}…`;
}
