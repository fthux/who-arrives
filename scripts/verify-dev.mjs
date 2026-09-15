import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const base = process.argv[2] ?? 'http://127.0.0.1:8787';
const countries = JSON.parse(await readFile(new URL('../src/data/countries.json', import.meta.url), 'utf8'));
async function get(query = '') {
  const response = await fetch(`${base}/${query}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  return response.json();
}
const basic = await get();
assert.deepEqual(Object.keys(basic).sort(), ['ip', 'countryOrRegion', 'continent', 'city', 'region', 'postalCode', 'location', 'metroCode', 'asn'].sort());
assert.deepEqual(await get('?fields='), basic);
const { enrichment, ...sameBasic } = await get('?fields=all');
assert.deepEqual(sameBasic, basic);
assert.deepEqual(Object.keys(enrichment).sort(), ['countryOrRegion', 'continent', 'ip', 'location'].sort());
assert.deepEqual(Object.keys(enrichment.countryOrRegion).sort(), ['name', 'flag', 'capitals', 'currencies', 'languages', 'callingCodes'].sort());
const country = Object.hasOwn(countries, basic.countryOrRegion.code) ? countries[basic.countryOrRegion.code] : null;
assert.equal(enrichment.countryOrRegion.name, country?.name ?? null);
assert.deepEqual(enrichment.countryOrRegion.callingCodes, country?.callingCodes ?? null);
if (basic.location.timezone) {
  const time = enrichment.location.time;
  assert.ok(time);
  assert.ok(Math.abs(Date.now() - Date.parse(time.evaluatedAt)) < 60000);
  assert.equal(Date.parse(time.dateTime), Math.floor(Date.parse(time.evaluatedAt) / 1000) * 1000);
}
const flag = await get('?fields=flag');
assert.deepEqual(flag.enrichment, { countryOrRegion: { flag: enrichment.countryOrRegion.flag } });
const repeated = await get('?fields=names,%20flag%20&fields=flag');
assert.deepEqual(repeated.enrichment, { countryOrRegion: { name: enrichment.countryOrRegion.name, flag: enrichment.countryOrRegion.flag }, continent: enrichment.continent });
for (const query of ['?fields=all,typo', '?fields=names&lang=en', '?ip=8.8.8.8']) {
  assert.equal((await fetch(`${base}/${query}`)).status, 400);
}
assert.equal((await fetch(`${base}/missing`)).status, 404);
assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
assert.equal((await fetch(`${base}/?fields=all`, { method: 'OPTIONS' })).status, 204);
const head = await fetch(`${base}/?fields=all`, { method: 'HEAD' });
assert.equal(head.status, 200);
assert.equal(await head.text(), '');
console.log('Dev HTTP checks passed: unchanged basic response, all enrichment, selected fields, repeats, time consistency, CORS, no-store, and error/method handling.');
console.log('Wrangler local geolocation is development metadata, not a verification of the real visitor location.');
