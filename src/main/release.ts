import { app, ipcMain } from 'electron';
import {
  compareVersions,
  GITHUB_RELEASES_LATEST,
  normalizeVersion,
  parseReleaseHighlights,
  type AppReleaseInfo,
} from '../shared/release';

async function fetchLatestRelease(): Promise<AppReleaseInfo | null> {
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
    const data = (await res.json()) as {
      tag_name?: string;
      name?: string;
      body?: string;
      html_url?: string;
    };
    const version = normalizeVersion(data.tag_name ?? '');
    if (!version) return null;
    const current = normalizeVersion(app.getVersion());
    if (compareVersions(version, current) <= 0) return null;
    return {
      version,
      title: data.name?.trim() || `v${version}`,
      summary: parseReleaseHighlights(data.body ?? ''),
      body: data.body ?? '',
      url: data.html_url ?? `https://github.com/vasars2024-hub/jp-study-app/releases/tag/v${version}`,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function registerReleaseIpc(): void {
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('release:check', () => fetchLatestRelease());
}
