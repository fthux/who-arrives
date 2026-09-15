import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { clientInfo } from '../src/index';
import { enrich, ipVersion } from '../src/enrichment';
import { FIELD_NAMES, parseFields } from '../src/fields';
import { localTime } from '../src/time';
import countries from '../src/data/countries.json';

function request(query = '', cf: Record<string, unknown> = {}, ip = '203.0.113.1', method = 'GET') {
  const request = new Request(`https://who-arrives-api.fthux.com/${query}`, { method, headers: { 'CF-Connecting-IP': ip } });
  Object.defineProperty(request, 'cf', { value: cf });
  return request;
}
const cf = { country: 'DE', continent: 'EU', timezone: 'Europe/Berlin' };
const instant = new Date('2026-09-16T08:00:00Z');

test('all enrichments match the documented nested contract', () => {
  assert.deepEqual(enrich(clientInfo(request('', cf)), parseFields(new URLSearchParams('fields=all')), instant), {
    country: {
      name: 'Germany', flag: '🇩🇪', capitals: ['Berlin'],
      currencies: [{ code: 'EUR', name: 'Euro', symbol: '€' }],
      languages: [{ code: 'deu', name: 'German' }], callingCodes: ['+49'],
    },
    continent: { name: 'Europe' }, ip: { version: 'IPv4' },
    location: { time: { evaluatedAt: instant.toISOString(), date: '2026-09-16', time: '10:00:00', dateTime: '2026-09-16T10:00:00+02:00', utcOffset: '+02:00', utcOffsetSeconds: 7200 } },
  });
});

test('every field subset preserves basic fields and only adds the requested paths', async () => {
  const basic = await worker.fetch(request('', cf)).json();
  for (let mask = 0; mask < 2 ** FIELD_NAMES.length; mask++) {
    const selected = FIELD_NAMES.filter((_, index) => mask & (1 << index));
    const response = worker.fetch(request(`?fields=${selected.join(',')}`, cf));
    const { enrichment, ...actualBasic } = await response.json();
    assert.deepEqual(actualBasic, basic);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control')!, /no-store/);
    if (!selected.length) { assert.equal(enrichment, undefined); continue; }
    const paths = (object: Record<string, unknown>, prefix = ''): string[] => Object.entries(object).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (path === 'location.time' || Array.isArray(value) || value === null || typeof value !== 'object') return [path];
      return paths(value as Record<string, unknown>, path);
    });
    const expectedPaths = selected.flatMap(field => ({
      names: ['country.name', 'continent.name'], flag: ['country.flag'], ipVersion: ['ip.version'],
      time: ['location.time'], capitals: ['country.capitals'], currencies: ['country.currencies'],
      languages: ['country.languages'], callingCodes: ['country.callingCodes'],
    })[field]);
    assert.deepEqual(paths(enrichment).sort(), expectedPaths.sort());
  }
});

