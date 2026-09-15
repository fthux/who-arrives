import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const sources = JSON.parse(await readFile(new URL('./data-sources.json', import.meta.url), 'utf8'));
const root = new URL('../', import.meta.url);

async function source(repo, file, localFile) {
  const url = `https://raw.githubusercontent.com/${repo}/${sources[repo].commit}/${file}`;
  let content;
  if (localFile) content = await readFile(localFile, 'utf8');
  else {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Cannot download ${url}: ${response.status}`);
    content = await response.text();
  }
  return { content, url, sha256: createHash('sha256').update(content).digest('hex') };
}

const [countrySource, phoneSource] = await Promise.all([
  source('mledoze/countries', 'countries.json', process.argv[2]),
  source('google/libphonenumber', 'resources/PhoneNumberMetadata.xml', process.argv[3]),
]);
const phoneCodes = new Map();
for (const match of phoneSource.content.matchAll(/<territory\b([^>]+)>/g)) {
  const id = /\bid="([A-Z]{2})"/.exec(match[1])?.[1];
  const code = /\bcountryCode="(\d+)"/.exec(match[1])?.[1];
  if (id && code) phoneCodes.set(id, [...new Set([...(phoneCodes.get(id) ?? []), `+${code}`])]);
}
assert.ok(phoneCodes.size > 200, 'Incomplete calling code source');
const upstream = JSON.parse(countrySource.content);
assert.ok(upstream.length >= 249, 'Incomplete country source');
const result = {};
const nonempty = value => typeof value === 'string' && value.trim() ? value : null;
for (const country of upstream.sort((a, b) => a.cca2.localeCompare(b.cca2, 'en'))) {
  const code = country.cca2;
  assert.match(code, /^[A-Z]{2}$/);
  assert.ok(!Object.hasOwn(result, code), `Duplicate code: ${code}`);
  result[code] = {
    name: nonempty(country.name?.common),
    capitals: Array.isArray(country.capital) ? country.capital : null,
    currencies: country.currencies ? Object.entries(country.currencies).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([code, value]) => ({ code, name: nonempty(value.name), symbol: nonempty(value.symbol) })) : null,
    languages: country.languages ? Object.entries(country.languages).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([code, name]) => ({ code, name })) : null,
    // ITU country calling codes only. Do not expose NANP area-code suffixes as country codes.
    callingCodes: phoneCodes.get(code) ?? null,
  };
}
assert.deepEqual(result.US.callingCodes, ['+1']);
assert.deepEqual(result.CA.callingCodes, ['+1']);
assert.deepEqual(result.DE.callingCodes, ['+49']);
assert.ok(result.ZA.capitals.length > 1);
await writeFile(new URL('src/data/countries.json', root), JSON.stringify(result, null, 2) + '\n');
await writeFile(new URL('src/data/provenance.json', root), JSON.stringify({
  generatedAt: new Date().toISOString(), records: Object.keys(result).length,
  sources: [
    { repository: 'https://github.com/mledoze/countries', commit: sources['mledoze/countries'].commit, url: countrySource.url, sha256: countrySource.sha256, license: 'ODbL-1.0' },
    { repository: 'https://github.com/google/libphonenumber', commit: sources['google/libphonenumber'].commit, url: phoneSource.url, sha256: phoneSource.sha256, license: 'Apache-2.0' },
  ],
}, null, 2) + '\n');
console.log(`Generated ${Object.keys(result).length} English country records; no runtime network calls required.`);
