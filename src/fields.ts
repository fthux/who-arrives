export const FIELD_NAMES = [
  'names', 'flag', 'ipVersion', 'time', 'capitals', 'currencies', 'languages', 'callingCodes',
] as const;

export type Field = typeof FIELD_NAMES[number];

export function parseFields(params: URLSearchParams): Set<Field> {
  for (const key of params.keys()) {
    if (key !== 'fields') throw new Error(`Unsupported query parameter: ${key}. Only fields is supported.`);
  }
  const tokens = params.getAll('fields').flatMap(value => value.split(',')).map(value => value.trim()).filter(Boolean);
  const selected = new Set<Field>();
  let all = false;
  for (const token of tokens) {
    if (token === 'all') {
      all = true;
    } else {
      const field = FIELD_NAMES.find(name => name === token);
      if (!field) throw new Error(`Unknown field: ${token}. Supported fields: ${FIELD_NAMES.join(', ')}, all.`);
      selected.add(field);
    }
  }
  // Validate every token before expanding all, so all cannot conceal a typo.
  return new Set(FIELD_NAMES.filter(field => all || selected.has(field)));
}
