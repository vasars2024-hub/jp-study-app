/**
 * Background self-update for a Squirrel install, through Electron's built-in
 * `autoUpdater` (Squirrel.Windows' Update.exe underneath).
 *
 * The feed is GitHub's "latest release" download redirect. Squirrel requests
 * `<feed>/RELEASES`, which GitHub redirects to the RELEASES asset of the latest
 * release, then `<feed>/<name>-<version>-full.nupkg` the same way. So a release is
 * updatable when it carries the three files `electron-forge make` writes to
 * `out/make/squirrel.windows/x64/`: `RELEASES`, the `-full.nupkg`, and the Setup
 * exe for new users (README "Publishing a release"). No update server.
 *
 * Only an installed copy updates itself. The zip build has no Update.exe beside it,
 * so it keeps the existing behaviour — `release.ts` checks GitHub and the renderer
 * posts a notice linking the release page — and this module stays idle.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AppUpdateStateKind, AppUpdateStatus, InstallKind } from '../shared/appUpdate';
import { GITHUB_OWNER, GITHUB_REPO } from '../shared/release';
import { updateExePath } from './squirrelEvents';

export const SQUIRREL_FEED_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download`;

/** Squirrel holds a lock on the install for a while after `--squirrel-firstrun`. */
export const FIRST_CHECK_DELAY_MS = 60_000;
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Installed = a Squirrel layout: `<root>\app-<version>\<exe>` with `<root>\Update.exe`.
 * Anything else packaged is the portable zip.
 */
export function detectInstallKind(
  execPath: string,
  isPackaged: boolean,
  platform: string = process.platform,
  exists: (p: string) => boolean = fs.existsSync,
): InstallKind {
  if (!isPackaged) return 'dev';
  if (platform !== 'win32') return 'portable';
  const inVersionDir = /^app-\d/i.test(path.basename(path.dirname(execPath)));
  return inVersionDir && exists(updateExePath(execPath)) ? 'installed' : 'portable';
}

/** The slice of Electron's `autoUpdater` this uses — injectable for tests. */
export interface UpdaterLike {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  setFeedURL(options: { url: string }): void;
  checkForUpdates(): void;
  quitAndInstall(): void;
}

export interface AppUpdateControllerDeps {
  install: InstallKind;
  updater: UpdaterLike;
  /** Push a status change to every window. */
  broadcast: (status: AppUpdateStatus) => void;
  feedUrl?: string;
  log?: (message: string) => void;
  /**
   * Flag the app as really quitting. quitAndInstall() closes the windows before
   * efore-quit, and the tray-mode close handler hides a window unless the quit
   * flag is already set — so the restart would otherwise do nothing.
   */
  markQuitting?: () => void;
  setTimer?: (fn: () => void, ms: number, repeat: boolean) => void;
}

export interface AppUpdateController {
  status(): AppUpdateStatus;
  /** Wire the updater and arm the checks. A no-op unless installed. */
  start(): void;
  check(): void;
  /** Quit and apply a downloaded update. `false` when there is none to apply. */
  restart(): boolean;
}

export function createAppUpdateController(deps: AppUpdateControllerDeps): AppUpdateController {
  let state: AppUpdateStateKind = 'idle';
  let version: string | undefined;
  let started = false;

  const status = (): AppUpdateStatus => ({ install: deps.install, state, ...(version ? { version } : {}) });
  const set = (next: AppUpdateStateKind, nextVersion?: string) => {
    state = next;
    if (nextVersion !== undefined) version = nextVersion;
    deps.broadcast(status());
  };

  const check = () => {
    if (deps.install !== 'installed' || !started) return;
    // Once downloaded, Squirrel has staged it; another check would only re-download.
    if (state === 'checking' || state === 'downloading' || state === 'downloaded') return;
    try {
      deps.updater.checkForUpdates();
    } catch (err) {
      deps.log?.(`[update] check failed: ${err instanceof Error ? err.message : String(err)}`);
      set('error');
    }
  };

  return {
    status,
    check,
    start() {
      if (deps.install !== 'installed' || started) return;
      started = true;
      const u = deps.updater;
      u.on('checking-for-update', () => set('checking'));
      u.on('update-available', () => set('downloading'));
      u.on('update-not-available', () => set('idle'));
      u.on('before-quit-for-update', () => deps.markQuitting?.());
      u.on('update-downloaded', (...args: unknown[]) => {
        // (event, releaseNotes, releaseName, …) — on Windows only releaseName is set.
        const name = typeof args[2] === 'string' && args[2].trim() ? args[2].trim() : undefined;
        set('downloaded', name);
      });
      u.on('error', (err: unknown) => {
        // The usual cause is a release without RELEASES/nupkg assets, or offline.
        // Silent to the user: the GitHub notice path still covers a newer release.
        deps.log?.(`[update] ${err instanceof Error ? err.message : String(err)}`);
        if (state !== 'downloaded') set('error');
      });
      try {
        u.setFeedURL({ url: deps.feedUrl ?? SQUIRREL_FEED_URL });
      } catch (err) {
        deps.log?.(`[update] setFeedURL failed: ${err instanceof Error ? err.message : String(err)}`);
        started = false;
        return;
      }
      const timer = deps.setTimer ?? ((fn, ms, repeat) => {
        const t = repeat ? setInterval(fn, ms) : setTimeout(fn, ms);
        t.unref?.();
      });
      timer(check, FIRST_CHECK_DELAY_MS, false);
      timer(check, CHECK_INTERVAL_MS, true);
    },
    restart() {
      if (state !== 'downloaded') return false;
      deps.markQuitting?.();
      deps.updater.quitAndInstall();
      return true;
    },
  };
}
