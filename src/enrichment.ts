import countries from './data/countries.json';
import type { clientInfo } from './index';
import type { Field } from './fields';
import { localTime, type LocalTime } from './time';

interface Country {
  name: string | null;
  capitals: string[] | null;
  currencies: { code: string; name: string | null; symbol: string | null }[] | null;
  languages: { code: string; name: string }[] | null;
  callingCodes: string[] | null;
}

export interface Enrichment {
  ip?: { version: 'IPv4' | 'IPv6' | null };
  country?: Partial<Country> & { flag?: string | null };
  continent?: { name: string | null };
  location?: { time: LocalTime | null };
}

const countryData: Readonly<Record<string, Country>> = countries;
const continents: Readonly<Record<string, string>> = {
  AF: 'Africa', AN: 'Antarctica', AS: 'Asia', EU: 'Europe',
  NA: 'North America', OC: 'Oceania', SA: 'South America',
};

export function ipVersion(ip: string | null): 'IPv4' | 'IPv6' | null {
  if (!ip) return null;
  if (/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(ip)) {
    return ip.split('.').every(part => Number(part) <= 255) ? 'IPv4' : null;
  }
  if (!ip.includes(':') || !/^[0-9a-f:.]+$/i.test(ip)) return null;
  try {
    // WHATWG URL parsing validates compressed and IPv4-mapped IPv6 addresses.
    return new URL(`http://[${ip}]/`).hostname.startsWith('[') ? 'IPv6' : null;
  } catch {
    return null;
  }
}

export function enrich(client: ReturnType<typeof clientInfo>, fields: ReadonlySet<Field>, now = new Date()): Enrichment {
  const code = client.country.code;
  const country = code && /^[A-Z]{2}$/.test(code) && Object.hasOwn(countryData, code) ? countryData[code] : null;
  const result: Enrichment = {};
  for (const field of fields) {
    switch (field) {
      case 'names':
        (result.country ??= {}).name = country?.name ?? null;
        result.continent = { name: client.continent && Object.hasOwn(continents, client.continent) ? continents[client.continent] : null };
        break;
      case 'flag':
        (result.country ??= {}).flag = country && code
          ? String.fromCodePoint(...Array.from(code, letter => 0x1f1e6 + letter.charCodeAt(0) - 65)) : null;
        break;
      case 'ipVersion': result.ip = { version: ipVersion(client.ip) }; break;
      case 'time': result.location = { time: localTime(client.location.timezone, now) }; break;
      case 'capitals': case 'currencies': case 'languages': case 'callingCodes':
        // Copy nested lists so a caller cannot mutate the shared bundled records.
        Object.assign(result.country ??= {}, { [field]: structuredClone(country?.[field] ?? null) });
        break;
    }
  }
  return result;
}
