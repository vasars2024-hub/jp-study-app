// @vitest-environment node
//
// The Anti-Bot group, against real sockets where the claim is about the wire.
//
// The arithmetic half (pacing windows, the failure breaker, robots matching)
// runs on an injected clock: those failures are off-by-one-window ones, and a
// suite that waited out a sixty-second window to see them would be a suite
// nobody runs. The half that can only be proved on the wire — that a disallowed
// path is *not* fetched, that a cookie comes back, that two requests really did
// arrive half a second apart — runs against a local server and asserts on what
// that server saw.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createDefaultScraperSettingsDocument,
  resolveScraperSettings,
  type ScraperSettings,
} from '../../shared/scraperSettings';

vi.mock('electron', () => ({
  app: { getPath: () => `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/gum-vitest-userdata`, getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
}));

const { scraperRequest } = await import('../scraper/http');
const { resetScraperHttpCache } = await import('../scraper/httpCache');
const { runWithScraperRuntime, scraperRuntimeFor } = await import('../scraper/runtime');
const {
  HostGovernor,
  requestHost,
  rateLimitFor,
  safetyPolicyFrom,
} = await import('../scraper/safetyPolicy');
const {
  isCrawlAllowed,
  isPathAllowed,
  parseRobotsTxt,
  resetRobotsCache,
} = await import('../scraper/robots');
const {
  SCRAPER_FINGERPRINTS,
  cookieHeaderFor,
  mergeCookieHeaders,
  pickFingerprint,
  rememberSetCookie,
  sessionStateFrom,
  userAgentForRequest,
} = await import('../scraper/session');

// ------------------------------------------------------------------- server ---

interface Seen {
  url: string;
  headers: http.IncomingHttpHeaders;
  at: number;
}

let base = '';
let server: http.Server;
let seen: Seen[] = [];
let robotsBody = 'User-agent: *\nDisallow:\n';
/** 404 rather than a body, for the fail-open assertions. */
let robotsMissing = false;
let inFlight = 0;
let maxInFlight = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    seen.push({ url, headers: req.headers, at: Date.now() });

    if (url === '/robots.txt') {
      if (robotsMissing) {
        res.writeHead(404);
        res.end('no');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(robotsBody);
      return;
    }

    if (url === '/login') {
      res.writeHead(200, {
        'content-type': 'text/html',
        'set-cookie': ['sid=abc123; Path=/; HttpOnly', 'theme=dark; Path=/'],
      });
      res.end('<html><title>In</title></html>');
      return;
    }

    if (url === '/slow') {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      setTimeout(() => {
        inFlight -= 1;
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('slow');
      }, 300);
      return;
    }

    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><title>Page</title></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  seen = [];
  inFlight = 0;
  maxInFlight = 0;
  robotsMissing = false;
  robotsBody = 'User-agent: *\nDisallow:\n';
  resetRobotsCache();
  resetScraperHttpCache();
});

afterEach(() => {
  resetRobotsCache();
});

/**
 * Defaults with the *other* groups neutralised, so each assertion below is about
 * an Anti-Bot setting and nothing else.
 */
function settings(patch: (s: ScraperSettings) => void = () => undefined): ScraperSettings {
  const value = resolveScraperSettings(createDefaultScraperSettingsDocument());
  value.network.randomDelayMinMs = 0;
  value.network.randomDelayMaxMs = 0;
  value.network.retryAttempts = 0;
  value.cache.htmlEnabled = false;
  value.cache.metadataEnabled = false;
  value.cache.thumbnailsEnabled = false;
  value.safety.crawlDelayMs = 0;
  value.safety.maxRequestsPerMinute = 0;
  value.safety.respectRobotsTxt = false;
  // The servers below listen on 127.0.0.1, which the SSRF guard refuses by default.
  value.safety.allowPrivateNetwork = true;
  patch(value);
  return value;
}

function underProfile<T>(value: ScraperSettings, fn: () => Promise<T>): Promise<T> {
  return runWithScraperRuntime(scraperRuntimeFor(value, 'test-job'), fn);
}

