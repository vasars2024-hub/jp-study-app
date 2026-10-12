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
 * With a `downloader` (main/updateDownloader.ts, wired in main/release.ts) Gum
 * fetches RELEASES and the package itself — byte progress, Cancel, a Range resume,
 * SHA1 + size checked against RELEASES — into a staging folder beside Squirrel's
 * packages, then points `autoUpdater` at that folder: Update.exe reads a local
 * directory as a release source, copies the verified package and applies it.
 * Electron's Windows `autoUpdater` exposes neither progress nor cancel, so this is
 * the only way to show either. A RELEASES the downloader does not handle (absolute
 * URLs) falls back to Squirrel downloading by itself, as before.
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
  type AppUpdateDownload,
  type AppUpdateErrorCode,
  type AppUpdateHistoryEntry,
  type AppUpdatePaused,
  type AppUpdatePrefs,
  type AppUpdateRestartResult,
  type AppUpdateStateKind,
  type AppUpdateStatus,
  type AppUpdateUnsavedKind,
  type AppUpdateWhatsNew,
  type InstallKind,
} from '../shared/appUpdate';
import { compareVersions, GITHUB_OWNER, GITHUB_REPO, type FeedRelease } from '../shared/release';
import { squirrelFeedForRelease, type FeedFetch } from './releaseFeed';
import { updateExePath } from './squirrelEvents';
import type { UpdateDownloadErrorCode, UpdateDownloadJob, UpdateDownloadProgress } from './updateDownloader';

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
  /**
   * Gum's own download (main/updateDownloader.ts): byte progress, cancel, resume,
   * SHA1 check, then the staging folder is handed to Squirrel as a local feed.
   * Without it (or for a RELEASES it cannot handle) Squirrel downloads by itself.
   */
  downloader?: UpdateDownloaderLike;
  /** Versions this copy has run and a pending "What's new" (main/updateHistory.ts). */
  history?: () => { history: AppUpdateHistoryEntry[]; whatsNew: AppUpdateWhatsNew | null };
}

export interface UpdateDownloaderLike {
  start(request: {
    release: FeedRelease;
    channel: AppUpdateChannel;
    /** Ignore delta packages (Squirrel failed to apply them). */
    fullOnly: boolean;
    onProgress: (progress: UpdateDownloadProgress) => void;
  }): UpdateDownloadJob;
  /** Remove the staging folder (Squirrel has copied the packages, or they are stale). */
  clear(): void;
}

/** Progress reaches the panel at most this often (phase changes go at once). */
export const PROGRESS_PUSH_MS = 250;