test('empty fields, repeats, whitespace, all and malformed parameters', async () => {
  assert.equal(parseFields(new URLSearchParams('fields=,%20,')).size, 0);
  assert.deepEqual([...parseFields(new URLSearchParams('fields=flag,names&fields=%20flag%20'))], ['names', 'flag']);
  assert.equal(parseFields(new URLSearchParams('fields=all,flag')).size, 8);
  for (const query of ['?fields=unknown', '?fields=all,unknown', '?fields=__proto__', '?fields=constructor', '?fields=Names', '?fields=flag&lang=en', '?ip=8.8.8.8', '?fields=flag&timezone=UTC']) {
    const response = worker.fetch(request(query, cf));
    assert.equal(response.status, 400, query);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  assert.equal(await worker.fetch(request('?fields=all', cf, '203.0.113.1', 'HEAD')).text(), '');
  assert.equal(worker.fetch(request('?fields=typo', cf, '203.0.113.1', 'HEAD')).status, 400);
});

test('missing or special source codes never fabricate data or use country capitals as client location', () => {
  for (const code of [undefined, 'XX', 'T1', '__proto__', 'constructor', 'ZZ']) {
    const client = clientInfo(request('', { country: code, continent: 'unknown', timezone: 'Invalid/Timezone' }, 'invalid'));
    assert.deepEqual(enrich(client, new Set(FIELD_NAMES), instant), {
      country: { name: null, flag: null, capitals: null, currencies: null, languages: null, callingCodes: null },
      continent: { name: null }, ip: { version: null }, location: { time: null },
    });
  }
  const partial = enrich(clientInfo(request('', { country: 'DE' })), new Set(['time', 'names']), instant);
  assert.equal(partial.country?.name, 'Germany');
  assert.equal(partial.location?.time, null);
  assert.equal(partial.continent?.name, null);
});

test('time conversion follows DST transitions, fractional offsets, midnight and date boundaries', () => {
  const cases = [
    ['Europe/Berlin', '2026-03-29T00:59:59Z', '2026-03-29T01:59:59+01:00', 3600],
    ['Europe/Berlin', '2026-03-29T01:00:00Z', '2026-03-29T03:00:00+02:00', 7200],
    ['Europe/Berlin', '2026-10-25T00:59:59Z', '2026-10-25T02:59:59+02:00', 7200],
    ['Europe/Berlin', '2026-10-25T01:00:00Z', '2026-10-25T02:00:00+01:00', 3600],
    ['Asia/Kolkata', '2026-01-01T00:00:00Z', '2026-01-01T05:30:00+05:30', 19800],
    ['Asia/Kathmandu', '2026-01-01T00:00:00Z', '2026-01-01T05:45:00+05:45', 20700],
    ['America/St_Johns', '2026-01-01T00:00:00Z', '2025-12-31T20:30:00-03:30', -12600],
    ['Pacific/Kiritimati', '2026-01-01T12:00:00Z', '2026-01-02T02:00:00+14:00', 50400],
    ['UTC', '2026-01-01T00:00:00.987Z', '2026-01-01T00:00:00+00:00', 0],
  ] as const;
  for (const [zone, time, expected, offset] of cases) {
    const value = localTime(zone, new Date(time));
    assert.equal(value?.dateTime, expected);
    assert.equal(value?.utcOffsetSeconds, offset);
    assert.equal(value?.evaluatedAt, new Date(time).toISOString());
  }
  assert.equal(localTime(null, instant), null);
  assert.equal(localTime('not-a-zone', instant), null);
  assert.equal(localTime('UTC', new Date(NaN)), null);
});

test('IP version uses actual address parsing, including compressed and mapped IPv6', () => {
  for (const address of ['192.0.2.1', '0.0.0.0', '255.255.255.255']) assert.equal(ipVersion(address), 'IPv4');
  for (const address of ['::1', '2001:db8::1', '::ffff:192.0.2.1', '2001:DB8:0:0:0:0:0:1']) assert.equal(ipVersion(address), 'IPv6');
  for (const address of [null, '', '1.2.3', '999.1.2.3', '01.2.3.4', '1:2:3', '[::1]', 'fe80::1%eth0', ':::1', ' https://example.com']) assert.equal(ipVersion(address), null);
});

test('bundled lists preserve multiple values, country calling codes, and request isolation', () => {
  assert.equal(Object.keys(countries).length, 250);
  assert.deepEqual(countries.US.callingCodes, ['+1']);
  assert.deepEqual(countries.CA.callingCodes, ['+1']);
  assert.deepEqual(countries.DO.callingCodes, ['+1']);
  assert.ok(countries.ZA.capitals.length > 1);
  assert.ok(countries.CH.languages.length > 1);
  assert.ok(Object.values(countries).some(country => country.currencies.length > 1));
  const client = clientInfo(request('', cf));
  const first = enrich(client, new Set(['capitals']), instant);
  first.country!.capitals!.push('Not a capital');
  assert.deepEqual(enrich(client, new Set(['capitals']), instant).country?.capitals, ['Berlin']);
  assert.deepEqual(enrich(client, new Set(['flag']), instant), { country: { flag: '🇩🇪' } });
});