/** A governor on a clock the test drives, so no assertion waits for a window. */
function governorAt(patch: (s: ScraperSettings) => void, start = 1_000_000): {
  governor: InstanceType<typeof HostGovernor>;
  advance: (ms: number) => void;
} {
  let now = start;
  const governor = new HostGovernor(
    safetyPolicyFrom(settings(patch).safety),
    () => now,
    async () => undefined,
  );
  return { governor, advance: (ms: number) => { now += ms; } };
}

// ---------------------------------------------------------------- host keys ---

describe('requestHost', () => {
  it('lower-cases the hostname and drops everything else', () => {
    expect(requestHost('https://API.Jikan.MOE/v4/anime?q=x')).toBe('api.jikan.moe');
  });

  it('is empty for anything that is not a URL', () => {
    expect(requestHost('not a url')).toBe('');
  });
});

describe('rateLimitFor', () => {
  const policy = (limits: Record<string, number>, global = 60) =>
    safetyPolicyFrom(settings((s) => {
      s.safety.maxRequestsPerMinute = global;
      s.safety.domainRateLimits = limits;
    }).safety);

  it('falls back to the global ceiling', () => {
    expect(rateLimitFor('nyaa.si', policy({}))).toBe(60);
  });

  it('prefers an exact host override', () => {
    expect(rateLimitFor('nyaa.si', policy({ 'nyaa.si': 10 }))).toBe(10);
  });

  // The override exists to say "this one is different", in both directions.
  it('lets an override raise the ceiling as well as lower it', () => {
    expect(rateLimitFor('api.jikan.moe', policy({ 'api.jikan.moe': 200 }, 60))).toBe(200);
  });

  it('matches a leading-dot suffix against a subdomain', () => {
    expect(rateLimitFor('sukebei.nyaa.si', policy({ '.nyaa.si': 5 }))).toBe(5);
    expect(rateLimitFor('nyaa.si', policy({ '.nyaa.si': 5 }))).toBe(5);
  });

  it('does not match a suffix against an unrelated host', () => {
    expect(rateLimitFor('evilnyaa.si', policy({ '.nyaa.si': 5 }, 60))).toBe(60);
  });

  it('normalises a host key written with capitals', () => {
    expect(rateLimitFor('nyaa.si', policy({ 'NYAA.SI': 3 }))).toBe(3);
  });
});

// ----------------------------------------------------------------- governor ---

describe('crawlDelayMs', () => {
  it('spaces successive starts on one host', () => {
    const { governor } = governorAt((s) => { s.safety.crawlDelayMs = 500; });
    expect(governor.reserve('https://a.test/1')).toBe(0);
    expect(governor.reserve('https://a.test/2')).toBe(500);
    expect(governor.reserve('https://a.test/3')).toBe(1_000);
  });

  // Reserved synchronously: two parallel requests must not both read the same
  // "last start" and both decide they may go now.
  it('keeps hosts independent of each other', () => {
    const { governor } = governorAt((s) => { s.safety.crawlDelayMs = 500; });
    expect(governor.reserve('https://a.test/1')).toBe(0);
    expect(governor.reserve('https://b.test/1')).toBe(0);
    expect(governor.reserve('https://a.test/2')).toBe(500);
  });

  it('charges nothing once the gap has already elapsed', () => {
    const { governor, advance } = governorAt((s) => { s.safety.crawlDelayMs = 500; });
    governor.reserve('https://a.test/1');
    advance(600);
    expect(governor.reserve('https://a.test/2')).toBe(0);
  });

  it('does nothing at zero', () => {
    const { governor } = governorAt((s) => { s.safety.crawlDelayMs = 0; });
    expect(governor.reserve('https://a.test/1')).toBe(0);
    expect(governor.reserve('https://a.test/2')).toBe(0);
  });
});