const DOWNLOAD_ERROR_CODES: Record<Exclude<UpdateDownloadErrorCode, 'canceled' | 'unsupported'>, AppUpdateErrorCode> = {
  network: 'network',
  checksum: 'checksum',
  'no-feed': 'no-feed',
  disk: 'disk',
};

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
  /**
   * Stop Gum's own download; what has arrived stays on disk and "Check now"
   * resumes it. `false` when there is nothing cancellable (Squirrel's own
   * download, verifying, or already handed to Update.exe).
   */
  cancelDownload(): boolean;
  /** Re-send the details (the history or "What's new" changed). */
  refresh(): AppUpdateDetails;
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

  // Gum's own download (deps.downloader).
  let download: AppUpdateDownload | undefined;
  let activeJob: UpdateDownloadJob | null = null;
  let activeRelease: FeedRelease | null = null;
  /** Why the running job is being cancelled: the user (keep it for Resume) or a channel change. */
  let cancelReason: 'user' | 'channel' | null = null;
  let paused: AppUpdatePaused | undefined;
  let partialBytes: number | undefined;
  /** Set while Update.exe applies a staged download: its events mean that, not a new check. */
  let handoff: { version: string; deltas: boolean; fullOnly: boolean } | null = null;
  let lastProgressPush = 0;

  const historyNow = () => {
    try {
      return deps.history?.() ?? null;
    } catch {
      return null;
    }
  };

  const status = (): AppUpdateStatus => ({ install: deps.install, state, ...(version ? { version } : {}) });
  const details = (): AppUpdateDetails => {
    const h = historyNow();
    return {
      ...status(),
      current: deps.currentVersion ?? '',
      channel: prefs.channel,
      feedUrl: activeFeed,
      lastCheckedAt,
      skippedVersion: prefs.skippedVersion,
      ...(latestVersion ? { latestVersion } : {}),
      ...(state === 'downloading' && downloadStartedAt ? { downloadStartedAt } : {}),
      ...(state === 'downloading' && download ? { download: { ...download } } : {}),
      ...(state === 'error' ? { error: error ?? 'unknown' } : {}),
      ...(state === 'error' && partialBytes ? { partialBytes } : {}),
      ...(state === 'idle' && paused ? { paused: { ...paused } } : {}),
      ...(skippedMetered ? { skippedMetered: true } : {}),
      ...(h ? { history: h.history, whatsNew: h.whatsNew } : {}),
    };
  };
  const pushDetails = () => {
    try {
      deps.broadcastDetails?.(details());
    } catch {
      /* a closed window */
    }
  };
  const set = (next: AppUpdateStateKind, nextVersion?: string) => {
    if (next === 'downloading' && state !== 'downloading') downloadStartedAt = now();
    state = next;
    if (nextVersion !== undefined) version = nextVersion;
    if (next !== 'error') error = undefined;
    if (next !== 'downloading') download = undefined;
    lastProgressPush = now();
    deps.broadcast(status());
    pushDetails();
  };
  const fail = (message: string) => {
    error = classifyUpdateError(message);
    set('error');
  };

  const onProgress = (job: UpdateDownloadJob | null, p: UpdateDownloadProgress) => {
    if (!job || job !== activeJob || !download || state !== 'downloading') return;
    const phaseChanged = p.phase !== download.phase;
    download = { ...download, phase: p.phase, received: p.received, total: p.total };
    const at = now();
    if (phaseChanged || at - lastProgressPush >= PROGRESS_PUSH_MS || (p.total !== null && p.received >= p.total)) {
      lastProgressPush = at;
      pushDetails();
    }
  };

  /** Squirrel downloads by itself (no downloader, or a RELEASES it cannot handle). */
  const squirrelDownloads = (release: FeedRelease | null) => {
    const feed = squirrelFeedForRelease(stableFeed, prefs.channel, release);
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
  };

  const startOwnDownload = (release: FeedRelease, fullOnly: boolean) => {
    const downloader = deps.downloader!;
    paused = undefined;
    partialBytes = undefined;
    cancelReason = null;
    handoff = null;
    activeRelease = release;
    download = { phase: 'manifest', version: release.version, received: 0, total: null };
    set('downloading');
    // `set` clears `download` for other states only; it is still ours here.
    let job: UpdateDownloadJob | null = null;
    try {
      job = downloader.start({ release, channel: prefs.channel, fullOnly, onProgress: (p) => onProgress(job, p) });
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
      return;
    }
    activeJob = job;
    const started = job;
    void started.done.then((r) => {
      if (started !== activeJob) return;
      activeJob = null;
      const reason = cancelReason;
      cancelReason = null;
      if (r.ok) {
        handoff = { version: release.version, deltas: r.deltas, fullOnly };
        download = { phase: 'installing', version: release.version, received: r.bytes, total: r.bytes, ...(r.deltas ? { deltas: true } : {}) };
        lastProgressPush = now();
        pushDetails();
        try {
          // Update.exe reads a local directory as a release source: it copies the
          // verified packages into packages\ and applies them.
          deps.updater.setFeedURL({ url: r.stagingDir });
          activeFeed = r.stagingDir;
          deps.updater.checkForUpdates();
        } catch (err) {
          handoff = null;
          fail(err instanceof Error ? err.message : String(err));
        }
        return;
      }
      if (r.code === 'canceled') {
        if (reason === 'user') {
          paused = { version: release.version, received: r.received, total: r.total };
          deps.log?.(`[update] download of ${release.version} paused at ${r.received} bytes`);
        }
        set('idle');
        return;
      }
      // Not a byte arrived: Update.exe's own client (WinINet, the system proxy and its
      // credentials) may still get through where Gum's could not, so it gets one try.
      if (r.code === 'unsupported' || (r.code === 'network' && r.received === 0)) {
        deps.log?.(`[update] ${r.message}; leaving the download to Squirrel`);
        download = undefined;
        squirrelDownloads(release);
        return;
      }
      deps.log?.(`[update] download failed: ${r.message}`);
      partialBytes = r.received > 0 && r.code === 'network' ? r.received : undefined;
      error = DOWNLOAD_ERROR_CODES[r.code];
      set('error');
    });
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
        if (deps.downloader) {
          startOwnDownload(answer.release, false);
          return;
        }
        squirrelDownloads(answer.release);
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
    // The user cancelled a download: only they resume it ("Check now").
    if (paused) return;
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
      // "Resume": the download continues from the bytes already on disk.
      paused = undefined;
      check();
      return details();
    },
    start() {
      if (deps.install !== 'installed' || started) return;
      started = true;
      const u = deps.updater;
      // While a staged download is being applied, Update.exe's "checking" and
      // "available" are steps of that, not a new check: the panel stays on "installing".
      u.on('checking-for-update', () => {
        if (!handoff) set('checking');
      });
      u.on('update-available', () => {
        if (!handoff) set('downloading');
      });
      u.on('update-not-available', () => {
        if (handoff) {
          deps.log?.(`[update] Update.exe found nothing to apply in the staged ${handoff.version}`);
          handoff = null;
          deps.downloader?.clear();
          error = 'no-feed';
          set('error');
          return;
        }
        set('idle');
      });
      u.on('before-quit-for-update', () => deps.markQuitting?.());
      u.on('update-downloaded', (...args: unknown[]) => {
        // (event, releaseNotes, releaseName, …) — on Windows only releaseName is set.
        const name = typeof args[2] === 'string' && args[2].trim() ? args[2].trim() : undefined;
        const staged = handoff;
        handoff = null;
        if (staged) {
          // Squirrel has copied the packages into packages\; the staging copy is spare.
          deps.downloader?.clear();
          // The release's own version (`1.2.0-beta.1`), not Squirrel's SemVer 1 spelling of it.
          set('downloaded', staged.version || name);
          return;
        }
        set('downloaded', name);
      });
      u.on('error', (err: unknown) => {
        // The usual cause is a release without RELEASES/nupkg assets, or offline.
        // The panel shows it translated (`upd2.error.<code>`); no toast.
        const message = err instanceof Error ? err.message : String(err);
        deps.log?.(`[update] ${message}`);
        const staged = handoff;
        handoff = null;
        if (staged && staged.deltas && !staged.fullOnly && activeRelease && state === 'downloading') {
          // Update.exe falls back to the full package when deltas fail to apply;
          // the staging folder has only the deltas, so fetch the full one and hand over again.
          deps.log?.('[update] the delta packages did not apply; downloading the full package');
          startOwnDownload(activeRelease, true);
          return;
        }
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
        paused = undefined;
        if (activeJob && download?.phase !== 'installing') {
          // Its download too: the other channel's release is a different package.
          cancelReason = 'channel';
          activeJob.cancel();
        }
        if (state === 'checking' && deps.resolveRelease) set('idle');
      }
      pushDetails();
      return details();
    },
    cancelDownload() {
      if (!activeJob || state !== 'downloading' || !download) return false;
      if (download.phase !== 'manifest' && download.phase !== 'package') return false;
      cancelReason = 'user';
      activeJob.cancel();
      return true;
    },
    refresh() {
      pushDetails();
      return details();
    },
  };
}
