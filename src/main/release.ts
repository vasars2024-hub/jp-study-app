import { app, autoUpdater, BrowserWindow, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import {
  classifyRelease,
  compareVersions,
  normalizeVersion,
  parseExtensionVersionFromBody,
  parseReleaseHighlights,
  GITHUB_RELEASES_PAGE,
  type AppReleaseInfo,
  type ReleaseChannel,
  type ReleaseStatus,
} from '../shared/release';
import path from 'node:path';
import {
  APP_UPDATE_UNSAVED_KINDS,
  DEFAULT_APP_UPDATE_PREFS,
  RELEASE_NOTES_MAX_CHARS,
  sanitizeAppUpdatePrefs,
  type AppReleaseNotes,
  type AppUpdatePrefs,
  type AppUpdateUnsavedKind,
} from '../shared/appUpdate';
import { isReleaseVersion } from '../shared/release';
import { isProjectGithubUrl } from '../shared/releaseMarkdown';
import { getRecorderState } from './regionRecorder';
import { readInstalledExtensionVersion } from './extensionInstall';
import { logDiagnostic } from './errorLog';
import { markAppQuitting } from './appLifecycle';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import { isConnectionMetered } from './meteredConnection';
import { isE2eHeadless } from './e2eHeadless';
import { fetchChannelRelease, fetchTaggedRelease, resolveUpdateFeed, updateDownloadBase, type FeedFetch, type UpdateFeed } from './releaseFeed';
import { createAppUpdateController, detectInstallKind, type UpdateDownloaderLike, type UpdaterLike } from './squirrelUpdater';
import { updateExePath } from './squirrelEvents';
import { clearStaging, latestFullVersion, parseSquirrelReleases, startUpdateDownload } from './updateDownloader';
import { createHarnessSquirrel, E2E_UPDATE_INSTALL_ENV } from './updateHarnessSquirrel';
import { historyForPanel, noteRunningVersion, readUpdateHistory, type UpdateHistoryState } from './updateHistory';
import { forgetWindowUnsavedWork, listUnsavedWork, setWindowUnsavedWork } from './unsavedWork';

/**
 * The feed, decided once: GitHub normally; under the headless harness the fake
 * named by `GUM_UPDATE_FEED_URL`, or nothing at all — a test run never reaches
 * the real GitHub.
 */
let feed: UpdateFeed | null = null;
function updateFeed(): UpdateFeed {
  if (!feed) feed = resolveUpdateFeed(process.env, isE2eHeadless());
  return feed;
}

/** The channel and skipped version, read by every check (the controller owns writes). */
let currentPrefs: () => AppUpdatePrefs = () => ({ ...DEFAULT_APP_UPDATE_PREFS });

function fetchLatest(channel: ReleaseChannel = currentPrefs().channel): Promise<FeedFetch> {
  return fetchChannelRelease(updateFeed(), channel);
}

/**
 * The honest answer for Settings > Help. The notification path below only
 * speaks when there is something newer; this one also says "you are on the
 * latest", "your build is newer than the latest release" (the audit found
 * v1.0.1 locally vs v1.0.0 published, where the old check just stayed silent),
 * "this project publishes no releases", or WHY it could not tell (offline,
 * GitHub's rate limit and when it lifts, an answer that is not a release).
 */
export async function getReleaseStatus(
  current = app.getVersion(),
  fetcher: (channel: ReleaseChannel) => Promise<FeedFetch> = fetchLatest,
  prefs: AppUpdatePrefs = currentPrefs(),
  now: () => number = Date.now,
): Promise<ReleaseStatus> {
  const r = await fetcher(prefs.channel);
  const checkedAt = now();
  const cur = normalizeVersion(current);
  const base = { current: cur, checkedAt, channel: prefs.channel };
  if (r.kind === 'failed') {
    return { kind: 'unavailable', ...base, reason: r.reason, ...(r.retryAt ? { retryAt: r.retryAt } : {}) };
  }
  if (r.kind === 'none') return { kind: 'no-releases', ...base };
  const kind = classifyRelease(cur, r.release.version);
  return {
    kind,
    ...base,
    latest: r.release.version,
    url: r.release.url,
    ...(kind === 'update' && prefs.skippedVersion === r.release.version ? { skipped: true } : {}),
  };
}

/**
 * Check the channel's release for a newer desktop build and/or a newer Chrome
 * extension version advertised in the release body. Returns null when the check
 * fails, nothing is newer, or the newer build is the version the user skipped.
 */
async function fetchLatestRelease(): Promise<AppReleaseInfo | null> {
  const prefs = currentPrefs();
  const r = await fetchLatest(prefs.channel);
  if (r.kind !== 'ok') return null;
  const release = r.release;

  const currentApp = normalizeVersion(app.getVersion());
  const appUpdate = compareVersions(release.version, currentApp) > 0 && prefs.skippedVersion !== release.version;
  const installedExtensionVersion = readInstalledExtensionVersion() ?? undefined;
  const releaseExtension = parseExtensionVersionFromBody(release.body);
  const extensionUpdate =
    releaseExtension &&
    (!installedExtensionVersion || compareVersions(releaseExtension, installedExtensionVersion) > 0)
      ? { version: releaseExtension }
      : undefined;

  if (!appUpdate && !extensionUpdate) return null;

  return {
    version: release.version,
    title: release.name,
    summary: parseReleaseHighlights(release.body),
    body: release.body,
    url: release.url,
    appUpdate,
    extensionUpdate,
    installedExtensionVersion,
  };
}

/**
 * What a restart right now would lose, as `AppUpdateUnsavedKind` codes the
 * panel translates: the recorder (main's own state) plus whatever every window
 * and main-process job has reported to the registry (main/unsavedWork.ts) — an
 * open note or card edit, a review part-way through, a snip or AI job running.
 * Decks, the CSV editor, the deck workbench and the Anki outbox are written as
 * they change, so they never need to be listed.
 */
function unsavedWorkKinds(): AppUpdateUnsavedKind[] {
  const held = new Set<AppUpdateUnsavedKind>(listUnsavedWork());
  try {
    const recorder = getRecorderState();
    if (recorder.phase === 'starting' || recorder.phase === 'recording' || recorder.phase === 'paused') held.add('recording');
    if (recorder.jobs.some((job) => job.phase === 'finalizing' || job.phase === 'importing')) held.add('recording-finalize');
  } catch {
    /* recorder not initialised: nothing of it to lose */
  }
  return APP_UPDATE_UNSAVED_KINDS.filter((kind) => held.has(kind));
}

/** Windows whose reports are cleared when they go away (hooked once each). */
const unsavedReporters = new Set<number>();

/** The installed copy's own version per Squirrel (`<root>\packages\RELEASES`); null = unknown. */
function localSquirrelVersion(execPath: string): string | null {
  try {
    const text = fs.readFileSync(path.join(path.dirname(updateExePath(execPath)), 'packages', 'RELEASES'), 'utf8');
    const entries = parseSquirrelReleases(text);
    return entries ? latestFullVersion(entries) : null;
  } catch {
    return null;
  }
}

export function registerReleaseIpc(): void {
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('release:check', () => fetchLatestRelease());
  ipcMain.handle('release:status', () => getReleaseStatus());

  // An installed (Squirrel) copy also downloads the update itself and offers
  // "Restart to update"; the portable zip keeps only the check-and-notify above.
  const stateFile = path.join(app.getPath('userData'), 'app-update-state.json');
  const readState = () => readJsonSync<Record<string, unknown>>(stateFile, {});
  const writeState = (patch: Record<string, unknown>) => writeJsonAtomicSync(stateFile, { ...readState(), ...patch });
  const currentVersion = normalizeVersion(app.getVersion());

  // Update history + "What's new": noted once per start, before any window asks.
  let history: UpdateHistoryState = readUpdateHistory(readState());
  try {
    const noted = noteRunningVersion(history, currentVersion, Date.now());
    if (noted.changed) {
      history = { history: noted.history, whatsNew: noted.whatsNew };
      writeState({ history: history.history, whatsNew: history.whatsNew });
    }
  } catch (err) {
    logDiagnostic('warn', 'update', 'history', err instanceof Error ? err.message : String(err));
  }

  // The headless harness can stand in for an installed copy (its fake feed, a
  // stand-in Update.exe, staging in the temp profile); nothing else can.
  const harnessInstall = isE2eHeadless() && process.env[E2E_UPDATE_INSTALL_ENV] === '1' && updateFeed().source === 'override';
  const install = harnessInstall ? 'installed' : detectInstallKind(process.execPath, app.isPackaged);
  const updater: UpdaterLike = harnessInstall ? createHarnessSquirrel(autoUpdater, currentVersion) : autoUpdater;
  // Beside Squirrel's own packages (Local AppData, not the roaming profile).
  const stagingDir = harnessInstall
    ? path.join(app.getPath('userData'), 'update-staging')
    : path.join(path.dirname(updateExePath(process.execPath)), 'packages', 'gum-staged');
  const downloader: UpdateDownloaderLike = {
    start: ({ release, fullOnly, onProgress }) => {
      const baseUrl = updateDownloadBase(updateFeed(), release) ?? '';
      return startUpdateDownload({
        baseUrl,
        stagingDir,
        localVersion: harnessInstall ? null : localSquirrelVersion(process.execPath),
        currentVersion,
        fullOnly,
        onProgress,
        userAgent: `Gum/${currentVersion}`,
        ...(harnessInstall ? { retryDelaysMs: [200, 400] } : {}),
      });
    },
    clear: () => clearStaging(stagingDir),
  };
  const updates = createAppUpdateController({
    install,
    updater,
    currentVersion,
    downloader,
    history: () => ({ history: historyForPanel(history), whatsNew: history.whatsNew }),
    // The harness never checks on a timer: a run checks when a flow presses the button.
    ...(harnessInstall ? { setTimer: () => undefined } : {}),
    broadcast: (status) => sendToAllWindows('appUpdate:changed', status),
    broadcastDetails: (details) => sendToAllWindows('appUpdate:details', details),
    log: (message) => logDiagnostic('warn', 'update', 'squirrel', message),
    markQuitting: markAppQuitting,
    // Staged-rollout guard: no automatic ~385 MB download on a metered connection.
    isMetered: () => isConnectionMetered(),
    lastCheckedStore: {
      load: () => {
        const v = readState().lastCheckedAt;
        return typeof v === 'number' && Number.isFinite(v) ? v : null;
      },
      save: (at) => writeState({ lastCheckedAt: at }),
    },
    prefsStore: {
      load: () => sanitizeAppUpdatePrefs(readState()),
      save: (prefs) => writeState({ channel: prefs.channel, skippedVersion: prefs.skippedVersion }),
    },
    resolveRelease: (channel) => fetchLatest(channel),
    unsavedWork: unsavedWorkKinds,
  });
  currentPrefs = () => updates.prefs();
  ipcMain.handle('appUpdate:status', () => updates.status());
  ipcMain.handle('appUpdate:details', () => updates.details());
  ipcMain.handle('appUpdate:checkNow', () => updates.checkNow());
  ipcMain.handle('appUpdate:restart', (_e, opts?: unknown) =>
    updates.requestRestart(Boolean(opts && typeof opts === 'object' && (opts as { force?: unknown }).force === true)));
  ipcMain.handle('appUpdate:setPrefs', (_e, patch: unknown) => updates.setPrefs(sanitizeAppUpdatePrefs(patch, updates.prefs())));
  ipcMain.handle('appUpdate:cancelDownload', () => updates.cancelDownload());
  // Only ever on the user's click (Settings -> Help -> Updates, "Show release notes",
  // or "What's new" asking for the running version's notes).
  ipcMain.handle('appUpdate:releaseNotes', (_e, opts?: unknown) => {
    const v = opts && typeof opts === 'object' ? (opts as { version?: unknown }).version : undefined;
    return typeof v === 'string' && isReleaseVersion(v)
      ? fetchReleaseNotes(() => fetchTaggedRelease(updateFeed(), v))
      : fetchReleaseNotes();
  });
  // A link in rendered release notes: this project's GitHub pages only.
  ipcMain.handle('appUpdate:openLink', async (_e, url: unknown): Promise<boolean> => {
    if (!isProjectGithubUrl(url)) return false;
    await shell.openExternal(url as string);
    return true;
  });
  // "What's new": the notice was posted (once), or the user dismissed the card.
  ipcMain.handle('appUpdate:whatsNew', (_e, action: unknown) => {
    if (history.whatsNew && (action === 'announced' || action === 'dismissed')) {
      history = { ...history, whatsNew: action === 'dismissed' ? null : { ...history.whatsNew, announced: true } };
      try {
        writeState({ whatsNew: history.whatsNew });
      } catch (err) {
        logDiagnostic('warn', 'update', 'history', err instanceof Error ? err.message : String(err));
      }
    }
    return updates.refresh();
  });
  // Unsaved work from every window, as a whole list per window (main/unsavedWork.ts).
  ipcMain.on('unsavedWork:report', (event, kinds: unknown) => {
    const sender = event.sender;
    const id = sender.id;
    if (!setWindowUnsavedWork(id, kinds) || unsavedReporters.has(id)) return;
    unsavedReporters.add(id);
    const forget = () => {
      forgetWindowUnsavedWork(id);
      unsavedReporters.delete(id);
    };
    sender.once('destroyed', forget);
    sender.once('render-process-gone', forget);
    // A reload starts the page over: its drafts are gone, and it reports again.
    sender.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) forgetWindowUnsavedWork(id);
    });
  });
  updates.start();
}

function sendToAllWindows(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

/** The channel's release notes from the feed, capped; nothing about the user is sent. */
export async function fetchReleaseNotes(
  fetcher: (channel: ReleaseChannel) => Promise<FeedFetch> = fetchLatest,
  channel: ReleaseChannel = currentPrefs().channel,
): Promise<AppReleaseNotes> {
  const r = await fetcher(channel);
  if (r.kind === 'none') return { ok: false, reason: 'none' };
  if (r.kind === 'failed') return { ok: false, reason: 'failed' };
  const body = r.release.body;
  return {
    ok: true,
    version: r.release.version,
    title: r.release.name,
    body: body.slice(0, RELEASE_NOTES_MAX_CHARS),
    url: r.release.url || GITHUB_RELEASES_PAGE,
    ...(r.release.publishedAt ? { publishedAt: r.release.publishedAt } : {}),
    truncated: body.length > RELEASE_NOTES_MAX_CHARS,
  };
}