describe('maxRequestsPerMinute', () => {
  it('lets the ceiling through and makes the next one wait out the window', () => {
    const { governor } = governorAt((s) => {
      s.safety.crawlDelayMs = 0;
      s.safety.maxRequestsPerMinute = 3;
    });
    expect(governor.reserve('https://a.test/1')).toBe(0);
    expect(governor.reserve('https://a.test/2')).toBe(0);
    expect(governor.reserve('https://a.test/3')).toBe(0);
    expect(governor.reserve('https://a.test/4')).toBe(60_000);
  });

  it('slides rather than resetting on the minute', () => {
    const { governor, advance } = governorAt((s) => {
      s.safety.crawlDelayMs = 0;
      s.safety.maxRequestsPerMinute = 2;
    });
    governor.reserve('https://a.test/1');
    advance(30_000);
    governor.reserve('https://a.test/2');
    // The first start falls out 60s after it happened, i.e. 30s from now.
    expect(governor.reserve('https://a.test/3')).toBe(30_000);
  });

  it('counts per host, not across the run', () => {
    const { governor } = governorAt((s) => {
      s.safety.crawlDelayMs = 0;
      s.safety.maxRequestsPerMinute = 1;
    });
    expect(governor.reserve('https://a.test/1')).toBe(0);
    expect(governor.reserve('https://b.test/1')).toBe(0);
    expect(governor.reserve('https://a.test/2')).toBe(60_000);
  });

  it('applies a domain override instead of the global ceiling', () => {
    const { governor } = governorAt((s) => {
      s.safety.crawlDelayMs = 0;
      s.safety.maxRequestsPerMinute = 100;
      s.safety.domainRateLimits = { 'a.test': 1 };
    });
    expect(governor.reserve('https://a.test/1')).toBe(0);
    expect(governor.reserve('https://a.test/2')).toBe(60_000);
    expect(governor.reserve('https://b.test/1')).toBe(0);
  });

  // Whichever is more restrictive wins, without either being special-cased.
  it('composes with the crawl delay', () => {
    const { governor } = governorAt((s) => {
      s.safety.crawlDelayMs = 100;
      s.safety.maxRequestsPerMinute = 2;
    });
    expect(governor.reserve('https://a.test/1')).toBe(0);
    expect(governor.reserve('https://a.test/2')).toBe(100);
    expect(governor.reserve('https://a.test/3')).toBe(60_000);
  });
});

describe('pauseAfterFailures', () => {
  it('does not trip below the threshold', () => {
    const { governor } = governorAt((s) => {
      s.safety.pauseAfterFailures = 3;
      s.safety.pauseDurationMs = 10_000;
    });
    expect(governor.noteFailure('https://a.test/1')).toBe(false);
    expect(governor.noteFailure('https://a.test/2')).toBe(false);
    expect(governor.isPaused('https://a.test/3')).toBe(false);
  });

  it('pauses the host once the streak reaches it', () => {
    const { governor } = governorAt((s) => {
      s.safety.pauseAfterFailures = 3;
      s.safety.pauseDurationMs = 10_000;
    });
    governor.noteFailure('https://a.test/1');
    governor.noteFailure('https://a.test/2');
    expect(governor.noteFailure('https://a.test/3')).toBe(true);
    expect(governor.isPaused('https://a.test/4')).toBe(true);
    expect(governor.reserve('https://a.test/4')).toBe(10_000);
  });

  it('lets the host through again once the pause expires', () => {
    const { governor, advance } = governorAt((s) => {
      s.safety.pauseAfterFailures = 2;
      s.safety.pauseDurationMs = 10_000;
    });
    governor.noteFailure('https://a.test/1');
    governor.noteFailure('https://a.test/2');
    advance(10_001);
    expect(governor.isPaused('https://a.test/3')).toBe(false);
    expect(governor.reserve('https://a.test/3')).toBe(0);
  });

  it('resets the streak on a success', () => {
    const { governor } = governorAt((s) => {
      s.safety.pauseAfterFailures = 3;
      s.safety.pauseDurationMs = 10_000;
    });
    governor.noteFailure('https://a.test/1');
    governor.noteFailure('https://a.test/2');
    governor.noteSuccess('https://a.test/3');
    expect(governor.noteFailure('https://a.test/4')).toBe(false);
    expect(governor.isPaused('https://a.test/5')).toBe(false);
  });

  it('pauses one host without touching another', () => {
    const { governor } = governorAt((s) => {
      s.safety.pauseAfterFailures = 1;
      s.safety.pauseDurationMs = 10_000;
    });
    governor.noteFailure('https://a.test/1');
    expect(governor.isPaused('https://a.test/2')).toBe(true);
    expect(governor.isPaused('https://b.test/1')).toBe(false);
  });

  // Otherwise every later failure re-arms a full pause and one dead host stalls
  // the run for pauseDurationMs per attempt rather than once.
  it('does not re-arm a full pause on the very next failure', () => {
    const { governor } = governorAt((s) => {
      s.safety.pauseAfterFailures = 2;
      s.safety.pauseDurationMs = 10_000;
    });
    governor.noteFailure('https://a.test/1');
    expect(governor.noteFailure('https://a.test/2')).toBe(true);
    expect(governor.noteFailure('https://a.test/3')).toBe(false);
  });
});

