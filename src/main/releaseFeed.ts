/**
 * The release feed every update check reads: GitHub's REST API for this
 * repository (`/releases/latest` on the stable channel, `/releases` on beta).
 *
 * No Electron import, so the whole decision — which URL, what an answer means,
 * why a check failed — is testable in node.
 *
 * Under the headless E2E harness (`GUM_E2E_HEADLESS`) the app must never reach
 * the real GitHub: the feed is `GUM_UPDATE_FEED_URL` (a loopback fake the
 * harness runs) or, without one, switched off. Outside the harness that
 * variable is ignored, so it cannot redirect a user's update checks.
 */
import {
  GITHUB_API_REPO_BASE,
  GITHUB_OWNER,
  GITHUB_REPO,
  parseFeedRelease,
  pickChannelRelease,
  type FeedRelease,
  type ReleaseChannel,
  type ReleaseUnavailableReason,
} from '../shared/release';

export const UPDATE_FEED_ENV = 'GUM_UPDATE_FEED_URL';
export const FEED_TIMEOUT_MS = 15_000;

export interface UpdateFeed {
  /** `<base>/releases[/latest]`; null = checks are off. */
  apiBase: string | null;
  source: 'github' | 'override' | 'disabled';
}

/** Loopback only: a typo in the override must not send a request somewhere new. */
const LOOPBACK_FEED_RE = /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d{1,5}(?:\/[^\s?#]*)?$/i;

export function resolveUpdateFeed(env: Record<string, string | undefined>, headless: boolean): UpdateFeed {
  if (!headless) return { apiBase: GITHUB_API_REPO_BASE, source: 'github' };
  const raw = (env[UPDATE_FEED_ENV] ?? '').trim();
  if (raw && LOOPBACK_FEED_RE.test(raw)) return { apiBase: raw.replace(/\/+$/, ''), source: 'override' };
  return { apiBase: null, source: 'disabled' };
}

export type FeedFetch =
  | { kind: 'ok'; release: FeedRelease }
  /** The repository publishes no release (on this channel). */
  | { kind: 'none' }
  | { kind: 'failed'; reason: ReleaseUnavailableReason; retryAt?: number };

type FetchLike = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

/** GitHub's rate-limit answer: 403 with the limit spent, or 429. When it resets, if it said. */
export function rateLimitOf(
  res: { status: number; headers: { get(name: string): string | null } },
  now: number,
): { limited: boolean; retryAt?: number } {
  if (res.status !== 403 && res.status !== 429) return { limited: false };
  const remaining = res.headers.get('x-ratelimit-remaining');
  const retryAfter = res.headers.get('retry-after');
  const reset = res.headers.get('x-ratelimit-reset');
  const limited = res.status === 429 || remaining === '0' || retryAfter !== null;
  if (!limited) return { limited: false };
  let retryAt: number | undefined;
  if (retryAfter !== null && /^\d+$/.test(retryAfter.trim())) retryAt = now + Number(retryAfter.trim()) * 1000;
  else if (reset !== null && /^\d+$/.test(reset.trim())) retryAt = Number(reset.trim()) * 1000;
  return { limited: true, ...(retryAt && retryAt > now ? { retryAt } : {}) };
}

/** The release `channel` follows, from the feed. Never throws. */
export async function fetchChannelRelease(
  feed: UpdateFeed,
  channel: ReleaseChannel,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  now: () => number = Date.now,
  timeoutMs = FEED_TIMEOUT_MS,
): Promise<FeedFetch> {
  if (!feed.apiBase) return { kind: 'failed', reason: 'disabled' };
  const url = channel === 'beta' ? `${feed.apiBase}/releases?per_page=30` : `${feed.apiBase}/releases/latest`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await fetchImpl(url, {
        signal: ctl.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `${GITHUB_OWNER}-${GITHUB_REPO}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
    } catch {
      return { kind: 'failed', reason: 'offline' };
    }
    if (res.status === 404) return { kind: 'none' };
    const limit = rateLimitOf(res, now());
    if (limit.limited) return { kind: 'failed', reason: 'rate-limited', ...(limit.retryAt ? { retryAt: limit.retryAt } : {}) };
    if (!res.ok) return { kind: 'failed', reason: 'http' };
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { kind: 'failed', reason: ctl.signal.aborted ? 'offline' : 'invalid' };
    }
    if (channel === 'beta') {
      if (Array.isArray(body) && body.length === 0) return { kind: 'none' };
      const picked = pickChannelRelease(body, 'beta');
      return picked ? { kind: 'ok', release: picked } : { kind: 'failed', reason: 'invalid' };
    }
    const release = parseFeedRelease(body);
    return release ? { kind: 'ok', release } : { kind: 'failed', reason: 'invalid' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Where Squirrel downloads a channel's release from. Stable uses GitHub's
 * "latest release" redirect; beta pins the picked tag, since that redirect
 * never points at a pre-release.
 */
export function squirrelFeedForRelease(stableFeed: string, channel: ReleaseChannel, release: FeedRelease | null): string {
  if (channel !== 'beta' || !release) return stableFeed;
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${encodeURIComponent(release.tag)}`;
}
