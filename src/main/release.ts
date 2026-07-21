import { app, ipcMain } from 'electron';
import {
  compareVersions,
  GITHUB_RELEASES_LATEST,
  normalizeVersion,
  parseExtensionVersionFromBody,
  parseReleaseHighlights,
  type AppReleaseInfo,
} from '../shared/release';
import { readInstalledExtensionVersion } from './extensionInstall';

interface GitHubLatestPayload {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
}

async function fetchGithubLatest(): Promise<GitHubLatestPayload | null> {
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
    if (!res.ok) return null;
    return (await res.json()) as GitHubLatestPayload;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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

  const url = data.html_url ?? `https://github.com/vasars2024-hub/jp-study-app/releases/tag/v${version}`;
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
}
