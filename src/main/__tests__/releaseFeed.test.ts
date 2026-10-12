// @vitest-environment node
/**
 * The release feed behind every update check: which URL (and never the real
 * GitHub under the headless harness), what each answer means, and why a check
 * failed — offline, GitHub's rate limit, a 404, an answer that is not a release.
 */
import { describe, expect, it } from 'vitest';
import {
  UPDATE_FEED_ENV,
  fetchChannelRelease,
  rateLimitOf,
  resolveUpdateFeed,
  squirrelFeedForRelease,
} from '../releaseFeed';
import { GITHUB_API_REPO_BASE, type FeedRelease } from '../../shared/release';

const FAKE = 'http://127.0.0.1:5123/repos/vasars2024-hub/jp-study-app';

function res(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
  };
}

function fetcher(answer: (url: string) => ReturnType<typeof res> | Error) {
  const urls: string[] = [];
  const impl = async (url: string) => {
    urls.push(url);
    const a = answer(url);
    if (a instanceof Error) throw a;
    return a;
  };
  return { impl, urls };
}

const github = resolveUpdateFeed({}, false);
const release = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  name: `Gum ${tag}`,
  body: 'notes',
  html_url: `https://github.com/vasars2024-hub/jp-study-app/releases/tag/${tag}`,
  draft: false,
  prerelease: false,
  ...extra,
});

describe('which feed', () => {
  it('a normal run reads GitHub and ignores the override', () => {
    expect(resolveUpdateFeed({ [UPDATE_FEED_ENV]: FAKE }, false)).toEqual({ apiBase: GITHUB_API_REPO_BASE, source: 'github' });
  });

  it('the headless harness reads its loopback fake, and nothing at all without one', () => {
    expect(resolveUpdateFeed({ [UPDATE_FEED_ENV]: `${FAKE}/` }, true)).toEqual({ apiBase: FAKE, source: 'override' });
    expect(resolveUpdateFeed({}, true)).toEqual({ apiBase: null, source: 'disabled' });
    // Only loopback: a typo or an injected value cannot point checks at another host.
    expect(resolveUpdateFeed({ [UPDATE_FEED_ENV]: 'https://evil.example/repos/x/y' }, true).source).toBe('disabled');
    expect(resolveUpdateFeed({ [UPDATE_FEED_ENV]: 'http://127.0.0.1.evil.example:80/x' }, true).source).toBe('disabled');
  });

  it('a disabled feed answers without any request', async () => {
    const f = fetcher(() => new Error('must not be called'));
    expect(await fetchChannelRelease({ apiBase: null, source: 'disabled' }, 'stable', f.impl)).toEqual({ kind: 'failed', reason: 'disabled' });
    expect(f.urls).toEqual([]);
  });
});

describe('what an answer means', () => {
  it('stable reads /releases/latest', async () => {
    const f = fetcher(() => res(200, release('v1.2.0')));
    const r = await fetchChannelRelease(github, 'stable', f.impl);
    expect(f.urls).toEqual([`${GITHUB_API_REPO_BASE}/releases/latest`]);
    expect(r).toMatchObject({ kind: 'ok', release: { version: '1.2.0', tag: 'v1.2.0', prerelease: false } });
  });

  it('beta reads the list: highest version, pre-releases in, drafts and junk tags out', async () => {
    const f = fetcher(() => res(200, [
      release('v1.2.0'),
      release('v1.3.0-beta.2', { prerelease: true }),
      release('v1.3.0-beta.10', { prerelease: true }),
      release('v9.9.9', { draft: true }),
      release('nightly-2026', { prerelease: true }),
    ]));
    const r = await fetchChannelRelease({ apiBase: FAKE, source: 'override' }, 'beta', f.impl);
    expect(f.urls[0]).toBe(`${FAKE}/releases?per_page=30`);
    expect(r).toMatchObject({ kind: 'ok', release: { version: '1.3.0-beta.10', prerelease: true } });
  });

  it('no releases: 404 on latest, an empty list on beta', async () => {
    expect(await fetchChannelRelease(github, 'stable', fetcher(() => res(404, { message: 'Not Found' })).impl)).toEqual({ kind: 'none' });
    expect(await fetchChannelRelease(github, 'beta', fetcher(() => res(200, [])).impl)).toEqual({ kind: 'none' });
  });

  it('offline, a server error, and an answer that is not a release are told apart', async () => {
    expect(await fetchChannelRelease(github, 'stable', fetcher(() => new TypeError('fetch failed')).impl)).toEqual({ kind: 'failed', reason: 'offline' });
    expect(await fetchChannelRelease(github, 'stable', fetcher(() => res(502, {})).impl)).toEqual({ kind: 'failed', reason: 'http' });
    expect(await fetchChannelRelease(github, 'stable', fetcher(() => res(200, '<html>')).impl)).toEqual({ kind: 'failed', reason: 'invalid' });
    expect(await fetchChannelRelease(github, 'stable', fetcher(() => res(200, release('latest-build'))).impl)).toEqual({ kind: 'failed', reason: 'invalid' });
  });

  it('GitHub\'s rate limit: 403 with the limit spent (reset time kept), 429 with retry-after', async () => {
    const now = 1_700_000_000_000;
    const limited = fetcher(() => res(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(now / 1000 + 1800) }));
    expect(await fetchChannelRelease(github, 'stable', limited.impl, () => now)).toEqual({ kind: 'failed', reason: 'rate-limited', retryAt: now + 1_800_000 });
    const tooMany = fetcher(() => res(429, {}, { 'retry-after': '60' }));
    expect(await fetchChannelRelease(github, 'stable', tooMany.impl, () => now)).toEqual({ kind: 'failed', reason: 'rate-limited', retryAt: now + 60_000 });
    // A 403 that is not the rate limit (a blocked token, a proxy) is just an HTTP failure.
    expect(rateLimitOf(res(403, {}, { 'x-ratelimit-remaining': '12' }), now)).toEqual({ limited: false });
  });

  it('a release link outside this project\'s releases is replaced by the tag page', async () => {
    const r = await fetchChannelRelease(github, 'stable', fetcher(() => res(200, release('v1.2.0', { html_url: 'javascript:alert(1)' }))).impl);
    expect(r.kind === 'ok' && r.release.url).toBe('https://github.com/vasars2024-hub/jp-study-app/releases/tag/v1.2.0');
    const other = await fetchChannelRelease(github, 'stable', fetcher(() => res(200, release('v1.2.0', { html_url: 'https://github.com/someone/else/releases/tag/v1.2.0' }))).impl);
    expect(other.kind === 'ok' && other.release.url).toBe('https://github.com/vasars2024-hub/jp-study-app/releases/tag/v1.2.0');
  });
});

describe('Squirrel feed per channel', () => {
  const pre: FeedRelease = { tag: 'v1.3.0-beta.1', version: '1.3.0-beta.1', name: 'b', body: '', url: '', prerelease: true };
  it('stable keeps the latest-release redirect; beta pins the picked tag', () => {
    expect(squirrelFeedForRelease('https://x/latest/download', 'stable', pre)).toBe('https://x/latest/download');
    expect(squirrelFeedForRelease('https://x/latest/download', 'beta', pre)).toBe(
      'https://github.com/vasars2024-hub/jp-study-app/releases/download/v1.3.0-beta.1',
    );
  });
});
