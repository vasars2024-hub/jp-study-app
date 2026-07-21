// Best-effort country guess for optimistic learner-map UI when the remote
// backend has no data yet (or isn't configured). Prefer the BCP-47 region
// subtag from the OS locale; fall back to a small timezone → ISO map.
// Never used as an identifier — display-only merge into aggregate counts.

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

/** Two-letter ISO country code, or null if we can't guess. */
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
