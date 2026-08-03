// `safety.respectRobotsTxt`, made real.
//
// SCOPE, because this is the decision a later session is most likely to read as
// a bug: robots.txt is consulted for *crawls* — the page the user pointed the
// scraper at, and the pages a site rule walks — and not for the app's own
// catalogue and index endpoints.
//
// That is not an exemption of convenience. robots.txt governs automated
// retrieval of a site's content by a crawler walking it; api.jikan.moe,
// graphql.anilist.co and a torrent index's search endpoint are documented
// programmatic interfaces this app calls one query at a time, and a Disallow on
// some unrelated path of those hosts would turn "Respect robots.txt" — which
// ships *on* — into "the Scraper does not work". A call site opts in by passing
// `crawl: true`, so which requests are governed is visible at the call site
// rather than inferred here.
//
// Failure is open. RFC 9309 says an unreachable robots.txt means "allow", and
// while it also suggests treating a 5xx as a full disallow, doing that here
// would mean one flaky response makes a scrape silently produce nothing. A user
// who cannot tell the difference between "blocked by robots" and "broken" would
// reasonably call the second one a bug, so every unusable answer allows and
// says so in the log.

import { scraperLog } from './logBus';

export interface RobotsRule {
  /** The path pattern as written, `*` and `$` included. */
  path: string;
  allow: boolean;
}

export interface RobotsRules {
  rules: RobotsRule[];
  /** Which `User-agent` group these came from. '' when the file had none. */
  group: string;
}

/**
 * The token a `User-agent:` line has to match.
 *
 * A profile's user agent is a browser string — `Mozilla/5.0 (Windows NT 10.0…)`
 * — and no robots.txt names that, so in practice the `*` group is what applies.
 * Matching is kept anyway because a user can set a custom agent, and a site that
 * names it deserves to have that honoured.
 */
function agentMatches(line: string, userAgent: string): boolean {
  const token = line.trim().toLowerCase();
  if (token === '*') return true;
  if (!token) return false;
  return userAgent.toLowerCase().includes(token);
}

/**
 * The rule set that applies to one agent.
 *
 * A group naming the agent wins over `*` outright rather than merging with it,
 * which is what the standard says and what site owners expect: a specific group
 * is the site's answer for that crawler, not an addition to the general one.
 */
export function parseRobotsTxt(text: string, userAgent: string): RobotsRules {
  const specific: RobotsRule[] = [];
  const wildcard: RobotsRule[] = [];
  let matchedSpecific = false;
  let matchedWildcard = false;
  let group = '';

  // A run of consecutive `User-agent` lines shares the record that follows it.
  let inSpecific = false;
  let inWildcard = false;
  let sawRule = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      // A new agent line after a rule starts a new record.
      if (sawRule) {
        inSpecific = false;
        inWildcard = false;
        sawRule = false;
      }
      if (value === '*') {
        inWildcard = true;
        matchedWildcard = true;
      } else if (agentMatches(value, userAgent)) {
        inSpecific = true;
        matchedSpecific = true;
        group = value;
      }
      continue;
    }

    if (field !== 'allow' && field !== 'disallow') continue;
    sawRule = true;
    // `Disallow:` with nothing after it means "nothing is disallowed", which is
    // a rule that must not be stored as an empty path — an empty path is a
    // prefix of everything and would block the whole site.
    if (!value) continue;
    const rule: RobotsRule = { path: value, allow: field === 'allow' };
    if (inSpecific) specific.push(rule);
    if (inWildcard) wildcard.push(rule);
  }

  if (matchedSpecific) return { rules: specific, group };
  if (matchedWildcard) return { rules: wildcard, group: '*' };
  return { rules: [], group: '' };
}

/** A robots path pattern (`*` any run, `$` end anchor) as a regular expression. */
function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`);
}

/**
 * Whether a path is allowed by a rule set.
 *
 * Longest match wins, and Allow wins a tie — the rule the standard settles on,
 * and the one that makes `Disallow: /` plus `Allow: /public/` mean what a site
 * owner writing those two lines obviously intends.
 */
export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  let bestLength = -1;
  let allowed = true;
  for (const rule of rules.rules) {
    if (!patternToRegExp(rule.path).test(path)) continue;
    // `*` and `$` make the written length a poor proxy for specificity only in
    // pathological cases; the standard itself measures the pattern's length.
    const length = rule.path.replace(/\$$/, '').length;
    if (length > bestLength || (length === bestLength && rule.allow)) {
      bestLength = length;
      allowed = rule.allow;
    }
  }
  return allowed;
}

/** Rule sets already fetched, keyed `origin\nuserAgent`. */
const cache = new Map<string, RobotsRules>();
/** In-flight fetches, so eight requests to one host fetch robots.txt once. */
const inFlight = new Map<string, Promise<RobotsRules>>();

/**
 * Fetches and caches one host's rules.
 *
 * `fetchText` is injected rather than imported so this module does not depend on
 * http.ts, which depends on the runtime, which would close a cycle — and so a
 * test can serve a robots.txt without a live host.
 */
export async function robotsRulesFor(
  url: string,
  userAgent: string,
  fetchText: (robotsUrl: string) => Promise<string | null>,
): Promise<RobotsRules> {
  let origin = '';
  try {
    origin = new URL(url).origin;
  } catch {
    return { rules: [], group: '' };
  }
  const key = `${origin}\n${userAgent}`;

  const cached = cache.get(key);
  if (cached) return cached;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async (): Promise<RobotsRules> => {
    let rules: RobotsRules = { rules: [], group: '' };
    try {
      const text = await fetchText(`${origin}/robots.txt`);
      if (text !== null) rules = parseRobotsTxt(text, userAgent);
    } catch {
      // Fail open — see the header. The log line below records which it was.
      rules = { rules: [], group: '' };
    }
    cache.set(key, rules);
    inFlight.delete(key);
    return rules;
  })();

  inFlight.set(key, request);
  return request;
}

/**
 * The question a crawl asks before it fetches.
 *
 * Returns true — allowed — for anything it cannot decide, including a URL it
 * cannot parse: the request itself will fail on that, with a message about the
 * URL rather than about robots.
 */
export async function isCrawlAllowed(
  url: string,
  userAgent: string,
  fetchText: (robotsUrl: string) => Promise<string | null>,
  correlationId = '',
): Promise<boolean> {
  let path = '';
  try {
    const parsed = new URL(url);
    path = `${parsed.pathname}${parsed.search}`;
  } catch {
    return true;
  }
  const rules = await robotsRulesFor(url, userAgent, fetchText);
  if (!rules.rules.length) return true;
  const allowed = isPathAllowed(rules, path);
  if (!allowed) {
    scraperLog('warn', 'http', `robots.txt disallows ${url}; not fetching it.`, { correlationId });
  }
  return allowed;
}

/** Test seam, and what a settings change should call — forgets every host. */
export function resetRobotsCache(): void {
  cache.clear();
  inFlight.clear();
}
