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

/** Returns positive if `a` is newer than `b`. */
export function compareVersions(a: string, b: string): number {
  const pa = normalizeVersion(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = normalizeVersion(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
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
