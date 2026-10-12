export const GITHUB_OWNER = 'vasars2024-hub';
export const GITHUB_REPO = 'jp-study-app';
/** The GitHub API's repository root; the release feed is `<base>/releases[/latest]`. */
export const GITHUB_API_REPO_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
/** Where the project's release pages live; any link from a release payload must be under it. */
export const GITHUB_RELEASES_PAGE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;

/** stable = GitHub's latest full release; beta = the newest release, pre-releases included. */
export type ReleaseChannel = 'stable' | 'beta';

export function isReleaseChannel(value: unknown): value is ReleaseChannel {
  return value === 'stable' || value === 'beta';
}

/** `1.2.3`, `v1.2`, `1.2.3-beta.1`, `1.2.3+build` — what a release tag must look like to be compared. */
const RELEASE_VERSION_RE = /^v?\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function isReleaseVersion(tag: string): boolean {
  return RELEASE_VERSION_RE.test(String(tag ?? '').trim());
}

/** One release as the feed describes it, after validation. */
export interface FeedRelease {
  /** The tag exactly as published (`v1.2.0`), for download URLs. */
  tag: string;
  version: string;
  name: string;
  body: string;
  url: string;
  publishedAt?: string;
  prerelease: boolean;
}

/**
 * A GitHub release object, validated: a tag that is a version, strings where
 * strings belong, a release-page link only under this project's releases.
 * Drafts and anything malformed are `null` — never compared, never shown.
 */
export function parseFeedRelease(raw: unknown): FeedRelease | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.draft === true) return null;
  const tag = typeof r.tag_name === 'string' ? r.tag_name.trim() : '';
  if (!isReleaseVersion(tag)) return null;
  const version = normalizeVersion(tag);
  const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 200) : `v${version}`;
  return {
    tag,
    version,
    name,
    body: typeof r.body === 'string' ? r.body : '',
    url: safeReleaseUrl(r.html_url, version),
    ...(typeof r.published_at === 'string' ? { publishedAt: r.published_at } : {}),
    prerelease: r.prerelease === true,
  };
}

/**
 * The release-page link to hand to `openExternal`: the payload's own when it is
 * an https page of THIS project's releases, else the tag page we know. A feed
 * (or a man in the middle of it) cannot make the button open somewhere else.
 */
export function safeReleaseUrl(raw: unknown, version: string): string {
  const fallback = version ? `${GITHUB_RELEASES_PAGE}/tag/v${version}` : GITHUB_RELEASES_PAGE;
  if (typeof raw !== 'string') return fallback;
  try {
    const u = new URL(raw);
    const page = new URL(GITHUB_RELEASES_PAGE);
    if (u.protocol !== 'https:' || u.host !== page.host) return fallback;
    if (u.pathname !== page.pathname && !u.pathname.startsWith(`${page.pathname}/`)) return fallback;
    if (u.username || u.password) return fallback;
    return u.toString();
  } catch {
    return fallback;
  }
}

/** The release a channel follows, out of a `/releases` list: the highest version, pre-releases only on beta. */
export function pickChannelRelease(list: unknown, channel: ReleaseChannel): FeedRelease | null {
  if (!Array.isArray(list)) return null;
  let best: FeedRelease | null = null;
  for (const raw of list) {
    const release = parseFeedRelease(raw);
    if (!release) continue;
    if (release.prerelease && channel !== 'beta') continue;
    if (!best || compareVersions(release.version, best.version) > 0) best = release;
  }
  return best;
}

export interface AppReleaseInfo {
  version: string;
  title: string;
  summary: string;
  body: string;
  url: string;
  /** True when the GitHub app tag is newer than the running desktop build. */
  appUpdate: boolean;
  /**
   * Chrome extension version advertised in the release notes, when newer than
   * the unpacked folder currently on disk. Absent when unchanged / unparsed.
   */
  extensionUpdate?: { version: string };
  /** Manifest version currently written to the load-unpacked folder. */
  installedExtensionVersion?: string;
}

export function normalizeVersion(tag: string): string {
  return String(tag ?? '').replace(/^v/i, '').trim();
}

function splitSemver(v: string): { core: number[]; pre: string[] } {
  const [withoutBuild] = normalizeVersion(v).split('+');
  const dash = withoutBuild.indexOf('-');
  const core = (dash >= 0 ? withoutBuild.slice(0, dash) : withoutBuild).split('.').map((n) => parseInt(n, 10) || 0);
  const pre = dash >= 0 ? withoutBuild.slice(dash + 1).split('.').filter(Boolean) : [];
  return { core, pre };
}

