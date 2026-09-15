import { writeFile } from 'node:fs/promises';

const string = { type: ['string', 'null'] };
const number = { type: ['number', 'null'] };
const boolean = { type: ['boolean', 'null'] };
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const list = items => ({ type: ['array', 'null'], items });
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const fields = ['names', 'flag', 'ipVersion', 'time', 'capitals', 'currencies', 'languages', 'callingCodes', 'all'];
const basic = {
  ip: string, country: object({ code: string, isEUCountry: boolean }), continent: string, city: string,
  region: object({ name: string, code: string }), postalCode: string,
  location: object({ latitude: { ...number, minimum: -90, maximum: 90 }, longitude: { ...number, minimum: -180, maximum: 180 }, timezone: string }),
  metroCode: string, asn: object({ number: { type: ['integer', 'null'], minimum: 1 }, organization: string }),
};
const commonHeaders = {
  'Cache-Control': { schema: { type: 'string', const: 'private, no-store, max-age=0' } },
  'Access-Control-Allow-Origin': { schema: { type: 'string', const: '*' } },
};
const response = (description, schema) => ({ description, headers: commonHeaders, ...(schema ? { content: { 'application/json': { schema } } } : {}) });
const parameter = {
  name: 'fields', in: 'query', required: false,
  description: `Add enrichment to the unchanged basic response. Comma-separated, case-sensitive selections: ${fields.join(', ')}. Repeated fields parameters are merged; whitespace, duplicates and empty tokens are ignored. All tokens are validated before all expands. Missing or empty fields returns only basic data. Unknown fields or query parameter names return 400.`,
  schema: { type: 'string' }, example: 'names,flag,time',
};
const spec = {
  openapi: '3.1.0',
  info: { title: 'Who Arrives', version: '1.1.0', description: 'Current client public IP, geolocation and ASN from Cloudflare, with optional English enrichment computed locally or read from bundled data. No arbitrary IP lookup. Country reference data does not describe personal language, currency or phone usage. Bundled country data derives from mledoze/countries (ODbL-1.0); country calling codes derive from Google libphonenumber (Apache-2.0). See licenses/README.md and src/data/provenance.json in the source distribution.' },
  servers: [{ url: 'https://who-arrives-api.fthux.com' }, { url: 'http://127.0.0.1:8787', description: 'Local Wrangler dev server; geolocation may be simulated' }],
  paths: {
    '/': {
      get: { operationId: 'getClient', summary: 'Get basic client information and selected enrichment', parameters: [parameter], responses: {
        '200': response('Basic fields always present. Enrichment groups and fields appear only when requested. Requested unavailable values are null; known empty lists are [].', ref('ClientResponse')),
        '400': response('Unknown field or unsupported query parameter', ref('Error')),
      } },
      head: { operationId: 'headClient', summary: 'Validate a lookup and return headers without a body', parameters: [parameter], responses: {
        '200': response('Lookup accepted; no body'), '400': response('Invalid query; no body'),
      } },
      options: { operationId: 'preflightClient', summary: 'Browser CORS preflight', responses: { '204': {
        ...response('No body; query parameters are ignored for preflight'),
        headers: { ...commonHeaders, 'Access-Control-Allow-Methods': { schema: { type: 'string', const: 'GET, HEAD, OPTIONS' } } },
      } } },
    },
  },
  components: { schemas: {
    ClientResponse: object({ ...basic, enrichment: ref('Enrichment') }, Object.keys(basic)),
    Enrichment: object({
      ip: object({ version: { type: ['string', 'null'], enum: ['IPv4', 'IPv6', null] } }),
      country: object({
        name: string, flag: string, capitals: list({ type: 'string' }),
        currencies: list(object({ code: { type: 'string', pattern: '^[A-Z]{3}$' }, name: string, symbol: string })),
        languages: list(object({ code: { type: 'string', description: 'ISO 639-3 language code', pattern: '^[a-z]{3}$' }, name: { type: 'string' } })),
        callingCodes: { ...list({ type: 'string', pattern: '^\\+[1-9][0-9]{0,2}$' }), description: 'Country calling codes only, e.g. US, CA and DO all use +1; no national area codes.' },
      }, []),
      continent: object({ name: string }),
      location: object({ time: { anyOf: [ref('LocalTime'), { type: 'null' }] } }),
    }, []),
    LocalTime: object({
      evaluatedAt: { type: 'string', format: 'date-time', description: 'Single UTC instant used for all time fields in this request' },
      date: { type: 'string', format: 'date' }, time: { type: 'string', pattern: '^\\d{2}:\\d{2}:\\d{2}$' },
      dateTime: { type: 'string', description: 'Local ISO date-time with numeric UTC offset, calculated from the client IANA time zone' },
      utcOffset: { type: 'string', pattern: '^[+-]\\d{2}:\\d{2}(:\\d{2})?$' },
      utcOffsetSeconds: { type: 'integer', description: 'Seconds east of UTC; negative west of UTC' },
    }),
    Error: object({ error: { type: 'string', description: 'English error message' } }),
  } },
};
await writeFile(new URL('../openapi.json', import.meta.url), JSON.stringify(spec, null, 2) + '\n');
console.log('Generated openapi.json');
