// Validation primitives shared by the scraper settings modules.
//
// These were private helpers inside scraperSettings.ts. They moved here
// unchanged when the settings model grew from 8 groups to 20 — splitting the
// new groups into sibling modules (scraperSourceSettings, scraperOutputSettings)
// needs the same helpers, and copying them would have meant three subtly
// diverging clamps within a year.
//
// The contract every validator here shares: never throw, never return
// undefined, always fall back to the caller's default, and push a human-
// readable note onto `issues` when input was rejected or adjusted. A settings
// document is user-editable and may be hand-written, imported from an older
// build, or corrupt — none of which should be able to break a render.

export interface ScraperSettingsIssue {
  path: string;
  message: string;
}

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function recordAt(source: UnknownRecord, key: string): UnknownRecord {
  const value = source[key];
  return isRecord(value) ? value : {};
}

export function boundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  path: string,
  issues: ScraperSettingsIssue[],
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    if (value !== undefined) issues.push({ path, message: 'Expected a finite number.' });
    return fallback;
  }
  const bounded = Math.min(max, Math.max(min, Math.round(value)));
  if (bounded !== value) issues.push({ path, message: `Clamped to ${min}-${max}.` });
  return bounded;
}

export function booleanValue(
  value: unknown,
  fallback: boolean,
  path: string,
  issues: ScraperSettingsIssue[],
): boolean {
  if (typeof value === 'boolean') return value;
  if (value !== undefined) issues.push({ path, message: 'Expected true or false.' });
  return fallback;
}

export function stringValue(
  value: unknown,
  fallback: string,
  maxLength: number,
  path: string,
  issues: ScraperSettingsIssue[],
): string {
  if (typeof value !== 'string') {
    if (value !== undefined) issues.push({ path, message: 'Expected text.' });
    return fallback;
  }
  if (value.length <= maxLength) return value;
  issues.push({ path, message: `Trimmed to ${maxLength} characters.` });
  return value.slice(0, maxLength);
}

export function stringListValue(
  value: unknown,
  fallback: string[],
  path: string,
  issues: ScraperSettingsIssue[],
  maxItems = 50,
): string[] {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Expected a list of text values.' });
    return [...fallback];
  }
  return [...new Set(value.slice(0, maxItems)
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, 1_024))
    .filter(Boolean))];
}

export function numberListValue(
  value: unknown,
  fallback: number[],
  path: string,
  issues: ScraperSettingsIssue[],
): number[] {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Expected a list of numbers.' });
    return [...fallback];
  }
  const result = [...new Set(value
    .filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
    .map((item) => Math.min(8_640, Math.max(1, Math.round(item)))))];
  return result.length ? result : [...fallback];
}

export function nullableDateValue(
  value: unknown,
  fallback: string | null,
  path: string,
  issues: ScraperSettingsIssue[],
): string | null {
  if (value === undefined) return fallback;
  if (value === null || value === '') return null;
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  issues.push({ path, message: 'Expected an ISO date or null.' });
  return fallback;
}

export function safeId(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 64) || fallback;
}

/**
 * Picks one of a fixed set. New in the v3 split — the original eight groups
 * hand-rolled a ternary per enum, which stopped scaling once the model gained
 * twenty-odd of them.
 */
export function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  path: string,
  issues: ScraperSettingsIssue[],
): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  if (value !== undefined) {
    issues.push({ path, message: `Expected one of: ${allowed.join(', ')}.` });
  }
  return fallback;
}

/** A DNS label: alphanumeric, inner hyphens allowed. */
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Bare hostname, lowercased, `www.` stripped. Returns null when unparseable.
 *
 * Note that URL parsing alone is not enough of a check: `new URL('https://!!!')`
 * succeeds and yields `!!!` as the hostname, so a source configured with
 * obvious garbage would survive validation and then fail at request time with
 * a far more confusing error. Hence the explicit label check, plus the
 * requirement that a name be dotted, bracketed IPv6, or literally `localhost`.
 */
export function normalizeHost(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  let hostname: string;
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    hostname = url.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  if (!hostname) return null;
  if (hostname.startsWith('[') && hostname.endsWith(']')) return hostname; // IPv6
  if (!hostname.split('.').every((label) => HOST_LABEL.test(label))) return null;
  if (!hostname.includes('.') && hostname !== 'localhost') return null;
  return hostname;
}

/**
 * `HH:MM` on a 24-hour clock, or '' for "not set". Used by quiet hours, where
 * an empty string is meaningfully different from midnight.
 */
export function clockValue(
  value: unknown,
  fallback: string,
  path: string,
  issues: ScraperSettingsIssue[],
): string {
  if (value === undefined) return fallback;
  if (value === '') return '';
  if (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return value;
  issues.push({ path, message: 'Expected a time as HH:MM, or empty.' });
  return fallback;
}

/**
 * Shape-only cron check: five whitespace-separated fields of legal characters.
 * Deliberately not a full parser — the scheduler that will actually run these
 * does not exist yet, and a validator that silently "fixes" a field the real
 * scheduler would have accepted is worse than one that only rejects nonsense.
 */
export function cronValue(
  value: unknown,
  fallback: string,
  path: string,
  issues: ScraperSettingsIssue[],
): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') {
    issues.push({ path, message: 'Expected a cron expression.' });
    return fallback;
  }
  const fields = value.trim().split(/\s+/);
  if (fields.length === 5 && fields.every((f) => /^[0-9*/,\-A-Za-z?]+$/.test(f))) {
    return fields.join(' ');
  }
  issues.push({ path, message: 'Expected five cron fields, e.g. "0 3 * * *".' });
  return fallback;
}