/**
 * Semver precedence: positive if `a` is newer than `b`. A pre-release is older
 * than its release (1.1.0-beta.2 < 1.1.0), identifiers compare numerically
 * when numeric, build metadata is ignored.
 */
export function compareVersions(a: string, b: string): number {
  const pa = splitSemver(a);
  const pb = splitSemver(b);
  const len = Math.max(pa.core.length, pb.core.length, 3);
  for (let i = 0; i < len; i++) {
    const da = pa.core[i] ?? 0;
    const db = pb.core[i] ?? 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  if (!pa.pre.length || !pb.pre.length) return pa.pre.length === pb.pre.length ? 0 : pa.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const nx = /^\d+$/.test(x) ? Number(x) : NaN;
    const ny = /^\d+$/.test(y) ? Number(y) : NaN;
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) return nx > ny ? 1 : -1;
    if (!Number.isNaN(nx)) return -1;
    if (!Number.isNaN(ny)) return 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

/**
 * What the update check can honestly say:
 * - `update`      a newer release exists;
 * - `current`     this build IS the latest release;
 * - `newer`       this build is newer than the latest release (a local or
 *                 unreleased build — the case the old check hid by saying nothing);
 * - `no-releases` the repository publishes no releases, so there is nothing to check;
 * - `unavailable` the check could not be completed (offline, rate-limited).
 */
export type ReleaseStatusKind = 'update' | 'current' | 'newer' | 'no-releases' | 'unavailable';

/**
 * Why a check came back `unavailable`, so the panel can say something useful:
 *   offline       no connection / DNS / timeout
 *   rate-limited  GitHub answered 403/429 with its rate limit spent (`retryAt` when it said)
 *   http          any other non-success status
 *   invalid       an answer that is not a release (bad JSON, a tag that is not a version)
 *   disabled      checks are switched off here (a headless test run without a fake feed)
 */
export type ReleaseUnavailableReason = 'offline' | 'rate-limited' | 'http' | 'invalid' | 'disabled';

export interface ReleaseStatus {
  kind: ReleaseStatusKind;
  current: string;
  latest?: string;
  url?: string;
  checkedAt: number;
  reason?: ReleaseUnavailableReason;
  /** Epoch ms when GitHub's rate limit resets (from `x-ratelimit-reset` / `retry-after`). */
  retryAt?: number;
  channel?: ReleaseChannel;
  /** The latest release is the one the user chose to skip. */
  skipped?: boolean;
}

export function classifyRelease(current: string, latest: string | null | undefined): ReleaseStatusKind {
  if (!latest) return 'no-releases';
  const cmp = compareVersions(latest, current);
  return cmp > 0 ? 'update' : cmp === 0 ? 'current' : 'newer';
}

/** Short one-line summary from GitHub release markdown. */
export function parseReleaseHighlights(body: string, maxBullets = 4): string {
  const bullets: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^\s*[-*]\s+(.+)/);
    if (!m) continue;
    bullets.push(m[1].replace(/\*\*/g, '').replace(/`/g, '').trim());
    if (bullets.length >= maxBullets) break;
  }
  if (bullets.length) return bullets.join(' · ');
  const para = body.split(/\r?\n/).find((l) => l.trim() && !l.startsWith('#'));
  return para?.trim().slice(0, 220) || 'A new version is available.';
}

/**
 * Pull a Chrome-extension semver out of release notes when authors advertise it
 * separately from the desktop tag (e.g. `extension: 3.2.0`).
 */
export function parseExtensionVersionFromBody(body: string): string | null {
  const text = String(body || '');
  const patterns = [
    /(?:^|\n)\s*(?:chrome\s+)?extension(?:\s+version)?\s*[:=]\s*v?(\d+\.\d+(?:\.\d+)?)/i,
    /(?:^|\n)\s*reader\s+companion\s*[:=]?\s*v?(\d+\.\d+(?:\.\d+)?)/i,
    /(?:^|\n)\s*[-*]\s+(?:chrome\s+)?extension\s+v?(\d+\.\d+(?:\.\d+)?)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return normalizeVersion(m[1]);
  }
  return null;
}
