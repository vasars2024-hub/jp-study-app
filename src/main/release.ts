import { app, autoUpdater, BrowserWindow, ipcMain } from 'electron';
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
  DEFAULT_APP_UPDATE_PREFS,
  RELEASE_NOTES_MAX_CHARS,
  sanitizeAppUpdatePrefs,
  type AppReleaseNotes,
  type AppUpdatePrefs,
  type AppUpdateUnsavedKind,
} from '../shared/appUpdate';
import { getRecorderState } from './regionRecorder';
import { readInstalledExtensionVersion } from './extensionInstall';
import { logDiagnostic } from './errorLog';
import { markAppQuitting } from './appLifecycle';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import { isConnectionMetered } from './meteredConnection';
import { isE2eHeadless } from './e2eHeadless';
import { fetchChannelRelease, resolveUpdateFeed, type FeedFetch, type UpdateFeed } from './releaseFeed';
import { createAppUpdateController, detectInstallKind } from './squirrelUpdater';

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
 * panel translates. Everything else Gum edits is written as it changes (decks,
 * the CSV editor, the deck workbench, the Anki outbox), so a recording is what
 * a restart can actually cut short.
 */
function unsavedWorkKinds(): AppUpdateUnsavedKind[] {
  const out: AppUpdateUnsavedKind[] = [];
  try {
    const recorder = getRecorderState();
    if (recorder.phase === 'starting' || recorder.phase === 'recording' || recorder.phase === 'paused') out.push('recording');
    if (recorder.jobs.some((job) => job.phase === 'finalizing' || job.phase === 'importing')) out.push('recording-finalize');
  } catch {
    /* recorder not initialised: nothing of it to lose */
  }
  return out;
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
  const updates = createAppUpdateController({
    install: detectInstallKind(process.execPath, app.isPackaged),
    updater: autoUpdater,
    currentVersion: normalizeVersion(app.getVersion()),
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
  // Only ever on the user's click (Settings -> Help -> Updates, "Show release notes").
  ipcMain.handle('appUpdate:releaseNotes', () => fetchReleaseNotes());
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
