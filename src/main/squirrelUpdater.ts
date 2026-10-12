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
import {
  classifyUpdateError,
  DEFAULT_APP_UPDATE_PREFS,
  sanitizeAppUpdatePrefs,
  type AppUpdateChannel,
  type AppUpdateDetails,
  type AppUpdateErrorCode,
  type AppUpdatePrefs,
  type AppUpdateRestartResult,
  type AppUpdateStateKind,
  type AppUpdateStatus,
  type AppUpdateUnsavedKind,
  type InstallKind,
} from '../shared/appUpdate';
import { compareVersions, GITHUB_OWNER, GITHUB_REPO } from '../shared/release';
import { squirrelFeedForRelease, type FeedFetch } from './releaseFeed';
import { updateExePath } from './squirrelEvents';

export const SQUIRREL_FEED_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download`;

/**
 * The repository `forge.config.ts` hands MakerSquirrel as `remoteReleases`, so
 * `make` downloads the previous release and writes a `-delta.nupkg` beside the
 * full one. It is the repo URL, not the feed: Squirrel's SyncReleases treats a
 * github.com URL as `owner/repo` and asks the GitHub API for its latest release.
 * `squirrelFeed.test.ts` pins forge.config.ts to this value.
 */
export const SQUIRREL_REMOTE_RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;

/** What Update.exe actually fetches first: `<feed>/RELEASES`. */
export function squirrelReleasesUrl(feedUrl: string = SQUIRREL_FEED_URL): string {
  return `${feedUrl.replace(/\/+$/, '')}/RELEASES`;
}

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
  /** The running version, for the update panel. */
  currentVersion?: string;
  /** Every change, in the panel's richer shape (`appUpdate:details`). */
  broadcastDetails?: (details: AppUpdateDetails) => void;
  /**
   * Staged-rollout guard: true = Windows reports a metered connection, so the
   * AUTOMATIC check (which downloads the whole package) is skipped; null = cannot
   * tell, which checks as before. "Check now" never asks — it is the user's call.
   */
  isMetered?: () => Promise<boolean | null>;
  /** Where the last check time survives a restart. */
  lastCheckedStore?: { load(): number | null; save(at: number): void };
  now?: () => number;
  /** Channel + skipped version, kept beside the last check time. Absent: stable, nothing skipped. */
  prefsStore?: { load(): AppUpdatePrefs; save(prefs: AppUpdatePrefs): void };
  /**
   * Read the channel's release from the feed BEFORE Squirrel is asked. With it, a
   * check that finds nothing newer (or only the skipped version) never starts
   * Update.exe, and beta points Squirrel at the picked pre-release's assets.
   * Without it, every check goes straight to Squirrel (the old behaviour).
   */
  resolveRelease?: (channel: AppUpdateChannel) => Promise<FeedFetch>;
  /** What a restart would cut short (a recording); a restart asks first when it is not empty. */
  unsavedWork?: () => AppUpdateUnsavedKind[];
}

export interface AppUpdateController {
  status(): AppUpdateStatus;
  details(): AppUpdateDetails;
  /** Wire the updater and arm the checks. A no-op unless installed. */
  start(): void;
  check(): void;
  /** The user pressed "Check now": no metered guard. Returns the new details. */
  checkNow(): AppUpdateDetails;
  /** Quit and apply a downloaded update. `false` when there is none to apply. */
  restart(): boolean;
  /**
   * The panel's "Restart to update": refuses (and says what) while a window
   * reports unsaved work, unless `force` — the user has seen the warning.
   */
  requestRestart(force?: boolean): AppUpdateRestartResult;
  prefs(): AppUpdatePrefs;
  /** Change channel / skipped version. A channel change forgets the last check's answer. */
  setPrefs(patch: Partial<AppUpdatePrefs>): AppUpdateDetails;
}

export function createAppUpdateController(deps: AppUpdateControllerDeps): AppUpdateController {
  let state: AppUpdateStateKind = 'idle';
  let version: string | undefined;
  let started = false;
  let error: AppUpdateErrorCode | undefined;
  let downloadStartedAt: number | undefined;
  let skippedMetered = false;
  let lastCheckedAt: number | null = (() => {
    try {
      return deps.lastCheckedStore?.load() ?? null;
    } catch {
      return null;
    }
  })();
  const now = deps.now ?? Date.now;
  let prefs: AppUpdatePrefs = (() => {
    try {
      return sanitizeAppUpdatePrefs(deps.prefsStore?.load() ?? DEFAULT_APP_UPDATE_PREFS);
    } catch {
      return { ...DEFAULT_APP_UPDATE_PREFS };
    }
  })();
  const stableFeed = deps.feedUrl ?? SQUIRREL_FEED_URL;
  let activeFeed = stableFeed;
  let latestVersion: string | undefined;
  /** Bumped by a channel change, so a feed answer for the old channel is dropped. */
  let checkEpoch = 0;

  const status = (): AppUpdateStatus => ({ install: deps.install, state, ...(version ? { version } : {}) });
  const details = (): AppUpdateDetails => ({
    ...status(),
    current: deps.currentVersion ?? '',
    channel: prefs.channel,
    feedUrl: activeFeed,
    lastCheckedAt,
    skippedVersion: prefs.skippedVersion,
    ...(latestVersion ? { latestVersion } : {}),
    ...(state === 'downloading' && downloadStartedAt ? { downloadStartedAt } : {}),
    ...(state === 'error' ? { error: error ?? 'unknown' } : {}),
    ...(skippedMetered ? { skippedMetered: true } : {}),
  });
  const pushDetails = () => {
    try {
      deps.broadcastDetails?.(details());
    } catch {
      /* a closed window */
    }
  };
  const set = (next: AppUpdateStateKind, nextVersion?: string) => {
    state = next;
    if (nextVersion !== undefined) version = nextVersion;
    if (next !== 'error') error = undefined;
    if (next === 'downloading') downloadStartedAt = now();
    deps.broadcast(status());
    pushDetails();
  };
  const fail = (message: string) => {
    error = classifyUpdateError(message);
    set('error');
  };

  const check = () => {
    if (deps.install !== 'installed' || !started) return;
    // Once downloaded, Squirrel has staged it; another check would only re-download.
    if (state === 'checking' || state === 'downloading' || state === 'downloaded') return;
    lastCheckedAt = now();
    try {
      deps.lastCheckedStore?.save(lastCheckedAt);
    } catch {
      /* the time is still right for this session */
    }
    if (!deps.resolveRelease) {
      askSquirrel();
      return;
    }
    // Feed first: Squirrel (and its several-hundred-MB download) only for a
    // newer release on this channel that the user has not skipped.
    const epoch = ++checkEpoch;
    set('checking');
    void deps.resolveRelease(prefs.channel).then(
      (answer) => {
        if (epoch !== checkEpoch || state !== 'checking') return;
        if (answer.kind === 'none') {
          latestVersion = undefined;
          set('idle');
          return;
        }
        if (answer.kind === 'failed') {
          if (answer.reason === 'disabled') {
            set('idle');
            return;
          }
          // Stable can still ask Squirrel (its feed is a download redirect, not the
          // rate-limited API); beta cannot know which tag to fetch.
          if (prefs.channel === 'stable') {
            askSquirrel();
            return;
          }
          fail(answer.reason === 'offline' ? 'network: release feed unreachable' : `release feed: ${answer.reason}`);
          return;
        }
        latestVersion = answer.release.version;
        const current = deps.currentVersion ?? '';
        if (current && compareVersions(answer.release.version, current) <= 0) {
          set('idle');
          return;
        }
        if (prefs.skippedVersion && prefs.skippedVersion === answer.release.version) {
          deps.log?.(`[update] ${answer.release.version} is skipped; not downloading it`);
          set('idle');
          return;
        }
        const feed = squirrelFeedForRelease(stableFeed, prefs.channel, answer.release);
        if (feed !== activeFeed) {
          try {
            deps.updater.setFeedURL({ url: feed });
            activeFeed = feed;
          } catch (err) {
            fail(err instanceof Error ? err.message : String(err));
            return;
          }
        }
        askSquirrel();
      },
      (err: unknown) => {
        if (epoch !== checkEpoch) return;
        fail(err instanceof Error ? err.message : String(err));
      },
    );
  };

  const askSquirrel = () => {
    try {
      deps.updater.checkForUpdates();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.log?.(`[update] check failed: ${message}`);
      fail(message);
      return;
    }
    pushDetails();
  };

  /** Timer-driven: asks the metered guard first when there is one. */
  const autoCheck = () => {
    if (!deps.isMetered) {
      check();
      return;
    }
    void deps.isMetered().then(
      (metered) => {
        if (metered === true) {
          skippedMetered = true;
          deps.log?.('[update] automatic check skipped: metered connection');
          pushDetails();
          return;
        }
        skippedMetered = false;
        check();
      },
      () => check(),
    );
  };

  return {
    status,
    details,
    check,
    checkNow() {
      skippedMetered = false;
      check();
      return details();
    },
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
        // The panel shows it translated (`upd2.error.<code>`); no toast.
        const message = err instanceof Error ? err.message : String(err);
        deps.log?.(`[update] ${message}`);
        if (state !== 'downloaded') fail(message);
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
      timer(autoCheck, FIRST_CHECK_DELAY_MS, false);
      timer(autoCheck, CHECK_INTERVAL_MS, true);
    },
    restart() {
      if (state !== 'downloaded') return false;
      deps.markQuitting?.();
      deps.updater.quitAndInstall();
      return true;
    },
    requestRestart(force = false): AppUpdateRestartResult {
      if (state !== 'downloaded') return { ok: false, reason: 'not-downloaded' };
      if (!force) {
        let unsaved: AppUpdateUnsavedKind[] = [];
        try {
          unsaved = deps.unsavedWork?.() ?? [];
        } catch {
          unsaved = [];
        }
        if (unsaved.length) return { ok: false, reason: 'unsaved', unsaved };
      }
      deps.markQuitting?.();
      deps.updater.quitAndInstall();
      return { ok: true };
    },
    prefs: () => ({ ...prefs }),
    setPrefs(patch) {
      const next = sanitizeAppUpdatePrefs(patch, prefs);
      const channelChanged = next.channel !== prefs.channel;
      prefs = next;
      try {
        deps.prefsStore?.save(prefs);
      } catch (err) {
        deps.log?.(`[update] could not save update preferences: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (channelChanged) {
        // The last answer was another channel's; a feed answer still on its way is too.
        checkEpoch += 1;
        latestVersion = undefined;
        if (state === 'checking' && deps.resolveRelease) set('idle');
      }
      pushDetails();
      return details();
    },
  };
}