// ------------------------------------------------------------------- robots ---

describe('parseRobotsTxt', () => {
  it('reads the wildcard group', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow: /private\n', 'Mozilla/5.0');
    expect(rules.group).toBe('*');
    expect(rules.rules).toEqual([{ path: '/private', allow: false }]);
  });

  it('prefers a group naming the agent over the wildcard, without merging', () => {
    const text = [
      'User-agent: *',
      'Disallow: /',
      '',
      'User-agent: StudyOS',
      'Disallow: /admin',
    ].join('\n');
    const rules = parseRobotsTxt(text, 'StudyOS-Scraper/1.0');
    expect(rules.group).toBe('StudyOS');
    expect(rules.rules).toEqual([{ path: '/admin', allow: false }]);
  });

  it('treats an empty Disallow as no rule at all', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow:\n', 'Mozilla/5.0');
    expect(rules.rules).toEqual([]);
    expect(isPathAllowed(rules, '/anything')).toBe(true);
  });

  it('ignores comments and blank lines', () => {
    const rules = parseRobotsTxt(
      '# a note\nUser-agent: *   # inline\n\nDisallow: /x  # why\n',
      'Mozilla/5.0',
    );
    expect(rules.rules).toEqual([{ path: '/x', allow: false }]);
  });

  it('shares one record between consecutive agent lines', () => {
    const rules = parseRobotsTxt(
      'User-agent: alpha\nUser-agent: *\nDisallow: /both\n',
      'Mozilla/5.0',
    );
    expect(rules.rules).toEqual([{ path: '/both', allow: false }]);
  });

  it('is empty when no group applies', () => {
    const rules = parseRobotsTxt('User-agent: googlebot\nDisallow: /\n', 'Mozilla/5.0');
    expect(rules.rules).toEqual([]);
  });
});

describe('isPathAllowed', () => {
  const rules = (text: string) => parseRobotsTxt(text, 'Mozilla/5.0');

  it('blocks a disallowed prefix and allows everything else', () => {
    const set = rules('User-agent: *\nDisallow: /private\n');
    expect(isPathAllowed(set, '/private/page')).toBe(false);
    expect(isPathAllowed(set, '/public/page')).toBe(true);
  });

  it('lets the longer match win', () => {
    const set = rules('User-agent: *\nDisallow: /\nAllow: /public/\n');
    expect(isPathAllowed(set, '/public/page')).toBe(true);
    expect(isPathAllowed(set, '/other')).toBe(false);
  });

  it('gives Allow the tie', () => {
    const set = rules('User-agent: *\nDisallow: /x\nAllow: /x\n');
    expect(isPathAllowed(set, '/x/y')).toBe(true);
  });

  it('honours a * wildcard inside a pattern', () => {
    const set = rules('User-agent: *\nDisallow: /*/secret\n');
    expect(isPathAllowed(set, '/a/secret')).toBe(false);
    expect(isPathAllowed(set, '/a/public')).toBe(true);
  });

  it('honours a $ end anchor', () => {
    const set = rules('User-agent: *\nDisallow: /page$\n');
    expect(isPathAllowed(set, '/page')).toBe(false);
    expect(isPathAllowed(set, '/page/sub')).toBe(true);
  });

  it('does not read a regex metacharacter out of a literal path', () => {
    const set = rules('User-agent: *\nDisallow: /a.b\n');
    expect(isPathAllowed(set, '/a.b')).toBe(false);
    expect(isPathAllowed(set, '/axb')).toBe(true);
  });
});

