// The Anti-Bot group's `session.*` half.
//
// Two settings, and between them they fix something the Network group has been
// quietly getting wrong: `network.userAgent` offers "Random (Recommended)" as
// its default, stores that choice as an empty string, and http.ts then falls
// back to one hard-coded Chrome string for every request ever made. The
// recommended option was the one that did nothing.
//
//   consistentFingerprint — with Random selected, picks an identity from the
//     pool below: one for the whole job when on, a fresh one per request when
//     off. That is exactly what the field's hint promises ("Reuse one plausible
//     browser identity instead of varying it per request"). A user who picked a
//     specific agent, or typed a custom one, is never overridden — they already
//     said what they wanted.
//
//   persistAuthenticatedSession — a cookie jar for the life of one job. A host
//     that sets a cookie gets it back on later requests, so a challenge or a
//     login answered once is not answered again on every page.
//
// The jar is deliberately small in scope: in memory, per job, never written to
// disk and never logged. A cookie is a credential; the redaction rules in
// http.ts exist because one leaking into a rendered log line is the failure
// worth designing against, and a jar that outlived the run would be a second,
// larger version of the same risk.

import type { ScraperNetworkSettings, ScraperSessionSettings } from '../../shared/scraperSettings';

/**
 * Plausible current desktop identities.
 *
 * Kept short and real: an agent string nothing else in the world sends is a
 * fingerprint of its own, which is the opposite of what the setting is for.
 */
export const SCRAPER_FINGERPRINTS: readonly string[] = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
];

export function pickFingerprint(random: () => number = Math.random): string {
  const index = Math.min(
    SCRAPER_FINGERPRINTS.length - 1,
    Math.max(0, Math.floor(random() * SCRAPER_FINGERPRINTS.length)),
  );
  return SCRAPER_FINGERPRINTS[index];
}

export interface ScraperSessionState {
  /** '' when the profile named its own agent, and the pool must not interfere. */
  fixedUserAgent: string;
  /** Whether an identity is chosen once (true) or per request (false). */
  consistent: boolean;
  /** Whether responses' cookies are remembered for later requests. */
  persistCookies: boolean;
  /** host → cookie name → value. Never logged, never persisted. */
  jar: Map<string, Map<string, string>>;
  /** Only for the log line; the label the user gave this session. */
  label: string;
}

export function sessionStateFrom(
  session: ScraperSessionSettings,
  network: ScraperNetworkSettings,
  random: () => number = Math.random,
): ScraperSessionState {
  const chosen = network.userAgent.trim();
  return {
    // A named agent wins: 'Random' is the only setting that hands the choice over.
    fixedUserAgent: chosen ? '' : (session.consistentFingerprint ? pickFingerprint(random) : ''),
    consistent: session.consistentFingerprint,
    persistCookies: session.persistAuthenticatedSession,
    jar: new Map(),
    label: session.sessionLabel.trim(),
  };
}

/**
 * The user agent this request should carry, or '' to leave the policy's own.
 *
 * '' is returned whenever the profile named an agent, so the precedence rule
 * lives in one place: the pool only ever fills a gap.
 */
export function userAgentForRequest(
  state: ScraperSessionState,
  profileUserAgent: string,
  random: () => number = Math.random,
): string {
  if (profileUserAgent.trim()) return '';
  if (state.consistent) return state.fixedUserAgent;
  return pickFingerprint(random);
}

// ---------------------------------------------------------------- cookie jar ---

/** Lower-cased hostname, or '' for anything unparseable. */
function jarHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Records the cookies a response set.
 *
 * Attributes are dropped, including `expires` and `max-age`: the jar lives for
 * one job, so a cookie that outlives the run and one that does not are the same
 * cookie from here. `max-age=0` is the one attribute that must be read, because
 * it is how a server *deletes* a cookie and replaying a deleted session cookie
 * is worse than having none.
 */
export function rememberSetCookie(
  state: ScraperSessionState,
  url: string,
  rawSetCookie: string,
): void {
  if (!state.persistCookies || !rawSetCookie) return;
  const host = jarHost(url);
  if (!host) return;
  const jar = state.jar.get(host) ?? new Map<string, string>();

  // Node joins multiple Set-Cookie headers with ', '. Splitting on that alone
  // would cut an `expires=Wed, 09 Jun 2027` date in half, so a split only counts
  // where the next token looks like the start of a new `name=value` pair.
  for (const piece of rawSetCookie.split(/,\s*(?=[^;=,\s]+=)/)) {
    const [pair, ...attributes] = piece.split(';');
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name) continue;
    const deleted = attributes.some((attribute) => /^\s*max-age\s*=\s*0\s*$/i.test(attribute));
    if (deleted) jar.delete(name);
    else jar.set(name, value);
  }

  if (jar.size) state.jar.set(host, jar);
  else state.jar.delete(host);
}

/** The `cookie` header value for a host, or '' when the jar has nothing. */
export function cookieHeaderFor(state: ScraperSessionState, url: string): string {
  if (!state.persistCookies) return '';
  const jar = state.jar.get(jarHost(url));
  if (!jar?.size) return '';
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

/**
 * The jar's cookies merged behind the profile's own `network.cookieHeader`.
 *
 * The profile's cookie wins on a name collision: the user pasted that one
 * deliberately, and a session cookie picked up mid-run must not overwrite the
 * login they configured.
 */
export function mergeCookieHeaders(profileCookie: string, jarCookie: string): string {
  if (!jarCookie) return profileCookie;
  if (!profileCookie) return jarCookie;
  const configured = new Set(
    profileCookie
      .split(';')
      .map((pair) => pair.split('=')[0].trim())
      .filter(Boolean),
  );
  const extra = jarCookie
    .split(';')
    .map((pair) => pair.trim())
    .filter((pair) => pair && !configured.has(pair.split('=')[0].trim()));
  return extra.length ? `${profileCookie}; ${extra.join('; ')}` : profileCookie;
}
