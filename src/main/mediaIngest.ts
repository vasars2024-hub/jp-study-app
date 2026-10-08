/**
 * Automatic media ingest — wiring.
 *
 * The user's goal, verbatim: the fewest possible steps between downloading a
 * video and watching it. So every finished download and every file dropped
 * into a watched folder becomes a library item on its own, already sorted,
 * with the Scraper's identification used when it has one:
 *
 * - **Watch folders** (a list, migrated from the single folder the library used
 *   to keep) run from app start in main, recursively, with settle detection —
 *   `mediaIngestWatch.ts`. qBittorrent's default save path and the app's own
 *   download folder are added automatically and can be removed.
 * - **qBittorrent completion** — `mediaIngestQbit.ts` — polls while a profile is
 *   configured and answering, and imports each torrent that finishes.
 * - **The handoff ledger** (`userData/ingest-ledger.json`) remembers, by info
 *   hash, who each torrent the app handed off is, so the finished files are
 *   filed under the catalogue's show and episode instead of a guess.
 * - Every route funnels into `ingestMediaPaths` (`mediaIngestCore.ts`).
 *
 * IPC (see `shared/mediaIngest.ts` MEDIA_INGEST_CHANNELS): state, add/remove a
 * folder, the auto-import switch, the renderer's qBittorrent profile, rescan;
 * and the `media:ingested` event the UI announces arrivals from.
 */

import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  MEDIA_INGEST_CHANNELS,
  activeWatchFolders,
  addWatchFolder,
  capSeenPaths,
  hintFromSeriesMetadata,
  ingestPathKey,
  isAbsolutePathLike,
  isIngestCandidateName,
  isIngestCandidatePath,
  isIngestSizePlausible,
  isSkippedIngestDir,
  ledgerEntryForPath,
  mergeIngestHints,
  normalizeInfoHash,
  normalizeMediaIngestSettings,
  normalizeLedger,
  pruneLedger,
  recordLedgerEntries,
  registerAutoFolder,
  removeWatchFolder,
  type MediaIngestHint,
  type MediaIngestLedger,
  type MediaIngestLedgerEntry,
  type MediaIngestSettings,
  type MediaIngestSource,
  type MediaIngestState,
  type MediaIngestedEvent,
  type MediaWatchFolderOrigin,
  type QbitTorrentSnapshot,
} from '../shared/mediaIngest';
import { MEDIA_DOWNLOAD_DIRECTORY } from '../shared/mediaLibraryEntries';
import { mapQbitPath } from '../shared/qbitPathMapping';
import {
  DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
  validateScraperQbittorrentSettings,
  type ScraperQbittorrentSettings,
} from '../shared/scraperSourceSettings';
import type { ScraperSettingsIssue } from '../shared/scraperSettingsPrimitives';
import { qbitCredentialGap, qbitCredentialRef } from '../shared/subtitleNyaa';
import type { MediaAcquiredImport, MediaItem } from '../shared/types';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import { mt } from './i18n';
import { mediaMetadataRunning, runMediaMetadata } from './mediaMetadata';
import { artworkName, downloadArtwork } from './mediaProviderClients';
import { createMediaIngestCore, type MediaIngestCore, type MediaIngestHost } from './mediaIngestCore';
import { createQbitCompletionPoller, type QbitCompletionPoller, type QbitPollerState } from './mediaIngestQbit';
import { createMediaFolderWatcher, type MediaFolderWatcher, type MediaWatchRoot } from './mediaIngestWatch';
import { hasScraperSecret } from './scraper/credentials';
import { onAcquisitionHandoff, type AcquisitionHandoff } from './scraper/handoffs';
import { seriesForInfoHashes } from './scraper/history';
import {
  QBIT_SUBTITLE_CATEGORY,
  qbitDefaultSavePath,
  qbitFiles,
  qbitPollTorrents,
  type QbitFileEntry,
} from './scraper/qbittorrent';

export type { MediaIngestHost } from './mediaIngestCore';

const SETTINGS_FILE = 'media-ingest.json';
const SEEN_FILE = 'media-ingest-seen.json';
const LEDGER_FILE = 'ingest-ledger.json';
/** Deep enough for `Show/Season 1/Extras/…`, shallow enough that a drive root cannot run away. */
const WALK_MAX_DEPTH = 8;
const WALK_MAX_ENTRIES = 50_000;
/** How long start-up waits for the first qBittorrent poll before scanning the folders anyway. */
const FIRST_POLL_WAIT_MS = 15_000;