describe('isCrawlAllowed', () => {
  it('allows when the file is missing', async () => {
    const allowed = await isCrawlAllowed('https://a.test/x', 'UA', async () => null);
    expect(allowed).toBe(true);
  });

  it('allows when the fetch throws', async () => {
    const allowed = await isCrawlAllowed('https://a.test/x', 'UA', async () => {
      throw new Error('offline');
    });
    expect(allowed).toBe(true);
  });

  it('fetches robots.txt once per origin however many paths are asked', async () => {
    let fetches = 0;
    const fetchText = async () => {
      fetches += 1;
      return 'User-agent: *\nDisallow: /no\n';
    };
    await Promise.all([
      isCrawlAllowed('https://a.test/one', 'UA', fetchText),
      isCrawlAllowed('https://a.test/two', 'UA', fetchText),
    ]);
    await isCrawlAllowed('https://a.test/three', 'UA', fetchText);
    expect(fetches).toBe(1);
  });

  it('compares the query string too', async () => {
    const fetchText = async () => 'User-agent: *\nDisallow: /*?secret\n';
    expect(await isCrawlAllowed('https://a.test/p?secret=1', 'UA', fetchText)).toBe(false);
    expect(await isCrawlAllowed('https://a.test/p?open=1', 'UA', fetchText)).toBe(true);
  });
});

// ------------------------------------------------------------------ session ---

describe('fingerprints', () => {
  it('picks from the pool', () => {
    expect(SCRAPER_FINGERPRINTS).toContain(pickFingerprint(() => 0));
    expect(SCRAPER_FINGERPRINTS).toContain(pickFingerprint(() => 0.999999));
  });

  it('never runs off the end of the pool', () => {
    expect(pickFingerprint(() => 1)).toBe(SCRAPER_FINGERPRINTS[SCRAPER_FINGERPRINTS.length - 1]);
  });

  it('reuses one identity for the whole job when consistent', () => {
    const value = settings((s) => {
      s.network.userAgent = '';
      s.session.consistentFingerprint = true;
    });
    const state = sessionStateFrom(value.session, value.network, () => 0.5);
    const first = userAgentForRequest(state, value.network.userAgent);
    const second = userAgentForRequest(state, value.network.userAgent);
    expect(first).toBe(second);
    expect(SCRAPER_FINGERPRINTS).toContain(first);
  });

  it('varies the identity per request when not consistent', () => {
    const value = settings((s) => {
      s.network.userAgent = '';
      s.session.consistentFingerprint = false;
    });
    const state = sessionStateFrom(value.session, value.network, () => 0.5);
    expect(userAgentForRequest(state, '', () => 0)).toBe(SCRAPER_FINGERPRINTS[0]);
    expect(userAgentForRequest(state, '', () => 0.9)).toBe(SCRAPER_FINGERPRINTS[4]);
  });

  // The pool only ever fills a gap. A user who named an agent already said what
  // they wanted, and Anti-Bot must not quietly overrule the Network group.
  it('never overrides an agent the profile named', () => {
    const value = settings((s) => {
      s.network.userAgent = 'StudyOS/1.0';
      s.session.consistentFingerprint = false;
    });
    const state = sessionStateFrom(value.session, value.network, () => 0.5);
    expect(state.fixedUserAgent).toBe('');
    expect(userAgentForRequest(state, 'StudyOS/1.0')).toBe('');
  });
});

