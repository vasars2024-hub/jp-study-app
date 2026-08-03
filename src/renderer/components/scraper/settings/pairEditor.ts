export interface ScraperSettingPair {
  id: string;
  key: string;
  value: string;
}

function pair(id: number, key = '', value = ''): ScraperSettingPair {
  return { id: `pair-${id}`, key, value };
}

export function headerRecordToPairs(headers: Record<string, string>): ScraperSettingPair[] {
  const rows = Object.entries(headers).map(([key, value], index) => pair(index, key, value));
  return rows.length ? rows : [pair(0)];
}

export function cookieHeaderToPairs(header: string): ScraperSettingPair[] {
  const rows = header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => {
      const separator = part.indexOf('=');
      return separator < 0
        ? pair(index, part, '')
        : pair(index, part.slice(0, separator).trim(), part.slice(separator + 1).trim());
    });
  return rows.length ? rows : [pair(0)];
}

export function pairsToHeaderRecord(rows: ScraperSettingPair[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key) headers[key] = row.value.trim();
  }
  return headers;
}

export function pairsToCookieHeader(rows: ScraperSettingPair[]): string {
  return rows
    .map((row) => ({ key: row.key.trim(), value: row.value.trim() }))
    .filter((row) => row.key)
    .map((row) => `${row.key}=${row.value}`)
    .join('; ');
}
