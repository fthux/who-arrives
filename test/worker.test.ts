import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../src/index.ts';

function request(path = '/', cf?: Record<string, unknown>, headers: Record<string, string> = {}, method = 'GET') {
  const req = new Request(`https://who-arrives-api.fthux.com${path}`, { headers, method });
  if (cf) Object.defineProperty(req, 'cf', { value: cf });
  return req;
}

const emptyClient = {
  ip: null, country: { code: null, isEUCountry: null }, continent: null, city: null,
  region: { name: null, code: null }, postalCode: null,
  location: { latitude: null, longitude: null, timezone: null },
  metroCode: null, asn: { number: null, organization: null },
};

const fixture = {
  country: 'DE', continent: 'EU', city: 'Berlin', region: 'Berlin', regionCode: 'BE',
  postalCode: '10115', latitude: '52.52', longitude: '13.405', timezone: 'Europe/Berlin',
  isEUCountry: '1', metroCode: '001', asn: 64500, asOrganization: 'Example Network',
  colo: 'FRA', httpProtocol: 'HTTP/2', tlsVersion: 'TLSv1.3', tlsCipher: 'secret',
  clientTcpRtt: 10, edgeL4: { deliveryRate: 200 }, botManagement: { score: 99 },
  futureCloudflareField: 'must not leak',
};

test('returns exactly client fields, normalizes types, and excludes all edge/connection data', async () => {
  const response = worker.fetch(request('/', fixture, { 'CF-Connecting-IP': '203.0.113.1' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ip: '203.0.113.1', country: { code: 'DE', isEUCountry: true }, continent: 'EU', city: 'Berlin',
    region: { name: 'Berlin', code: 'BE' }, postalCode: '10115',
    location: { latitude: 52.52, longitude: 13.405, timezone: 'Europe/Berlin' },
    metroCode: '001', asn: { number: 64500, organization: 'Example Network' },
  });
  assert.match(response.headers.get('Cache-Control')!, /no-store/);
  assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
});

test('missing metadata stays null and never trusts alternative proxy headers', async () => {
  for (const cf of [undefined, {}]) {
    const result = await worker.fetch(request('/', cf, { 'X-Forwarded-For': '8.8.8.8', 'X-Real-IP': '8.8.4.4', 'CF-IPCountry': 'US' })).json();
    assert.deepEqual(result, emptyClient);
  }
});

test('handles zero coordinates, false EU membership, and invalid values', async () => {
  const valid = await worker.fetch(request('/', { latitude: '0', longitude: '0', isEUCountry: false })).json();
  assert.equal(valid.location.latitude, 0);
  assert.equal(valid.location.longitude, 0);
  assert.equal(valid.country.isEUCountry, false);
  const invalid = await worker.fetch(request('/', { latitude: '', longitude: '181', asn: NaN, city: '', isEUCountry: 'unknown' })).json();
  assert.deepEqual(invalid, emptyClient);
});

test('preserves original IPv6 under Pseudo IPv4 and isolates requests', async () => {
  const first = await worker.fetch(request('/', fixture, { 'CF-Connecting-IP': '240.0.0.1', 'CF-Connecting-IPv6': '2001:db8::1' })).json();
  const second = await worker.fetch(request('/', {}, { 'CF-Connecting-IP': '203.0.113.2' })).json();
  assert.equal(first.ip, '2001:db8::1');
  assert.equal(second.ip, '203.0.113.2');
  assert.deepEqual(second.country, { code: null, isEUCountry: null });
});

test('routes, unsupported lookups, methods and browser preflight', async () => {
  assert.equal(worker.fetch(request('/?ip=8.8.8.8')).status, 400);
  assert.equal(worker.fetch(request('/8.8.8.8')).status, 404);
  const post = worker.fetch(request('/', undefined, {}, 'POST'));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('Allow'), 'GET, HEAD, OPTIONS');
  assert.equal(worker.fetch(request('/', undefined, {}, 'OPTIONS')).status, 204);
  const head = worker.fetch(request('/', fixture, {}, 'HEAD'));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});