describe('cookie jar', () => {
  const state = (over: Partial<{ persist: boolean }> = {}) => {
    const value = settings((s) => {
      s.session.persistAuthenticatedSession = over.persist ?? true;
    });
    return sessionStateFrom(value.session, value.network);
  };

  it('remembers a cookie and offers it back to the same host', () => {
    const jar = state();
    rememberSetCookie(jar, 'https://a.test/login', 'sid=abc; Path=/; HttpOnly');
    expect(cookieHeaderFor(jar, 'https://a.test/next')).toBe('sid=abc');
  });

  it('does not offer one host’s cookie to another', () => {
    const jar = state();
    rememberSetCookie(jar, 'https://a.test/login', 'sid=abc');
    expect(cookieHeaderFor(jar, 'https://b.test/next')).toBe('');
  });

  it('keeps several cookies from one response', () => {
    const jar = state();
    rememberSetCookie(jar, 'https://a.test/login', 'sid=abc; Path=/, theme=dark; Path=/');
    expect(cookieHeaderFor(jar, 'https://a.test/next')).toBe('sid=abc; theme=dark');
  });

  // Node joins Set-Cookie headers with ', ', which also appears inside an
  // Expires date — splitting naively cuts "Wed, 09 Jun 2027" in half.
  it('does not split on the comma inside an Expires date', () => {
    const jar = state();
    rememberSetCookie(
      jar,
      'https://a.test/login',
      'sid=abc; Expires=Wed, 09 Jun 2027 10:18:14 GMT; Path=/',
    );
    expect(cookieHeaderFor(jar, 'https://a.test/n')).toBe('sid=abc');
  });

  it('honours a server deleting a cookie with max-age=0', () => {
    const jar = state();
    rememberSetCookie(jar, 'https://a.test/login', 'sid=abc');
    rememberSetCookie(jar, 'https://a.test/logout', 'sid=; Max-Age=0');
    expect(cookieHeaderFor(jar, 'https://a.test/n')).toBe('');
  });

  it('remembers nothing when the setting is off', () => {
    const jar = state({ persist: false });
    rememberSetCookie(jar, 'https://a.test/login', 'sid=abc');
    expect(cookieHeaderFor(jar, 'https://a.test/n')).toBe('');
  });

  it('lets a later value replace an earlier one', () => {
    const jar = state();
    rememberSetCookie(jar, 'https://a.test/1', 'sid=one');
    rememberSetCookie(jar, 'https://a.test/2', 'sid=two');
    expect(cookieHeaderFor(jar, 'https://a.test/n')).toBe('sid=two');
  });
});

describe('mergeCookieHeaders', () => {
  it('adds the jar’s cookies behind the profile’s', () => {
    expect(mergeCookieHeaders('a=1', 'b=2')).toBe('a=1; b=2');
  });

  // The user pasted their login deliberately; a session cookie picked up
  // mid-run must not overwrite it.
  it('lets the profile win a name collision', () => {
    expect(mergeCookieHeaders('sid=configured', 'sid=picked-up; other=1')).toBe(
      'sid=configured; other=1',
    );
  });

  it('handles either side being empty', () => {
    expect(mergeCookieHeaders('', 'b=2')).toBe('b=2');
    expect(mergeCookieHeaders('a=1', '')).toBe('a=1');
  });
});

// -------------------------------------------------------------- on the wire ---

describe('respectRobotsTxt, against a server', () => {
  it('does not fetch a path robots.txt disallows', async () => {
    robotsBody = 'User-agent: *\nDisallow: /private\n';
    await expect(underProfile(
      settings((s) => { s.safety.respectRobotsTxt = true; }),
      () => scraperRequest(`${base}/private/page`, { crawl: true }),
    )).rejects.toThrow(/robots\.txt disallows/i);

    // The proof is what the server saw: robots.txt, and nothing else.
    expect(seen.map((r) => r.url)).toEqual(['/robots.txt']);
  });

  it('fetches a path robots.txt allows', async () => {
    robotsBody = 'User-agent: *\nDisallow: /private\n';
    const response = await underProfile(
      settings((s) => { s.safety.respectRobotsTxt = true; }),
      () => scraperRequest(`${base}/public/page`, { crawl: true }),
    );
    expect(response.status).toBe(200);
    expect(seen.map((r) => r.url)).toContain('/public/page');
  });

  // The scoping decision, made visible: an API call is not a crawl, and a
  // Disallow on some unrelated path of the same host must not silence it.
  it('ignores robots.txt for a request that is not a crawl', async () => {
    robotsBody = 'User-agent: *\nDisallow: /\n';
    const response = await underProfile(
      settings((s) => { s.safety.respectRobotsTxt = true; }),
      () => scraperRequest(`${base}/api/thing`),
    );
    expect(response.status).toBe(200);
    expect(seen.map((r) => r.url)).toEqual(['/api/thing']);
  });

  it('does not fetch robots.txt at all when the setting is off', async () => {
    robotsBody = 'User-agent: *\nDisallow: /\n';
    const response = await underProfile(
      settings((s) => { s.safety.respectRobotsTxt = false; }),
      () => scraperRequest(`${base}/private/page`, { crawl: true }),
    );
    expect(response.status).toBe(200);
    expect(seen.map((r) => r.url)).toEqual(['/private/page']);
  });

  it('crawls anyway when robots.txt is missing', async () => {
    robotsMissing = true;
    const response = await underProfile(
      settings((s) => { s.safety.respectRobotsTxt = true; }),
      () => scraperRequest(`${base}/private/page`, { crawl: true }),
    );
    expect(response.status).toBe(200);
  });
});