/** Windows and macOS compare paths without case; Linux does not. */
const keyOf = (value: string): string => ingestPathKey(value, process.platform !== 'linux');

interface PersistedIngest extends MediaIngestSettings {
  /** The renderer's active qBittorrent profile, so polling works before any window opens. */
  qbitConfig?: ScraperQbittorrentSettings | null;
  qbitState?: { handled: string[]; baselined: boolean };
}

// ---------------------------------------------------------------- disk ---

function userFile(name: string): string {
  return path.join(app.getPath('userData'), name);
}

function readJson(name: string): unknown {
  return readJsonSync<unknown>(userFile(name), undefined);
}

/** Atomic (temp + fsync + rename, `.bak` kept), so a crash mid-write never leaves half a file. */
function writeJson(name: string, value: unknown): void {
  try {
    writeJsonAtomicSync(userFile(name), value, { space: 0 });
  } catch {
    /* best effort — the next save retries */
  }
}

function statOf(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

/** Candidate media files under `root`: skip rules applied, symlinks not followed, bounded. */
export function walkMediaFiles(root: string): string[] {
  const found: string[] = [];
  let visited = 0;
  const walk = (dir: string, depth: number): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (++visited > WALK_MAX_ENTRIES) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < WALK_MAX_DEPTH && !isSkippedIngestDir(entry.name)) walk(full, depth + 1);
      } else if (entry.isFile() && isIngestCandidateName(entry.name)) {
        found.push(full);
      }
    }
  };
  walk(root, 0);
  return found.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function realSchedule(fn: () => void, ms: number): { cancel: () => void } {
  const handle = setTimeout(fn, ms);
  if (typeof handle.unref === 'function') handle.unref();
  return { cancel: () => clearTimeout(handle) };
}

// ------------------------------------------------------------- service ---

export interface MediaIngestService {
  ingestMediaPaths: MediaIngestCore['ingestMediaPaths'];
  /** `media:getWatchFolder`'s answer: the first watched folder, or null. */
  firstWatchFolder: () => string | null;
  /** `media:setWatchFolder`: pick a folder, add it, import what it holds. */
  addFolderFromDialog: (win?: BrowserWindow) => Promise<string | null>;
  /** `media:clearWatchFolder`: stop watching the folder `firstWatchFolder` named. */
  removeFirstFolder: () => void;
  /** `media:addAcquired`: a finished transfer's path, with its info hash when known. */
  ingestAcquired: (target: unknown, options?: unknown) => Promise<MediaAcquiredImport>;
  /** Library cleared: the user's folders go, the automatic ones and the seen memory stay. */
  onLibraryCleared: () => void;
  /** A download another path already added (yt-dlp), for the arrival announcement. */
  announceDownloaded: (items: readonly MediaItem[]) => void;
  state: () => MediaIngestState;
}

let service: MediaIngestService | null = null;

/** The running service, once `registerMediaIngest` has run. */
export function getMediaIngest(): MediaIngestService | null {
  return service;
}

/**
 * One entry point for any caller that has files: `ingestMediaPaths(paths, hint)`.
 * A no-op before registration.
 */
export async function ingestMediaPaths(
  paths: readonly string[],
  hint?: MediaIngestHint,
  source: MediaIngestSource = 'acquired',
): Promise<MediaItem[]> {
  if (!service) return [];
  return (await service.ingestMediaPaths(paths, hint, source)).added;
}

