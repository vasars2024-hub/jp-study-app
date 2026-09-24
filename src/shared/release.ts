export const GITHUB_OWNER = 'vasars2024-hub';
export const GITHUB_REPO = 'jp-study-app';
export const GITHUB_RELEASES_LATEST = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

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

export interface ReleaseStatus {
  kind: ReleaseStatusKind;
  current: string;
  latest?: string;
  url?: string;
  checkedAt: number;
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
