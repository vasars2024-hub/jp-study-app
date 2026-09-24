import { app, ipcMain } from 'electron';
import {
  classifyRelease,
  compareVersions,
  GITHUB_OWNER,
  GITHUB_RELEASES_LATEST,
  GITHUB_REPO,
  normalizeVersion,
  parseExtensionVersionFromBody,
  parseReleaseHighlights,
  type AppReleaseInfo,
  type ReleaseStatus,
} from '../shared/release';
import { readInstalledExtensionVersion } from './extensionInstall';

interface GitHubLatestPayload {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
}

type LatestFetch =
  | { kind: 'ok'; data: GitHubLatestPayload }
  /** 404 from /releases/latest: the repository publishes no releases. */
  | { kind: 'none' }
  | { kind: 'failed' };

async function fetchGithubLatestDetailed(): Promise<LatestFetch> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(GITHUB_RELEASES_LATEST, {
      signal: ctl.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'jp-study-app',
      },
    });
    if (res.status === 404) return { kind: 'none' };
    if (!res.ok) return { kind: 'failed' };
    return { kind: 'ok', data: (await res.json()) as GitHubLatestPayload };
  } catch {
    return { kind: 'failed' };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGithubLatest(): Promise<GitHubLatestPayload | null> {
  const r = await fetchGithubLatestDetailed();
  return r.kind === 'ok' ? r.data : null;
}

/**
 * The honest answer for Settings > Help. The notification path below only
 * speaks when there is something newer; this one also says "you are on the
 * latest", "your build is newer than the latest release" (the audit found
 * v1.0.1 locally vs v1.0.0 published, where the old check just stayed silent),
 * or "this project publishes no releases" so the UI can hide the control.
 */
export async function getReleaseStatus(
  current = app.getVersion(),
  fetchLatest: () => Promise<LatestFetch> = fetchGithubLatestDetailed,
): Promise<ReleaseStatus> {
  const checkedAt = Date.now();
  const r = await fetchLatest();
  const cur = normalizeVersion(current);
  if (r.kind === 'failed') return { kind: 'unavailable', current: cur, checkedAt };
  if (r.kind === 'none') return { kind: 'no-releases', current: cur, checkedAt };
  const latest = normalizeVersion(r.data.tag_name ?? '');
  const kind = classifyRelease(cur, latest || null);
  return {
    kind,
    current: cur,
    latest: latest || undefined,
    url: r.data.html_url ?? (latest ? `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/v${latest}` : undefined),
    checkedAt,
  };
}

/**
 * Check GitHub latest for a newer desktop build and/or a newer Chrome extension
 * version advertised in the release body. Returns null only when the network
 * fails or there is nothing newer than what is installed.
 */
async function fetchLatestRelease(): Promise<AppReleaseInfo | null> {
  const data = await fetchGithubLatest();
  if (!data) return null;

  const version = normalizeVersion(data.tag_name ?? '');
  if (!version) return null;

  const currentApp = normalizeVersion(app.getVersion());
  const appUpdate = compareVersions(version, currentApp) > 0;
  const installedExtensionVersion = readInstalledExtensionVersion() ?? undefined;
  const releaseExtension = parseExtensionVersionFromBody(data.body ?? '');
  const extensionUpdate =
    releaseExtension &&
    (!installedExtensionVersion || compareVersions(releaseExtension, installedExtensionVersion) > 0)
      ? { version: releaseExtension }
      : undefined;

  if (!appUpdate && !extensionUpdate) return null;

  const url = data.html_url ?? `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/v${version}`;
  return {
    version,
    title: data.name?.trim() || `v${version}`,
    summary: parseReleaseHighlights(data.body ?? ''),
    body: data.body ?? '',
    url,
    appUpdate,
    extensionUpdate,
    installedExtensionVersion,
  };
}

export function registerReleaseIpc(): void {
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('release:check', () => fetchLatestRelease());
  ipcMain.handle('release:status', () => getReleaseStatus());
}