export function registerMediaIngest(host: MediaIngestHost): MediaIngestService {
  if (service) return service;

  // ---- persisted state ----
  const persisted = readJson(SETTINGS_FILE);
  let settings = normalizeMediaIngestSettings(persisted, host.legacyWatchFolder(), keyOf);
  const raw = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<PersistedIngest>;
  let qbitConfig: ScraperQbittorrentSettings | null = raw.qbitConfig ? validateQbitConfig(raw.qbitConfig) : null;
  const handledRaw: unknown = raw.qbitState?.handled;
  const qbitState: QbitPollerState = {
    handled: new Set(Array.isArray(handledRaw)
      ? handledRaw.filter((hash): hash is string => typeof hash === 'string')
      : []),
    baselined: raw.qbitState?.baselined === true,
  };
  const seenRaw: unknown = (readJson(SEEN_FILE) as { paths?: unknown } | undefined)?.paths;
  const seen = new Set<string>(Array.isArray(seenRaw)
    ? seenRaw.filter((value): value is string => typeof value === 'string')
    : []);
  let ledger: MediaIngestLedger = pruneLedger(normalizeLedger(readJson(LEDGER_FILE)), Date.now());
  /** Auto folders added this session: their first scan is a silent baseline. */
  const freshAutoFolders = new Set<string>();

  const saveSettings = (): void => {
    const doc: PersistedIngest = {
      ...settings,
      qbitConfig,
      qbitState: { handled: [...qbitState.handled], baselined: qbitState.baselined },
    };
    writeJson(SETTINGS_FILE, doc);
  };
  let seenTimer: { cancel: () => void } | null = null;
  const saveSeen = (now = false): void => {
    seenTimer?.cancel();
    seenTimer = null;
    const write = (): void => writeJson(SEEN_FILE, { version: 1, paths: capSeenPaths(seen) });
    if (now) write();
    else seenTimer = realSchedule(() => { seenTimer = null; write(); }, 2_000);
  };
  const saveLedger = (): void => writeJson(LEDGER_FILE, ledger);
  if (!persisted) saveSettings();

  const markSeen = (paths: readonly string[]): void => {
    let grew = 0;
    for (const filePath of paths) {
      const key = keyOf(filePath);
      if (!seen.has(key)) {
        seen.add(key);
        grew += 1;
      }
    }
    // A big baseline is written at once: losing it to a quit inside the debounce
    // would import the whole folder on the next launch.
    if (grew) saveSeen(grew > 50);
  };

  // The library is a JSON file parsed on every read, so its path set is cached
  // for a moment rather than re-read for each of a scan's thousand files.
  let libraryKeys: { at: number; keys: Set<string> } | null = null;
  const libraryHas = (filePath: string): boolean => {
    const now = Date.now();
    if (!libraryKeys || now - libraryKeys.at > 3_000) {
      libraryKeys = { at: now, keys: new Set(host.listItems().map((item) => keyOf(item.path))) };
    }
    return libraryKeys.keys.has(keyOf(filePath));
  };

  // ---- the funnel ----
  const core = createMediaIngestCore(
    {
      ...host,
      addOrGetItem: (absPath) => {
        libraryKeys = null;
        return host.addOrGetItem(absPath);
      },
    },
    {
      now: Date.now,
      schedule: realSchedule,
      stat: (filePath) => {
        const stat = statOf(filePath);
        return stat ? { isFile: stat.isFile(), isDirectory: stat.isDirectory(), size: stat.size } : null;
      },
      walk: walkMediaFiles,
      emit: (event: MediaIngestedEvent) => broadcast(MEDIA_INGEST_CHANNELS.ingested, event),
      metadataBusy: mediaMetadataRunning,
      runMetadataOverride: async (mediaIds, override) => {
        // A sweep that started between the core's busy check and this call
        // refuses outright; the exact lookup is worth a short wait and a retry.
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const result = await runMediaMetadata({ mediaIds, override });
          if (result.ok || !mediaMetadataRunning()) return;
          await new Promise<void>((resolve) => { realSchedule(resolve, 5_000); });
        }
      },
      downloadPoster: (url, seriesKey) => downloadArtwork(url, artworkName('poster', seriesKey, `hint:${url}`)),
      onFilesHandled: markSeen,
      keyOf,
    },
  );

  const ledgerHintFor = (hash: string): MediaIngestHint | undefined => ledger.entries[hash]?.hint;
  const markLedgerIngested = (hash: string): void => {
    const entry = ledger.entries[hash];
    if (!entry || entry.ingestedAt) return;
    ledger = { ...ledger, entries: { ...ledger.entries, [hash]: { ...entry, ingestedAt: Date.now() } } };
    saveLedger();
  };

  // ---- state for the settings panel ----
  let poller: QbitCompletionPoller | null = null;
  let watcher: MediaFolderWatcher | null = null;

  const buildState = (): MediaIngestState => {
    const active = new Set(activeWatchFolders(settings).map((folder) => keyOf(folder.path)));
    return {
      autoImport: settings.autoImport,
      folders: settings.folders.map((folder) => {
        const stat = statOf(folder.path);
        return { ...folder, exists: Boolean(stat?.isDirectory()), active: active.has(keyOf(folder.path)) };
      }),
      qbit: {
        status: poller?.status() ?? 'off',
        lastCheckedAt: poller?.lastCheckedAt() ?? null,
        unresolved: poller?.unresolvedCount() ?? 0,
      },
    };
  };
  const pushState = (): void => broadcast(MEDIA_INGEST_CHANNELS.state, buildState());
  /** Files in qBittorrent's save path were held back while the poller could not vouch for them. */
  let heldQbitArrivals = false;
  const onQbitStatus = (): void => {
    pushState();
    // Held files were left unmarked; once the client answers, look again so
    // the ones it does not claim (finished, baselined) are not stranded.
    if (heldQbitArrivals && poller?.status() === 'watching') {
      heldQbitArrivals = false;
      watcher?.scanAll();
    }
  };

  // ---- watch folders ----
  const watchRoots = (): MediaWatchRoot[] => activeWatchFolders(settings)
    .filter((folder) => statOf(folder.path)?.isDirectory())
    .map((folder) => ({
      path: folder.path,
      mode: freshAutoFolders.has(keyOf(folder.path)) ? 'baseline' : 'import',
    }));
  let watching = false;
  const applyRoots = (): void => {
    if (watching) watcher?.setRoots(watchRoots());
  };

  const addAutoFolder = (folder: string, origin: Exclude<MediaWatchFolderOrigin, 'user'>): void => {
    if (!isAbsolutePathLike(folder) || !statOf(folder)?.isDirectory()) return;
    const result = registerAutoFolder(settings, folder, origin, Date.now(), keyOf);
    if (!result.added) return;
    settings = result.settings;
    freshAutoFolders.add(keyOf(folder));
    saveSettings();
    applyRoots();
    pushState();
  };

  const handleArrivals = async (paths: string[], root: string): Promise<void> => {
    // A file inside a torrent is the poller's: it knows the hash, so it knows
    // who the file is. Asked with a fresh list, because a small torrent can
    // start and finish inside one idle poll interval.
    await poller?.refresh(5_000).catch(() => undefined);
    // qBittorrent writes into its save path in place, without a partial-file
    // extension by default, so a file there that merely stopped growing may be
    // a download whose client was closed mid-way. While the client that could
    // say so is configured but not answering, those files wait — unmarked, so
    // the next scan (or the poller, once it answers) picks them up.
    // Held unless the poller is 'watching' (then `claims` decides): unreachable,
    // refused and not-yet-polled alike cannot say a file is finished. Only a
    // profile that is gone ('not-configured') leaves the folder a plain folder.
    const origin = settings.folders.find((folder) => keyOf(folder.path) === keyOf(root))?.origin;
    const qbitStatus = poller?.status();
    if (origin === 'qbittorrent' && poller && qbitStatus !== 'watching' && qbitStatus !== 'not-configured') {
      heldQbitArrivals = true;
      return;
    }
    const mine = paths.filter((filePath) => !poller?.claims(filePath));
    if (!mine.length) return;
    const groups = new Map<string, { entry?: MediaIngestLedgerEntry; paths: string[] }>();
    for (const filePath of mine) {
      const entry = ledgerEntryForPath(ledger, filePath, keyOf);
      const key = entry?.hash ?? '';
      const group = groups.get(key) ?? { entry, paths: [] };
      group.paths.push(filePath);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      try {
        await core.ingestMediaPaths(group.paths, group.entry?.hint, 'watch-folder', { auto: true });
        if (group.entry) markLedgerIngested(group.entry.hash);
      } catch {
        // Logged nowhere on purpose: a file that vanished between settling and
        // import is not an error the user can act on.
      }
    }
  };

  watcher = createMediaFolderWatcher({
    now: Date.now,
    schedule: realSchedule,
    observe: (root, onEvent) => {
      try {
        const handle = fs.watch(root, { recursive: true }, (_event, filename) => {
          onEvent(filename ? String(filename) : null);
        });
        handle.on('error', () => undefined);
        return { close: () => handle.close() };
      } catch {
        return null;
      }
    },
    stat: (filePath) => {
      const stat = statOf(filePath);
      return stat
        ? { size: stat.size, mtimeMs: stat.mtimeMs, isFile: stat.isFile(), isDirectory: stat.isDirectory() }
        : null;
    },
    walk: walkMediaFiles,
    join: (root, relative) => path.join(root, relative),
    isHandled: (filePath) => seen.has(keyOf(filePath)) || libraryHas(filePath),
    markHandled: markSeen,
    onArrivals: (paths, root) => {
      void handleArrivals(paths, root);
    },
    isBusy: process.platform === 'win32'
      ? (filePath) => {
        // A copier that denies write-sharing is still writing. Opening for
        // update changes nothing on disk; EBUSY is Windows' sharing violation.
        try {
          fs.closeSync(fs.openSync(filePath, 'r+'));
          return false;
        } catch (error) {
          return (error as NodeJS.ErrnoException)?.code === 'EBUSY';
        }
      }
      : undefined,
  });

  // ---- qBittorrent completion ----
  const resolveTorrentFiles = (torrent: QbitTorrentSnapshot, files: QbitFileEntry[] | null): string[] => {
    const listed = (files ?? [])
      .filter((file) => file.priority > 0 && file.progress >= 1)
      .filter((file) => isIngestCandidatePath(file.name) && isIngestSizePlausible(file.name, file.sizeBytes))
      .map((file) => path.join(torrent.savePath, ...file.name.split(/[\\/]/)))
      .filter((filePath) => statOf(filePath)?.isFile());
    if (listed.length) return listed;
    // The list was unreadable, or its paths are not where this machine sees
    // them: fall back to the folder qBittorrent says the content is in.
    const content = torrent.contentPath;
    const stat = content ? statOf(content) : null;
    if (!stat) return [];
    if (stat.isDirectory()) return walkMediaFiles(content);
    return isIngestCandidateName(content) ? [content] : [];
  };

  poller = createQbitCompletionPoller({
    now: Date.now,
    schedule: realSchedule,
    getConfig: () => qbitConfig,
    isEnabled: () => settings.autoImport,
    hasCredential: async (config) => {
      const stored = await hasScraperSecret(qbitCredentialRef(config)).catch(() => false);
      return !qbitCredentialGap({ qbittorrent: config, secretStored: stored });
    },
    // A remote client's paths are translated once, here, so `resolveFiles`,
    // `claims` and the watch folder all see this machine's paths.
    poll: async (config) => {
      const polled = await qbitPollTorrents({ config });
      if (!polled.ok || !config.pathMappings?.length) return polled;
      return {
        ok: true,
        value: polled.value.map((torrent) => ({
          ...torrent,
          savePath: mapQbitPath(torrent.savePath, config.pathMappings),
          contentPath: mapQbitPath(torrent.contentPath, config.pathMappings),
        })),
      };
    },
    files: (config, hash) => qbitFiles({ config }, hash),
    defaultSavePath: async (config) => {
      const found = await qbitDefaultSavePath({ config });
      return found.ok ? { ok: true, value: mapQbitPath(found.value, config.pathMappings) } : found;
    },
    state: qbitState,
    saveState: saveSettings,
    ledgerHashes: () => new Set(Object.keys(ledger.entries)),
    ledgerHint: ledgerHintFor,
    resolveFiles: resolveTorrentFiles,
    ingest: async (paths, hint, torrent) => {
      await core.ingestMediaPaths(paths, hint, 'qbittorrent', { auto: true });
      markLedgerIngested(torrent.hash.toLowerCase());
    },
    onSavePath: (savePath) => addAutoFolder(savePath, 'qbittorrent'),
    onStatus: onQbitStatus,
    ignoreCategories: new Set([QBIT_SUBTITLE_CATEGORY]),
    keyOf,
    log: (message) => {
      console.warn(`[media-ingest] ${message}`);
      pushState();
    },
  });

  // ---- handoffs from the Scraper ----
  onAcquisitionHandoff((handoff: AcquisitionHandoff) => {
    const now = Date.now();
    const entries: MediaIngestLedgerEntry[] = handoff.rows
      .map((row) => {
        const hash = normalizeInfoHash(row.infoHash);
        if (!hash) return null;
        const episodes = handoff.ingest?.rowEpisodes?.[row.id];
        const hint = (handoff.ingest?.hint || episodes)
          ? { ...(handoff.ingest?.hint ?? {}), ...(episodes ? { episodes } : {}) }
          : undefined;
        const entry: MediaIngestLedgerEntry = {
          hash,
          via: handoff.ingest?.via ?? handoff.target,
          name: row.name || undefined,
          savePath: handoff.ingest?.savePath ?? handoff.destination,
          createdAt: now,
        };
        if (hint && Object.keys(hint).length) entry.hint = hint;
        return entry;
      })
      .filter((entry): entry is MediaIngestLedgerEntry => entry !== null);
    if (entries.length) {
      ledger = recordLedgerEntries(ledger, entries, now);
      saveLedger();
    }
    // A handoff that did not know who the release is (the Torrent Manager's
    // free-text search) still may have been found by a scrape run: the Scraper's
    // stored identification fills whatever the handoff left out.
    const unknown = entries.filter((entry) => !entry.hint?.anilistId && !entry.hint?.malId);
    if (unknown.length) {
      void seriesForInfoHashes(unknown.map((entry) => entry.hash)).then((found) => {
        const enriched: MediaIngestLedgerEntry[] = [];
        for (const entry of unknown) {
          const scraped = hintFromSeriesMetadata(found.get(entry.hash));
          if (scraped) enriched.push({ ...entry, hint: mergeIngestHints(entry.hint, scraped) });
        }
        if (!enriched.length) return;
        ledger = recordLedgerEntries(ledger, enriched, Date.now());
        saveLedger();
      }).catch(() => undefined);
    }
    // A Seanime or debrid destination is where those files will appear, and no
    // poller can see them there: watch it, as an automatic (removable) folder.
    if (handoff.target !== 'qbittorrent' && handoff.destination) addAutoFolder(handoff.destination, 'destination');
    // A torrent just handed to the client this app polls is worth an early look.
    if (handoff.target === 'qbittorrent') void poller?.refresh(0);
  });

  // ---- the app's own downloads ----
  const appDownloads = userFile(MEDIA_DOWNLOAD_DIRECTORY);
  try {
    fs.mkdirSync(appDownloads, { recursive: true });
  } catch {
    /* read-only profile: nothing to watch */
  }
  addAutoFolder(appDownloads, 'app-downloads');

  // ---- IPC ----
  const addFolderFromDialog = async (win?: BrowserWindow): Promise<string | null> => {
    const owner = win ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const res = owner
      ? await dialog.showOpenDialog(owner, { title: mt('dialog.autoAddVideosFolder.title'), properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ title: mt('dialog.autoAddVideosFolder.title'), properties: ['openDirectory'] });
    const folder = res.canceled ? undefined : res.filePaths[0];
    if (!folder) return null;
    const result = addWatchFolder(settings, folder, 'user', Date.now(), keyOf);
    settings = result.settings;
    freshAutoFolders.delete(keyOf(folder));
    saveSettings();
    if (watching) watcher?.setRoots(watchRoots());
    // Chosen by the user, so what is already there is wanted too — the same
    // behaviour the single watch folder had.
    await core.ingestMediaPaths(walkMediaFiles(folder), undefined, 'watch-folder', { auto: true }).catch(() => undefined);
    pushState();
    return folder;
  };

  const removeFolder = (folder: string): void => {
    settings = removeWatchFolder(settings, folder, keyOf);
    freshAutoFolders.delete(keyOf(folder));
    saveSettings();
    applyRoots();
    pushState();
  };

  ipcMain.handle(MEDIA_INGEST_CHANNELS.getState, () => buildState());
  ipcMain.handle(MEDIA_INGEST_CHANNELS.addFolder, async (event) => {
    await addFolderFromDialog(BrowserWindow.fromWebContents(event.sender) ?? undefined);
    return buildState();
  });
  ipcMain.handle(MEDIA_INGEST_CHANNELS.removeFolder, (_event, folder: unknown) => {
    if (typeof folder === 'string' && folder.trim()) removeFolder(folder);
    return buildState();
  });
  ipcMain.handle(MEDIA_INGEST_CHANNELS.setAutoImport, (_event, on: unknown) => {
    if (typeof on === 'boolean' && on !== settings.autoImport) {
      settings = { ...settings, autoImport: on };
      saveSettings();
      if (on) poller?.start();
      else poller?.stop();
      applyRoots();
      pushState();
    }
    return buildState();
  });
  /** A poller that stopped on its own (refused login, no credential) is worth another try. */
  const pollerIdle = (): boolean => {
    const status = poller?.status();
    return status === 'unauthorized' || status === 'not-configured' || status === 'unreachable';
  };
  ipcMain.handle(MEDIA_INGEST_CHANNELS.syncQbit, (_event, config: unknown) => {
    const next = config && typeof config === 'object' ? validateQbitConfig(config) : null;
    const changed = JSON.stringify(next) !== JSON.stringify(qbitConfig);
    if (changed) {
      qbitConfig = next;
      saveSettings();
    }
    // Every save arrives here, so a credential fixed in the drawer (same ref,
    // new secret) restarts a poller that had stopped on the old one.
    if (settings.autoImport && (changed || pollerIdle())) poller?.start();
  });
  ipcMain.handle(MEDIA_INGEST_CHANNELS.rescan, async () => {
    // A folder that exists again (a drive plugged back in) is picked up too.
    applyRoots();
    watcher?.scanAll();
    if (settings.autoImport && poller) {
      if (pollerIdle()) {
        poller.start();
        await poller.firstPoll();
      } else {
        await poller.refresh(0).catch(() => undefined);
      }
    }
    return buildState();
  });

  // Guarded: harnesses that register the media IPC with a stub `app` have no event emitter.
  if (typeof app?.on === 'function') app.on('will-quit', () => {
    seenTimer?.cancel();
    writeJson(SEEN_FILE, { version: 1, paths: capSeenPaths(seen) });
    watcher?.stop();
    poller?.stop();
  });

  // ---- start ----
  // The folders wait for qBittorrent's first answer (bounded), so a torrent that
  // finished while the app was closed is imported by the poller, with its
  // identity, rather than by a folder scan without it.
  if (settings.autoImport) poller.start();
  void Promise.race([
    settings.autoImport ? poller.firstPoll() : Promise.resolve(),
    new Promise<void>((resolve) => { realSchedule(resolve, FIRST_POLL_WAIT_MS); }),
  ]).then(() => {
    watching = true;
    watcher?.setRoots(watchRoots());
    // Roots that were already known now count as scanned.
    freshAutoFolders.clear();
    pushState();
  });

  // The older single-folder surfaces show one folder: the user's own first,
  // otherwise whichever automatic one is being watched.
  const firstFolder = (): string | null => {
    const active = activeWatchFolders(settings);
    return (active.find((folder) => folder.origin === 'user') ?? active[0])?.path ?? null;
  };

  service = {
    ingestMediaPaths: (paths, hint, source, options) => core.ingestMediaPaths(paths, hint, source, options),
    firstWatchFolder: firstFolder,
    addFolderFromDialog,
    removeFirstFolder: () => {
      const first = firstFolder();
      if (first) removeFolder(first);
    },
    async ingestAcquired(target, options) {
      const empty = (outcome: MediaAcquiredImport['outcome']): MediaAcquiredImport =>
        ({ items: host.listItems(), found: 0, added: 0, outcome });
      if (typeof target !== 'string' || !target.trim()) return empty('invalid-path');
      const root = target.trim();
      const stat = statOf(root);
      // The daemon's save path is its own truth; the file can have been moved
      // or deleted since. Say so rather than reporting an empty success.
      if (!stat) return empty('missing');
      const files = stat.isDirectory() ? walkMediaFiles(root) : (isIngestCandidateName(root) ? [root] : []);
      if (!files.length) return empty('no-media');
      const hash = normalizeInfoHash((options as { infoHash?: unknown } | undefined)?.infoHash);
      const entry = (hash && ledger.entries[hash]) || ledgerEntryForPath(ledger, root, keyOf);
      const result = await core.ingestMediaPaths(files, entry?.hint, 'acquired');
      if (entry) markLedgerIngested(entry.hash);
      if (hash) {
        qbitState.handled.add(hash);
        saveSettings();
      }
      return { items: host.listItems(), found: files.length, added: result.added.length, outcome: 'ok' };
    },
    onLibraryCleared() {
      settings = { ...settings, folders: settings.folders.filter((folder) => folder.origin !== 'user') };
      saveSettings();
      applyRoots();
      pushState();
    },
    announceDownloaded(items) {
      markSeen(items.map((item) => item.path));
      core.announce(items, 'download');
    },
    state: buildState,
  };
  return service;
}

function validateQbitConfig(input: unknown): ScraperQbittorrentSettings {
  const issues: ScraperSettingsIssue[] = [];
  return validateScraperQbittorrentSettings(input, DEFAULT_SCRAPER_QBITTORRENT_SETTINGS, issues, 'qbittorrent');
}

/** Test seam: forget the registered service. */
export function __resetMediaIngestForTests(): void {
  service = null;
}
