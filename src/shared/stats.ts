// Anonymous download heat-map telemetry.
//
// A tiny Cloudflare Worker counts one "ping" per install by country (derived by
// Cloudflare from the connection — the app never reads or sends an IP or any id)
// and serves aggregate counts. See cloudflare-worker/README.md to deploy your own,
// then paste your Worker URL into STATS_BASE below.

// TODO(user): replace with your deployed Worker URL, e.g.
//   https://jp-study-pings.yourname.workers.dev
export const STATS_BASE = 'https://jp-study-pings.vasars2024.workers.dev';

export const STATS_PING_URL = `${STATS_BASE}/ping`;
export const STATS_COUNTS_URL = `${STATS_BASE}/counts`;

// localStorage keys (renderer side).
export const TELEMETRY_CONSENT_KEY = 'jp-telemetry-consent'; // 'yes' | 'no'
export const TELEMETRY_PINGED_KEY = 'jp-telemetry-pinged'; // '1' once pinged

export type CountryCounts = Record<string, number>;

/** True once the developer has pointed STATS_BASE at a real Worker. */
export function statsConfigured(): boolean {
  return !STATS_BASE.includes('YOUR-SUBDOMAIN');
}

/**
 * Best-effort country for optimistic learner-map UI when remote counts are empty.
 * Prefer the OS locale region subtag; fall back to a small timezone map.
 */
const TZ_TO_COUNTRY: Record<string, string> = {
  'Africa/Cairo': 'EG',
  'Africa/Johannesburg': 'ZA',
  'America/Argentina/Buenos_Aires': 'AR',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Mexico_City': 'MX',
  'America/New_York': 'US',
  'America/Sao_Paulo': 'BR',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'Asia/Bangkok': 'TH',
  'Asia/Dubai': 'AE',
  'Asia/Hong_Kong': 'HK',
  'Asia/Jakarta': 'ID',
  'Asia/Kolkata': 'IN',
  'Asia/Seoul': 'KR',
  'Asia/Shanghai': 'CN',
  'Asia/Singapore': 'SG',
  'Asia/Taipei': 'TW',
  'Asia/Tokyo': 'JP',
  'Australia/Melbourne': 'AU',
  'Australia/Sydney': 'AU',
  'Europe/Amsterdam': 'NL',
  'Europe/Berlin': 'DE',
  'Europe/Istanbul': 'TR',
  'Europe/Kiev': 'UA',
  'Europe/Kyiv': 'UA',
  'Europe/London': 'GB',
  'Europe/Madrid': 'ES',
  'Europe/Moscow': 'RU',
  'Europe/Paris': 'FR',
  'Europe/Rome': 'IT',
  'Europe/Stockholm': 'SE',
  'Europe/Warsaw': 'PL',
  'Pacific/Auckland': 'NZ',
};

export function guessCountryCode(): string | null {
  try {
    const lang =
      typeof navigator !== 'undefined' && typeof navigator.language === 'string'
        ? navigator.language
        : '';
    const region = lang.match(/-([A-Za-z]{2})\b/)?.[1];
    if (region) return region.toUpperCase();
  } catch {
    /* ignore */
  }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    if (TZ_TO_COUNTRY[tz]) return TZ_TO_COUNTRY[tz];
  } catch {
    /* ignore */
  }
  return null;
}

/** Keep only well-formed 2-letter uppercase ISO codes with non-negative counts. */
export function sanitizeCounts(raw: unknown): CountryCounts {
  const out: CountryCounts = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (/^[A-Z]{2}$/.test(k) && typeof v === 'number' && v >= 0 && Number.isFinite(v)) {
      out[k] = Math.floor(v);
    }
  }
  return out;
}