describe('pacing, against a server', () => {
  it('spaces two requests to one host by the crawl delay', async () => {
    const started = Date.now();
    await underProfile(
      settings((s) => { s.safety.crawlDelayMs = 400; }),
      async () => {
        await scraperRequest(`${base}/a`);
        await scraperRequest(`${base}/b`);
      },
    );
    expect(Date.now() - started).toBeGreaterThanOrEqual(390);
    expect(seen).toHaveLength(2);
    expect(seen[1].at - seen[0].at).toBeGreaterThanOrEqual(350);
  });

  // The interaction the Network suite deliberately neutralises: pacing decides
  // when a request may *start*, so a limit tighter than the response time makes
  // the concurrency ceiling unreachable against a single host.
  it('holds concurrency down when the per-host limit is tighter than it', async () => {
    await underProfile(
      settings((s) => {
        s.network.concurrentRequests = 3;
        s.safety.crawlDelayMs = 400;
      }),
      async () => {
        await Promise.all([
          scraperRequest(`${base}/slow`),
          scraperRequest(`${base}/slow`),
          scraperRequest(`${base}/slow`),
        ]);
      },
    );
    expect(seen.filter((r) => r.url === '/slow')).toHaveLength(3);
    expect(maxInFlight).toBe(1);
  });

  it('still overlaps when the response outlasts the gap', async () => {
    await underProfile(
      settings((s) => {
        s.network.concurrentRequests = 3;
        s.safety.crawlDelayMs = 50;
      }),
      async () => {
        await Promise.all([
          scraperRequest(`${base}/slow`),
          scraperRequest(`${base}/slow`),
          scraperRequest(`${base}/slow`),
        ]);
      },
    );
    expect(maxInFlight).toBeGreaterThan(1);
  });
});

describe('session, against a server', () => {
  it('sends the cookie a previous response set', async () => {
    await underProfile(
      settings((s) => { s.session.persistAuthenticatedSession = true; }),
      async () => {
        await scraperRequest(`${base}/login`);
        await scraperRequest(`${base}/next`);
      },
    );
    const next = seen.find((r) => r.url === '/next');
    expect(next?.headers.cookie).toBe('sid=abc123; theme=dark');
  });

  it('sends nothing when the session setting is off', async () => {
    await underProfile(
      settings((s) => { s.session.persistAuthenticatedSession = false; }),
      async () => {
        await scraperRequest(`${base}/login`);
        await scraperRequest(`${base}/next`);
      },
    );
    expect(seen.find((r) => r.url === '/next')?.headers.cookie).toBeUndefined();
  });

  it('keeps one jar per job rather than one for the process', async () => {
    await underProfile(
      settings((s) => { s.session.persistAuthenticatedSession = true; }),
      () => scraperRequest(`${base}/login`),
    );
    await underProfile(
      settings((s) => { s.session.persistAuthenticatedSession = true; }),
      () => scraperRequest(`${base}/next`),
    );
    expect(seen.find((r) => r.url === '/next')?.headers.cookie).toBeUndefined();
  });

  it('sends one identity for every request of a consistent job', async () => {
    await underProfile(
      settings((s) => {
        s.network.userAgent = '';
        s.session.consistentFingerprint = true;
      }),
      async () => {
        await scraperRequest(`${base}/a`);
        await scraperRequest(`${base}/b`);
        await scraperRequest(`${base}/c`);
      },
    );
    const agents = new Set(seen.map((r) => r.headers['user-agent']));
    expect(agents.size).toBe(1);
    expect(SCRAPER_FINGERPRINTS).toContain([...agents][0]);
  });

  it('sends the profile’s own agent when one is named', async () => {
    await underProfile(
      settings((s) => {
        s.network.userAgent = 'StudyOS-Scraper/9.9';
        s.session.consistentFingerprint = false;
      }),
      () => scraperRequest(`${base}/a`),
    );
    expect(seen[0].headers['user-agent']).toBe('StudyOS-Scraper/9.9');
  });
});
