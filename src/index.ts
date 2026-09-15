function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function coordinate(value: unknown, limit: number): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

function euCountry(value: unknown): boolean | null {
  if (value === '1' || value === true || value === 1) return true;
  if (value === '0' || value === false || value === 0) return false;
  // Cloudflare may omit this field outside the EU. Do not infer missing data.
  return null;
}

export function clientInfo(request: Request) {
  const cf = request.cf;
  // Explicit allowlist: never serialize request.cf or arbitrary request headers.
  return {
    // Preserve the real IPv6 address when Pseudo IPv4 overwrites CF-Connecting-IP.
    ip: cf ? text(request.headers.get('CF-Connecting-IPv6')) ?? text(request.headers.get('CF-Connecting-IP')) : null,
    country: {
      code: text(cf?.country),
      isEUCountry: euCountry(cf?.isEUCountry),
    },
    continent: text(cf?.continent),
    city: text(cf?.city),
    region: {
      name: text(cf?.region),
      code: text(cf?.regionCode),
    },
    postalCode: text(cf?.postalCode),
    location: {
      latitude: coordinate(cf?.latitude, 90),
      longitude: coordinate(cf?.longitude, 180),
      timezone: text(cf?.timezone),
    },
    metroCode: text(cf?.metroCode),
    asn: {
      number: typeof cf?.asn === 'number' && Number.isSafeInteger(cf.asn) && cf.asn > 0 ? cf.asn : null,
      organization: text(cf?.asOrganization),
    },
  };
}

export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);
    const headers = new Headers({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'CDN-Cache-Control': 'no-store',
      'Cloudflare-CDN-Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'X-Content-Type-Options': 'nosniff',
    });
    const json = (body: unknown, status = 200) => new Response(
      request.method === 'HEAD' ? null : JSON.stringify(body, null, 2),
      { status, headers },
    );

    if (url.pathname !== '/') return json({ error: 'Not found. Use GET / to look up the current client.' }, 404);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      headers.set('Allow', 'GET, HEAD, OPTIONS');
      return json({ error: 'Method not allowed.' }, 405);
    }
    if (url.search) return json({ error: 'Query parameters are not supported. This API only describes the current client.' }, 400);
    return json(clientInfo(request));
  },
} satisfies ExportedHandler;
