import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import { execFile, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  appendVisualNovelCapture,
  appendVisualNovelCaptures,
  createEmptyVisualNovelDatabase,
  createVisualNovelEntry,
  detectVisualNovelEngine,
  mergeVisualNovelDatabases,
  normalizeVisualNovelDatabase,
  normalizeVisualNovelRelease,
  removeVisualNovelCapture,
  updateVisualNovelCapture,
  updateVisualNovelMetadata,
  updateVisualNovelProgress,
  updateVisualNovelRoutes,
  updateVisualNovelSettings,
  upsertVisualNovelEntry,
  visualNovelSettings,
  VISUAL_NOVEL_DATABASE_FILE,
  type VisualNovelCaptureInput,
  type VisualNovelCaptureBatchOptions,
  type VisualNovelCapturePatch,
  type VisualNovelCreateInput,
  type VisualNovelDatabase,
  type VisualNovelDiscoveryCandidate,
  type VisualNovelMetadataPatch,
  type VisualNovelProgressPatch,
  type VisualNovelRouteInput,
  type VisualNovelSettingsPatch,
  type VisualNovelSourceResult,
  type VisualNovelSourceDetails,
} from '../../shared/visualNovel';
import {
  extractVisualNovelScript,
  VISUAL_NOVEL_SCRIPT_LINE_LIMIT,
  type VisualNovelScriptLine,
} from '../../shared/visualNovelScriptExtraction';
import {
  parseVisualNovelHookChunk,
  type VisualNovelHookState,
} from '../../shared/visualNovelHook';
import type { VisualNovelCandidateRequest } from '../../shared/visualNovelRecommendations';
import type {
  VisualNovelCaptureSource,
  VisualNovelSessionState,
  VisualNovelStudyTime,
} from '../../shared/visualNovelCapture';
import { cacheVndbArt, isVndbArtUrl, vndbQuery } from './vndbClient';
import { createCaptureSession, type CaptureSocket } from './visualNovelCaptureSession';
import {
  candidateGameNames,
  parseTasklistCsv,
  trackGame,
  type TrackedGame,
} from './visualNovelProcess';
import {
  closeVisualNovelReader,
  openVisualNovelReader,
  readerTarget,
  setReaderOpacity,
} from './visualNovelReaderWindow';

const MAX_SCAN_FILES = 3_000;
const MAX_SCAN_DEPTH = 4;
const MAX_DISCOVERY_DIRECTORIES = 250;
const MAX_DISCOVERY_RESULTS = 100;
const MAX_SCRIPT_FILES = 20;
const MAX_SCRIPT_FILE_BYTES = 4 * 1024 * 1024;
const MAX_SCRIPT_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_COMMUNITY_BUNDLE_BYTES = 5 * 1024 * 1024;
const MAX_HOOK_READ_BYTES = 512 * 1024;
const MAX_CAPTURE_SCREENSHOT_BYTES = 1024 * 1024;
const MAX_CAPTURE_AUDIO_BYTES = 12 * 1024 * 1024;
const activeReadingSessions = new Map<string, number>();
/** The running game behind each reading session, when Launch started one. */
const activeGames = new Map<string, TrackedGame>();
/** Characters captured during each running session, for the shared study stats. */
const sessionChars = new Map<string, number>();
interface ActiveHookRelay {
  watcher: fs.FSWatcher;
  filePath: string;
  position: number;
  pending: NodeJS.Timeout | null;
  reading: boolean;
  capturedLines: number;
  lastError: string;
  remainder: string;
}
const activeHookRelays = new Map<string, ActiveHookRelay>();
export const VNDB_VN_FIELDS = [
  'title',
  'alttitle',
  'aliases',
  'titles{lang,title,latin,main,official}',
  'released',
  'platforms',
  'languages',
  'description',
  'length_minutes',
  'average',
  'votecount',
  'image{url,sexual}',
  'screenshots{url,sexual}',
  'developers{name,original}',
  'va{character{id,name,original},staff{name,original}}',
  'tags{name,rating,spoiler,category}',
].join(',');

/**
 * VNDB image URLs that passed the adult-image filter (or that the user's own
 * library stores). `visual-novel:art` caches nothing else, so a renderer cannot
 * use the cache to fetch an image the filter dropped.
 */
const vettedArtUrls = new Set<string>();
const MAX_VETTED_ART_URLS = 4_000;

function vetVndbArt(urls: readonly string[]): void {
  for (const url of urls) {
    if (!isVndbArtUrl(url)) continue;
    if (vettedArtUrls.size >= MAX_VETTED_ART_URLS) {
      const oldest = vettedArtUrls.values().next().value;
      if (oldest !== undefined) vettedArtUrls.delete(oldest);
    }
    vettedArtUrls.add(url);
  }
}

function isVettedArt(url: string): boolean {
  if (vettedArtUrls.has(url)) return true;
  return loadDatabase().entries.some((entry) => (
    entry.coverImageUrl === url || entry.screenshotUrls.includes(url) || entry.backgroundImageUrls.includes(url)
  ));
}

/** The directory `media://` serves — the same root as library.ts's `libraryRoot()`. */
function mediaRoot(): string {
  return path.join(app.getPath('userData'), 'library');
}

function databasePath(): string {
  return path.join(app.getPath('userData'), ...VISUAL_NOVEL_DATABASE_FILE.split('/'));
}

function captureImageDirectory(): string {
  return path.join(app.getPath('userData'), 'immersion', 'visual-novel-captures');
}

function isManagedCaptureAsset(filePath: string): boolean {
  const root = `${path.resolve(captureImageDirectory())}${path.sep}`.toLowerCase();
  return path.resolve(filePath).toLowerCase().startsWith(root);
}

async function saveCaptureScreenshot(dataUrl: string): Promise<string> {
  const match = dataUrl.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) throw new Error('The capture screenshot format is not supported.');
  const data = Buffer.from(match[2], 'base64');
  if (!data.length || data.length > MAX_CAPTURE_SCREENSHOT_BYTES) {
    throw new Error('The capture screenshot is too large.');
  }
  const isPng = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if ((match[1] === 'png' && !isPng) || (match[1] === 'jpeg' && !isJpeg)) {
    throw new Error('The capture screenshot data is invalid.');
  }
  const extension = match[1] === 'png' ? 'png' : 'jpg';
  const directory = captureImageDirectory();
  await fs.promises.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `${crypto.randomUUID()}.${extension}`);
  await fs.promises.writeFile(filePath, data);
  return filePath;
}

async function removeManagedCaptureImageIfUnused(
  filePath: string,
  database: VisualNovelDatabase,
): Promise<void> {
  if (
    !filePath
    || !isManagedCaptureAsset(filePath)
    || database.captures.some((capture) => capture.screenshotPath === filePath)
  ) {
    return;
  }
  await fs.promises.unlink(filePath).catch(() => undefined);
}

const CAPTURE_AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
  '.flac': 'audio/flac',
};

async function saveCaptureAudio(sourcePath: string): Promise<string> {
  const extension = path.extname(sourcePath).toLowerCase();
  if (!CAPTURE_AUDIO_MIME[extension]) throw new Error('The selected audio format is not supported.');
  const stat = await fs.promises.stat(sourcePath);
  if (!stat.isFile() || !stat.size || stat.size > MAX_CAPTURE_AUDIO_BYTES) {
    throw new Error('The selected audio clip must be a file smaller than 12 MB.');
  }
  const directory = captureImageDirectory();
  await fs.promises.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `${crypto.randomUUID()}${extension}`);
  await fs.promises.copyFile(sourcePath, filePath);
  return filePath;
}

function loadDatabase(): VisualNovelDatabase {
  try {
    return normalizeVisualNovelDatabase(JSON.parse(fs.readFileSync(databasePath(), 'utf8')));
  } catch {
    return createEmptyVisualNovelDatabase();
  }
}

function saveDatabase(database: VisualNovelDatabase): VisualNovelDatabase {
  const normalized = normalizeVisualNovelDatabase(database);
  const file = databasePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(normalized, null, 2), 'utf8');
  fs.renameSync(temporary, file);
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('visual-novel:changed', normalized);
  }
  return normalized;
}

function hookState(id: string): VisualNovelHookState {
  const relay = activeHookRelays.get(id);
  return {
    visualNovelId: id,
    active: !!relay,
    filePath: relay?.filePath ?? '',
    capturedLines: relay?.capturedLines ?? 0,
    lastError: relay?.lastError ?? '',
  };
}

function broadcastHookState(id: string): VisualNovelHookState {
  const state = hookState(id);
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('visual-novel:hookChanged', state);
  }
  return state;
}

function stopHookRelay(id: string): VisualNovelHookState {
  const relay = activeHookRelays.get(id);
  if (relay) {
    if (relay.pending) clearTimeout(relay.pending);
    relay.watcher.close();
    activeHookRelays.delete(id);
  }
  return broadcastHookState(id);
}

async function readHookRelay(id: string): Promise<void> {
  const relay = activeHookRelays.get(id);
  if (!relay || relay.reading) return;
  relay.reading = true;
  try {
    const stat = await fs.promises.stat(relay.filePath);
    if (!stat.isFile()) throw new Error('The hook output is no longer a file.');
    if (stat.size < relay.position) relay.position = 0;
    const available = stat.size - relay.position;
    if (available <= 0) return;
    const bytesToRead = Math.min(available, MAX_HOOK_READ_BYTES);
    const handle = await fs.promises.open(relay.filePath, 'r');
    try {
      const buffer = Buffer.allocUnsafe(bytesToRead);
      const { bytesRead } = await handle.read(buffer, 0, bytesToRead, relay.position);
      relay.position += bytesRead;
      const decoded = relay.remainder + decodeScript(buffer.subarray(0, bytesRead));
      const chunks = decoded.split(/\r?\n/u);
      relay.remainder = chunks.pop()?.slice(-2_000) ?? '';
      const lines = parseVisualNovelHookChunk(chunks.join('\n'));
      if (lines.length) {
        const database = loadDatabase();
        const entry = database.entries.find((candidate) => candidate.id === id);
        if (!entry) {
          stopHookRelay(id);
          return;
        }
        const next = appendVisualNovelCaptures(database, lines.map((line) => ({
          visualNovelId: id,
          japanese: line.japanese,
          speaker: line.speaker,
          kind: line.kind,
          routeId: entry.currentRouteId,
          chapter: entry.currentChapter,
          scene: entry.currentScene,
          source: 'hook',
        })), () => crypto.randomUUID());
        const previousIds = new Set(database.captures.map((capture) => capture.id));
        const added = next.captures.filter((capture) => !previousIds.has(capture.id)).length;
        if (added) {
          relay.capturedLines += added;
          noteCaptured(id, next.captures.filter((capture) => !previousIds.has(capture.id)));
          saveDatabase(next);
          broadcastHookState(id);
        }
      }
      if (stat.size > relay.position) scheduleHookRead(id);
    } finally {
      await handle.close();
    }
  } catch (error) {
    relay.lastError = error instanceof Error ? error.message : String(error);
    broadcastHookState(id);
  } finally {
    relay.reading = false;
  }
}

function scheduleHookRead(id: string): void {
  const relay = activeHookRelays.get(id);
  if (!relay || relay.pending) return;
  relay.pending = setTimeout(() => {
    const current = activeHookRelays.get(id);
    if (current) current.pending = null;
    void readHookRelay(id);
  }, 100);
}

// ---- study time ---------------------------------------------------------
//
// The shared study statistics (`renderer/stats.ts` `recordReading`) live in
// renderer storage, which main cannot write. A finished session is therefore
// queued on disk and every app window drains the queue (`visual-novel:
// drainStudyTime`); draining is atomic here, so exactly one window records it,
// and a session that ends while no window is open is recorded on the next boot.


function studyTimePath(): string {
  return path.join(app.getPath('userData'), 'immersion', 'visual-novel-study-time.json');
}

function readStudyTimeQueue(): VisualNovelStudyTime[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(studyTimePath(), 'utf8')) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is VisualNovelStudyTime => (
      !!item && typeof item === 'object'
      && typeof (item as VisualNovelStudyTime).visualNovelId === 'string'
      && Number.isFinite((item as VisualNovelStudyTime).seconds)
    )).slice(-200) : [];
  } catch {
    return [];
  }
}

function writeStudyTimeQueue(queue: VisualNovelStudyTime[]): void {
  const file = studyTimePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(queue.slice(-200)), 'utf8');
  fs.renameSync(temporary, file);
}

function queueStudyTime(item: VisualNovelStudyTime): void {
  if (item.seconds <= 0 && item.chars <= 0) return;
  writeStudyTimeQueue([...readStudyTimeQueue(), item]);
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('visual-novel:studyTime');
  }
}

export function drainStudyTimeQueue(): VisualNovelStudyTime[] {
  const queue = readStudyTimeQueue();
  if (queue.length) writeStudyTimeQueue([]);
  return queue;
}

function noteCaptured(id: string, captures: ReadonlyArray<{ japanese: string }>): void {
  if (!captures.length) return;
  activeGames.get(id)?.noteActivity();
  if (activeReadingSessions.has(id)) {
    sessionChars.set(id, (sessionChars.get(id) ?? 0) + captures.reduce(
      (total, capture) => total + [...capture.japanese].length,
      0,
    ));
  }
}

function stopReadingSession(id: string, now = Date.now()): VisualNovelDatabase {
  const startedAt = activeReadingSessions.get(id);
  activeGames.get(id)?.dispose();
  activeGames.delete(id);
  const live = captureSession.state();
  if (live.visualNovelId === id && !live.test) captureSession.stop();
  if (!startedAt) return loadDatabase();
  activeReadingSessions.delete(id);
  const chars = sessionChars.get(id) ?? 0;
  sessionChars.delete(id);
  const elapsedSec = Math.max(0, Math.round((now - startedAt) / 1000));
  const database = saveDatabase(updateVisualNovelProgress(loadDatabase(), id, {
    playtimeDeltaSec: elapsedSec,
    lastPlayedAt: now,
  }, now));
  const entry = database.entries.find((candidate) => candidate.id === id);
  queueStudyTime({ visualNovelId: id, title: entry?.title ?? '', seconds: elapsedSec, chars, endedAt: now });
  broadcastSessionState(id);
  return database;
}

function flushReadingSessions(now = Date.now()): void {
  if (!activeReadingSessions.size) return;
  let database = loadDatabase();
  const queue: VisualNovelStudyTime[] = [];
  for (const [id, startedAt] of activeReadingSessions) {
    const seconds = Math.max(0, Math.round((now - startedAt) / 1000));
    database = updateVisualNovelProgress(database, id, {
      playtimeDeltaSec: seconds,
      lastPlayedAt: now,
    }, now);
    const entry = database.entries.find((candidate) => candidate.id === id);
    queue.push({
      visualNovelId: id,
      title: entry?.title ?? '',
      seconds,
      chars: sessionChars.get(id) ?? 0,
      endedAt: now,
    });
  }
  activeReadingSessions.clear();
  sessionChars.clear();
  for (const game of activeGames.values()) game.dispose();
  activeGames.clear();
  saveDatabase(database);
  const pending = queue.filter((item) => item.seconds > 0 || item.chars > 0);
  if (pending.length) writeStudyTimeQueue([...readStudyTimeQueue(), ...pending]);
}


function sessionState(id: string): VisualNovelSessionState {
  return {
    visualNovelId: id,
    startedAt: activeReadingSessions.get(id) ?? null,
    tracking: activeReadingSessions.has(id) ? activeGames.get(id)?.mode() ?? 'manual' : null,
  };
}

function broadcastSessionState(id: string): void {
  const state = sessionState(id);
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('visual-novel:sessionChanged', state);
  }
}

// ---- live capture ----------------------------------------------------------

function saveCapturedLines(
  id: string,
  lines: ReadonlyArray<{ japanese: string; speaker: string; kind: VisualNovelCaptureInput['kind'] }>,
  source: VisualNovelCaptureSource,
): number {
  const database = loadDatabase();
  const entry = database.entries.find((candidate) => candidate.id === id);
  if (!entry) throw new Error('The visual novel does not exist.');
  const next = appendVisualNovelCaptures(database, lines.map((line) => ({
    visualNovelId: id,
    japanese: line.japanese,
    speaker: line.speaker,
    kind: line.kind,
    routeId: entry.currentRouteId,
    chapter: entry.currentChapter,
    scene: entry.currentScene,
    // A websocket texthooker is a text hook too, so it stays within the stored union.
    source: source === 'clipboard' ? 'clipboard' as const : 'hook' as const,
  })), () => crypto.randomUUID());
  const previousIds = new Set(database.captures.map((capture) => capture.id));
  const added = next.captures.filter((capture) => !previousIds.has(capture.id));
  if (added.length) {
    noteCaptured(id, added);
    saveDatabase(next);
  }
  return added.length;
}

function createNodeSocket(url: string): CaptureSocket {
  // Node's global WebSocket in Electron's main process. Connecting from main
  // keeps the renderer CSP's connect-src exactly as narrow as it is.
  const Socket = (globalThis as { WebSocket?: new (url: string) => CaptureSocket }).WebSocket;
  if (!Socket) throw new Error('WebSocket is unavailable in this build.');
  return new Socket(url);
}

const captureSession = createCaptureSession({
  readClipboard: () => clipboard.readText(),
  createSocket: createNodeSocket,
  saveLines: saveCapturedLines,
  broadcast: (state) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('visual-novel:captureChanged', state);
    }
  },
});

function startCapture(id: string, test = false) {
  const database = loadDatabase();
  const entry = database.entries.find((candidate) => candidate.id === id);
  if (!entry) throw new Error('The visual novel does not exist.');
  const settings = visualNovelSettings(database);
  return captureSession.start(id, {
    // A test listens to both sources, so it can say which one is wired up.
    clipboard: test || entry.clipboardCapture,
    websocket: test || settings.websocketEnabled,
    websocketUrl: settings.websocketUrl,
    test,
  });
}

function listProcessNames(): Promise<Set<string>> {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      reject(new Error('Process listing is Windows-only.'));
      return;
    }
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 8_000 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(parseTasklistCsv(String(stdout)));
    });
  });
}

function openReaderFor(id: string): void {
  const settings = visualNovelSettings(loadDatabase());
  openVisualNovelReader(id, settings.reader, (bounds) => {
    saveDatabase(updateVisualNovelSettings(loadDatabase(), { reader: { bounds } }));
  });
}

async function scanRelativeFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const queue: Array<{ directory: string; depth: number }> = [{ directory: root, depth: 0 }];
  while (queue.length && files.length < MAX_SCAN_FILES) {
    const current = queue.shift();
    if (!current || current.depth > MAX_SCAN_DEPTH) continue;
    const { directory, depth } = current;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (files.length >= MAX_SCAN_FILES) break;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory() && depth < MAX_SCAN_DEPTH) queue.push({ directory: absolute, depth: depth + 1 });
      else if (entry.isFile()) files.push(path.relative(root, absolute));
    }
  }
  return files;
}

const normalizePathKey = (value: string): string => path.resolve(value).replace(/\\/g, '/').toLowerCase();

function preferredExecutable(root: string, files: readonly string[]): string {
  const ignored = /(^|[\\/])(unins|uninstall|crash|unitycrashhandler|dxsetup|vc_redist|config|launcherconfig)/i;
  const candidates = files
    .filter((file) => /\.(exe|app|sh)$/i.test(file) && !ignored.test(file))
    .sort((a, b) => {
      const depthDifference = a.split(/[\\/]/).length - b.split(/[\\/]/).length;
      if (depthDifference) return depthDifference;
      const genericA = /(^|[\\/])(game|launcher|start)\.(exe|app|sh)$/i.test(a) ? 0 : 1;
      const genericB = /(^|[\\/])(game|launcher|start)\.(exe|app|sh)$/i.test(b) ? 0 : 1;
      return genericA - genericB || a.localeCompare(b);
    });
  return candidates[0] ? path.join(root, candidates[0]) : '';
}

function stripVndbMarkup(value: unknown): string {
  return typeof value === 'string'
    ? value
      .replace(/\[url=[^\]]+\](.*?)\[\/url\]/gi, '$1')
      .replace(/\[(?:b|i|u|s|raw|quote|spoiler)\]/gi, '')
      .replace(/\[\/(?:b|i|u|s|raw|quote|spoiler)\]/gi, '')
      .trim()
    : '';
}

function decodeScript(buffer: Buffer): string {
  const sample = buffer.subarray(1, Math.min(buffer.length, 65));
  const looksUtf16Le = (
    (buffer[0] === 0xff && buffer[1] === 0xfe)
    || (buffer.length >= 8 && [...sample].filter((value, index) => index % 2 === 0 && value === 0).length >= 8)
  );
  if (looksUtf16Le) return buffer.toString('utf16le').replace(/^\uFEFF/, '');
  const utf8 = buffer.toString('utf8');
  const replacementCount = (utf8.match(/\uFFFD/g) ?? []).length;
  if (replacementCount <= Math.max(2, utf8.length / 1000)) return utf8;
  try {
    return new TextDecoder('shift_jis').decode(buffer);
  } catch {
    return utf8;
  }
}

async function searchVndb(query: string): Promise<VisualNovelSourceResult[]> {
  const search = query.trim().slice(0, 160);
  if (search.length < 2) return [];
  const payload = await vndbQuery('vn', {
    filters: ['search', '=', search],
    fields: VNDB_VN_FIELDS,
    sort: 'searchrank',
    results: 12,
  }) as { results?: unknown[] };
  return vndbResultsToSourceResults(payload.results ?? []);
}

/** Map raw VNDB `vn` rows to source results, applying the adult-image filter. */
export function vndbResultsToSourceResults(rows: readonly unknown[]): VisualNovelSourceResult[] {
  const results = rows.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const raw = value as Record<string, unknown>;
    const providerId = typeof raw.id === 'string' ? raw.id : '';
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!providerId || !title) return [];
    const developers = Array.isArray(raw.developers) ? raw.developers : [];
    const tags = Array.isArray(raw.tags) ? raw.tags : [];
    const screenshots = Array.isArray(raw.screenshots) ? raw.screenshots : [];
    const voiceActors = Array.isArray(raw.va) ? raw.va : [];
    const titles = Array.isArray(raw.titles) ? raw.titles : [];
    const image = raw.image && typeof raw.image === 'object'
      ? raw.image as Record<string, unknown>
      : null;
    const average = typeof raw.average === 'number' ? raw.average : null;
    return [{
      provider: 'vndb' as const,
      providerId,
      title,
      japaneseTitle: titles.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const candidate = item as Record<string, unknown>;
        return candidate.lang === 'ja' && typeof candidate.title === 'string' ? [candidate.title] : [];
      })[0] ?? (typeof raw.alttitle === 'string' ? raw.alttitle : ''),
      alternativeTitles: [
        ...(Array.isArray(raw.aliases)
          ? raw.aliases.filter((item): item is string => typeof item === 'string')
          : []),
        ...titles.flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const candidate = item as Record<string, unknown>;
          return typeof candidate.title === 'string' && candidate.title !== title ? [candidate.title] : [];
        }),
      ],
      developer: developers.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const candidate = item as Record<string, unknown>;
        const name = typeof candidate.original === 'string' && candidate.original
          ? candidate.original
          : candidate.name;
        return typeof name === 'string' ? [name] : [];
      }).join(', '),
      releaseDate: typeof raw.released === 'string' ? raw.released : '',
      platforms: Array.isArray(raw.platforms)
        ? raw.platforms.filter((item): item is string => typeof item === 'string')
        : [],
      tags: tags
        .flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const candidate = item as Record<string, unknown>;
          return candidate.category === 'cont'
            && Number(candidate.spoiler ?? 0) === 0
            && typeof candidate.name === 'string'
            ? [{ name: candidate.name, rating: Number(candidate.rating ?? 0) }]
            : [];
        })
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 16)
        .map((item) => item.name),
      characters: [...new Set(voiceActors.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const relation = item as Record<string, unknown>;
        if (!relation.character || typeof relation.character !== 'object') return [];
        const character = relation.character as Record<string, unknown>;
        const name = typeof character.original === 'string' && character.original.trim()
          ? character.original.trim()
          : typeof character.name === 'string'
            ? character.name.trim()
            : '';
        return name ? [name] : [];
      }))].slice(0, 80),
      synopsis: stripVndbMarkup(raw.description),
      estimatedPlaytimeHours: typeof raw.length_minutes === 'number'
        ? Math.round(raw.length_minutes / 6) / 10
        : 0,
      coverImageUrl: image && Number(image.sexual ?? 0) === 0 && typeof image.url === 'string' ? image.url : '',
      screenshotUrls: screenshots.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const candidate = item as Record<string, unknown>;
        return Number(candidate.sexual ?? 0) === 0 && typeof candidate.url === 'string' ? [candidate.url] : [];
      }).slice(0, 8),
      communityRating: average == null ? null : Math.round((average > 10 ? average / 10 : average) * 10) / 10,
      communityVoteCount: typeof raw.votecount === 'number' ? raw.votecount : 0,
      sourceUrl: `https://vndb.org/${providerId}`,
      languages: Array.isArray(raw.languages)
        ? raw.languages.filter((item): item is string => typeof item === 'string')
        : [],
    }];
  });
  for (const result of results) {
    vetVndbArt([result.coverImageUrl, ...result.screenshotUrls]);
  }
  return results;
}

const tagIdCache = new Map<string, string>();

/** VNDB filters tags by id (`g123`), while the library stores tag NAMES. */
async function vndbTagId(name: string): Promise<string> {
  const key = name.trim().toLowerCase();
  if (!key) return '';
  const cached = tagIdCache.get(key);
  if (cached !== undefined) return cached;
  const payload = await vndbQuery('tag', {
    filters: ['search', '=', name.trim()],
    fields: 'name',
    results: 5,
  }) as { results?: Array<{ id?: unknown; name?: unknown }> };
  const rows = payload.results ?? [];
  const exact = rows.find((row) => typeof row.name === 'string' && row.name.toLowerCase() === key) ?? rows[0];
  const id = typeof exact?.id === 'string' && /^g\d+$/.test(exact.id) ? exact.id : '';
  tagIdCache.set(key, id);
  return id;
}

/**
 * Candidates for "what to read next": Japanese-original VNs available in
 * Japanese that share tags with what the learner finished or liked, excluding
 * anything already in the library. Ranking by difficulty happens in the
 * renderer (`rankVisualNovelSourceResults`), which knows the learner's level.
 */
async function recommendVndbCandidates(request: VisualNovelCandidateRequest): Promise<VisualNovelSourceResult[]> {
  const tagNames = [...new Set((request?.tags ?? []).map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 3);
  const tagIds = (await Promise.all(tagNames.map((name) => vndbTagId(name).catch(() => '')))).filter(Boolean);
  const filters: unknown[] = ['and', ['olang', '=', 'ja'], ['lang', '=', 'ja'], ['votecount', '>=', 50]];
  if (tagIds.length) filters.push(['or', ...tagIds.map((id) => ['tag', '=', id])]);
  const payload = await vndbQuery('vn', {
    filters,
    fields: VNDB_VN_FIELDS,
    sort: 'rating',
    reverse: true,
    results: 25,
  }) as { results?: unknown[] };
  const exclude = new Set((request?.excludeProviderIds ?? []).map((id) => String(id).toLowerCase()));
  return vndbResultsToSourceResults(payload.results ?? [])
    .filter((result) => !exclude.has(result.providerId.toLowerCase()));
}

async function fetchVndbSourceDetails(providerId: string): Promise<VisualNovelSourceDetails> {
  const id = providerId.trim();
  if (!/^v\d+$/i.test(id)) throw new Error('The VNDB visual novel ID is invalid.');
  const payload = await vndbQuery('release', {
    filters: ['vn', '=', ['id', '=', id]],
    fields: [
      'id',
      'title',
      'released',
      'languages{lang,title,mtl,main}',
      'platforms',
      'engine',
      'voiced',
      'official',
      'patch',
      'freeware',
      'vns{id,rtype}',
      'producers{id,name,original,publisher,developer}',
    ].join(','),
    sort: 'released',
    reverse: true,
    results: 100,
  }) as { results?: unknown[] };
  const releases = (payload.results ?? []).flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const raw = value as Record<string, unknown>;
    const voiceCode = typeof raw.voiced === 'number' ? raw.voiced : 0;
    const vns = Array.isArray(raw.vns) ? raw.vns : [];
    const linkedVn = vns.find((candidate) => (
      candidate
      && typeof candidate === 'object'
      && !Array.isArray(candidate)
      && (candidate as Record<string, unknown>).id === id
    )) as Record<string, unknown> | undefined;
    const release = normalizeVisualNovelRelease({
      id: raw.id,
      title: raw.title,
      releaseDate: raw.released,
      languages: Array.isArray(raw.languages) ? raw.languages.map((value) => {
        const language = value && typeof value === 'object' && !Array.isArray(value)
          ? value as Record<string, unknown>
          : {};
        return {
          code: language.lang,
          title: language.title,
          machineTranslated: language.mtl === true,
          main: language.main === true,
        };
      }) : [],
      platforms: raw.platforms,
      publishers: Array.isArray(raw.producers) ? raw.producers.flatMap((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
        const producer = value as Record<string, unknown>;
        if (producer.publisher !== true) return [];
        const name = typeof producer.original === 'string' && producer.original.trim()
          ? producer.original.trim()
          : typeof producer.name === 'string'
            ? producer.name.trim()
            : '';
        return name ? [name] : [];
      }) : [],
      engine: raw.engine,
      voiceCoverage: voiceCode === 1 ? 'none'
        : voiceCode === 2 ? 'ero-only'
          : voiceCode === 3 ? 'partial'
            : voiceCode === 4 ? 'full'
              : 'unknown',
      releaseType: linkedVn?.rtype,
      official: raw.official === true,
      patch: raw.patch === true,
      freeware: raw.freeware === true,
    });
    return release ? [release] : [];
  });
  return { provider: 'vndb', providerId: id, releases };
}

async function discoveryRoots(root: string): Promise<string[]> {
  let entries: fs.Dirent[] = [];
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return [
    root,
    ...entries
      .filter((entry) => entry.isDirectory())
      .slice(0, MAX_DISCOVERY_DIRECTORIES)
      .map((entry) => path.join(root, entry.name)),
  ];
}

async function discoverVisualNovels(root: string): Promise<VisualNovelDiscoveryCandidate[]> {
  const database = loadDatabase();
  const imported = new Set(database.entries.flatMap((entry) => [
    entry.installPath ? normalizePathKey(entry.installPath) : '',
    entry.executablePath ? normalizePathKey(entry.executablePath) : '',
  ]).filter(Boolean));
  const results: VisualNovelDiscoveryCandidate[] = [];
  const roots = await discoveryRoots(root);
  for (const directory of roots) {
    if (results.length >= MAX_DISCOVERY_RESULTS) break;
    const files = await scanRelativeFiles(directory);
    const engine = detectVisualNovelEngine(files);
    const executablePath = preferredExecutable(directory, files);
    if (
      !executablePath
      || (
        directory === root
        && roots.length > 1
        && path.dirname(executablePath) !== root
      )
    ) continue;
    results.push({
      title: path.basename(directory),
      installPath: directory,
      executablePath,
      engine,
      language: 'ja',
      alreadyImported: imported.has(normalizePathKey(directory))
        || imported.has(normalizePathKey(executablePath)),
    });
  }
  return results;
}

async function addVisualNovel(input: VisualNovelCreateInput): Promise<VisualNovelDatabase> {
  const executablePath = input.executablePath?.trim() ?? '';
  const installPath = input.installPath?.trim()
    || (executablePath ? path.dirname(executablePath) : '');
  const files = installPath && fs.existsSync(installPath) ? await scanRelativeFiles(installPath) : [];
  const engine = input.engine && input.engine !== 'unknown'
    ? input.engine
    : detectVisualNovelEngine(files);
  const database = loadDatabase();
  const installKey = installPath ? normalizePathKey(installPath) : '';
  const executableKey = executablePath ? normalizePathKey(executablePath) : '';
  const duplicate = database.entries.find((candidate) => (
    (installKey && candidate.installPath && normalizePathKey(candidate.installPath) === installKey)
    || (executableKey && candidate.executablePath && normalizePathKey(candidate.executablePath) === executableKey)
  ));
  if (duplicate) throw new Error(`"${duplicate.title}" is already in the Visual Novel library.`);
  const entry = createVisualNovelEntry({
    ...input,
    installPath,
    executablePath,
    engine,
  }, crypto.randomUUID());
  return saveDatabase(upsertVisualNovelEntry(database, entry));
}

export function registerVisualNovelIpc(): void {
  app.once('before-quit', () => {
    flushReadingSessions();
    captureSession.stop();
    for (const id of [...activeHookRelays.keys()]) stopHookRelay(id);
  });
  ipcMain.handle('visual-novel:list', async () => loadDatabase());

  ipcMain.handle('visual-novel:searchSource', async (_event, query: string) => {
    try {
      return { ok: true as const, results: await searchVndb(query) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:art', async (_event, url: string) => {
    try {
      if (!isVndbArtUrl(url) || !isVettedArt(url)) {
        return { ok: false as const, error: 'That image is not in the visual novel library.' };
      }
      return { ok: true as const, url: await cacheVndbArt(url, mediaRoot()) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:recommendCandidates', async (_event, request: VisualNovelCandidateRequest) => {
    try {
      return { ok: true as const, results: await recommendVndbCandidates(request) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:sourceDetails', async (_event, providerId: string) => {
    try {
      return { ok: true as const, details: await fetchVndbSourceDetails(providerId) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:pickExecutable', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose visual novel executable',
      properties: ['openFile'],
      filters: process.platform === 'win32'
        ? [{ name: 'Applications', extensions: ['exe'] }, { name: 'All files', extensions: ['*'] }]
        : [{ name: 'All files', extensions: ['*'] }],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle('visual-novel:discoverFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose a folder containing visual novels',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return [];
    return discoverVisualNovels(result.filePaths[0]);
  });

  ipcMain.handle('visual-novel:exportLibrary', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Export Visual Novel library',
      defaultPath: 'visual-novel-library.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false as const, canceled: true };
    try {
      await fs.promises.writeFile(result.filePath, JSON.stringify(loadDatabase(), null, 2), 'utf8');
      return { ok: true as const, path: result.filePath };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:importLibrary', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Visual Novel library',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false as const, canceled: true };
    try {
      const imported = normalizeVisualNovelDatabase(JSON.parse(
        await fs.promises.readFile(result.filePaths[0], 'utf8'),
      ));
      const before = loadDatabase();
      const merged = mergeVisualNovelDatabases(before, imported, () => crypto.randomUUID());
      return {
        ok: true as const,
        database: saveDatabase(merged),
        addedEntries: Math.max(0, merged.entries.length - before.entries.length),
        addedCaptures: Math.max(0, merged.captures.length - before.captures.length),
      };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:exportCommunityBundle', async (
    _event,
    title: string,
    content: string,
  ) => {
    if (Buffer.byteLength(content, 'utf8') > MAX_COMMUNITY_BUNDLE_BYTES) {
      return { ok: false as const, error: 'The community bundle is too large to export.' };
    }
    const printableTitle = [...(title || 'visual-novel')]
      .filter((character) => character.charCodeAt(0) >= 32)
      .join('');
    const safeTitle = printableTitle
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'visual-novel';
    const result = await dialog.showSaveDialog({
      title: 'Export Visual Novel community bundle',
      defaultPath: `${safeTitle}-study-bundle.json`,
      filters: [{ name: 'Visual Novel study bundle', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false as const, canceled: true };
    try {
      await fs.promises.writeFile(result.filePath, content, 'utf8');
      return { ok: true as const, path: result.filePath };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:pickCommunityBundle', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Visual Novel community bundle',
      properties: ['openFile'],
      filters: [{ name: 'Visual Novel study bundle', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false as const, canceled: true };
    try {
      const stat = await fs.promises.stat(result.filePaths[0]);
      if (stat.size > MAX_COMMUNITY_BUNDLE_BYTES) {
        return { ok: false as const, error: 'The selected community bundle is too large.' };
      }
      return {
        ok: true as const,
        content: await fs.promises.readFile(result.filePaths[0], 'utf8'),
      };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:add', async (_event, input: VisualNovelCreateInput) => {
    try {
      return { ok: true as const, database: await addVisualNovel(input) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:importDiscovered', async (
    _event,
    candidates: VisualNovelCreateInput[],
  ) => {
    try {
      let database = loadDatabase();
      let imported = 0;
      const existingPaths = new Set(database.entries.flatMap((entry) => [
        entry.installPath ? normalizePathKey(entry.installPath) : '',
        entry.executablePath ? normalizePathKey(entry.executablePath) : '',
      ]).filter(Boolean));
      for (const candidate of (candidates ?? []).slice(0, MAX_DISCOVERY_RESULTS)) {
        const installPath = candidate.installPath?.trim() ?? '';
        const executablePath = candidate.executablePath?.trim() ?? '';
        const installKey = installPath ? normalizePathKey(installPath) : '';
        const executableKey = executablePath ? normalizePathKey(executablePath) : '';
        if ((installKey && existingPaths.has(installKey)) || (executableKey && existingPaths.has(executableKey))) continue;
        const entry = createVisualNovelEntry(candidate, crypto.randomUUID());
        database = upsertVisualNovelEntry(database, entry);
        if (installKey) existingPaths.add(installKey);
        if (executableKey) existingPaths.add(executableKey);
        imported += 1;
      }
      return { ok: true as const, database: saveDatabase(database), imported };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:updateMetadata', async (
    _event,
    id: string,
    patch: VisualNovelMetadataPatch,
  ) => {
    try {
      return {
        ok: true as const,
        database: saveDatabase(updateVisualNovelMetadata(loadDatabase(), id, patch ?? {})),
      };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:remove', async (_event, id: string) => {
    activeReadingSessions.delete(id);
    activeGames.get(id)?.dispose();
    activeGames.delete(id);
    if (captureSession.state().visualNovelId === id) captureSession.stop();
    if (activeHookRelays.has(id)) stopHookRelay(id);
    const database = loadDatabase();
    return saveDatabase({
      ...database,
      entries: database.entries.filter((entry) => entry.id !== id),
      captures: database.captures.filter((capture) => capture.visualNovelId !== id),
    });
  });

  ipcMain.handle('visual-novel:updateProgress', async (
    _event,
    id: string,
    patch: VisualNovelProgressPatch,
  ) => saveDatabase(updateVisualNovelProgress(loadDatabase(), id, patch ?? {})));

  ipcMain.handle('visual-novel:updateRoutes', async (
    _event,
    id: string,
    routes: VisualNovelRouteInput[],
  ) => {
    try {
      return {
        ok: true as const,
        database: saveDatabase(updateVisualNovelRoutes(loadDatabase(), id, routes ?? [])),
      };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:readClipboard', async () => clipboard.readText().trim());

  ipcMain.handle('visual-novel:hookState', async (_event, id: string) => hookState(id));

  ipcMain.handle('visual-novel:startHook', async (_event, id: string) => {
    const entry = loadDatabase().entries.find((candidate) => candidate.id === id);
    if (!entry) return { ok: false as const, error: 'The visual novel does not exist.' };
    const result = await dialog.showOpenDialog({
      title: 'Choose text-hook output file',
      defaultPath: entry.installPath || undefined,
      properties: ['openFile'],
      filters: [
        { name: 'Text output', extensions: ['txt', 'log', 'csv'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false as const, canceled: true };
    try {
      const filePath = result.filePaths[0];
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) throw new Error('The selected hook output is not a file.');
      if (activeHookRelays.has(id)) stopHookRelay(id);
      const relay: ActiveHookRelay = {
        watcher: fs.watch(filePath, () => scheduleHookRead(id)),
        filePath,
        position: stat.size,
        pending: null,
        reading: false,
        capturedLines: 0,
        lastError: '',
        remainder: '',
      };
      activeHookRelays.set(id, relay);
      relay.watcher.on('error', (error) => {
        relay.lastError = error.message;
        broadcastHookState(id);
      });
      return { ok: true as const, state: broadcastHookState(id) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:stopHook', async (_event, id: string) => stopHookRelay(id));

  ipcMain.handle('visual-novel:pickScripts', async (_event, id: string) => {
    const entry = loadDatabase().entries.find((candidate) => candidate.id === id);
    if (!entry) return { ok: false as const, error: 'The visual novel does not exist.' };
    const result = await dialog.showOpenDialog({
      title: 'Choose visual novel script files',
      defaultPath: entry.installPath || undefined,
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Visual novel scripts', extensions: ['rpy', 'ks', 'txt', 'scr', 'csv'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled) return { ok: false as const, canceled: true };
    try {
      const lines: VisualNovelScriptLine[] = [];
      let totalBytes = 0;
      for (const filePath of result.filePaths.slice(0, MAX_SCRIPT_FILES)) {
        const stat = await fs.promises.stat(filePath);
        if (!stat.isFile() || stat.size > MAX_SCRIPT_FILE_BYTES) continue;
        totalBytes += stat.size;
        if (totalBytes > MAX_SCRIPT_TOTAL_BYTES) break;
        const content = decodeScript(await fs.promises.readFile(filePath));
        lines.push(...extractVisualNovelScript(content, path.basename(filePath), entry.engine));
        if (lines.length >= VISUAL_NOVEL_SCRIPT_LINE_LIMIT) break;
      }
      return { ok: true as const, lines: lines.slice(0, VISUAL_NOVEL_SCRIPT_LINE_LIMIT) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:importScriptLines', async (
    _event,
    id: string,
    lines: VisualNovelScriptLine[],
  ) => {
    try {
      const selected = (lines ?? []).slice(0, VISUAL_NOVEL_SCRIPT_LINE_LIMIT);
      const before = loadDatabase();
      const database = appendVisualNovelCaptures(
        before,
        selected.map((line) => ({
          visualNovelId: id,
          kind: line.kind,
          japanese: line.japanese,
          speaker: line.speaker,
          scene: line.scene || `${line.fileName}:${line.lineNumber}`,
          source: 'import' as const,
        })),
        () => crypto.randomUUID(),
      );
      return {
        ok: true as const,
        database: saveDatabase(database),
        imported: Math.max(0, database.captures.length - before.captures.length),
      };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:sessionState', async (_event, id: string) => sessionState(id));

  ipcMain.handle('visual-novel:captureState', async () => captureSession.state());

  ipcMain.handle('visual-novel:captureStart', async (_event, id: string, options?: { test?: boolean }) => {
    try {
      return { ok: true as const, state: startCapture(id, options?.test === true) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:captureStop', async () => captureSession.stop());

  ipcMain.handle('visual-novel:updateSettings', async (_event, patch: VisualNovelSettingsPatch) => {
    const database = saveDatabase(updateVisualNovelSettings(loadDatabase(), patch ?? {}));
    const settings = visualNovelSettings(database);
    if (patch?.reader?.opacity !== undefined) setReaderOpacity(settings.reader.opacity);
    // A websocket change applies to the running session at once.
    const live = captureSession.state();
    if (live.active && !live.test && (patch?.websocketEnabled !== undefined || patch?.websocketUrl !== undefined)) {
      startCapture(live.visualNovelId);
    }
    return database;
  });

  ipcMain.handle('visual-novel:pickLocaleEmulator', async () => {
    const result = await dialog.showOpenDialog({
      title: 'LEProc.exe',
      properties: ['openFile'],
      filters: [{ name: 'LEProc.exe', extensions: ['exe'] }],
    });
    const picked = result.canceled ? '' : result.filePaths[0] ?? '';
    if (!picked || !/leproc\.exe$/i.test(picked)) return { ok: false as const, canceled: result.canceled };
    return {
      ok: true as const,
      database: saveDatabase(updateVisualNovelSettings(loadDatabase(), { localeEmulatorPath: picked })),
    };
  });

  ipcMain.handle('visual-novel:readerOpen', async (_event, id?: string) => {
    openReaderFor(typeof id === 'string' && id ? id : readerTarget());
    return { ok: true as const };
  });

  ipcMain.handle('visual-novel:readerClose', async () => {
    closeVisualNovelReader();
  });

  ipcMain.handle('visual-novel:readerTarget', async () => readerTarget()
    || captureSession.state().visualNovelId
    || [...activeReadingSessions.keys()][0]
    || '');

  ipcMain.handle('visual-novel:drainStudyTime', async () => drainStudyTimeQueue());

  ipcMain.handle('visual-novel:stopSession', async (_event, id: string) => {
    const stopped = activeReadingSessions.has(id);
    // Stopping by hand forgets the game; it is not killed.
    return { database: stopReadingSession(id), stopped };
  });

  ipcMain.handle('visual-novel:captureText', async (_event, input: VisualNovelCaptureInput) => {
    try {
      const database = appendVisualNovelCapture(
        loadDatabase(),
        { ...input, screenshotPath: '', audioPath: '' },
        crypto.randomUUID(),
      );
      return { ok: true as const, database: saveDatabase(database) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:captureMany', async (
    _event,
    inputs: VisualNovelCaptureInput[],
    options: VisualNovelCaptureBatchOptions = {},
  ) => {
    let screenshotPath = '';
    try {
      const before = loadDatabase();
      screenshotPath = options.screenshotDataUrl
        ? await saveCaptureScreenshot(options.screenshotDataUrl)
        : '';
      const database = appendVisualNovelCaptures(
        before,
        (inputs ?? []).slice(0, 500).map((input) => ({
          ...input,
          screenshotPath,
          audioPath: '',
        })),
        () => crypto.randomUUID(),
      );
      if (screenshotPath && !database.captures.some((capture) => capture.screenshotPath === screenshotPath)) {
        await removeManagedCaptureImageIfUnused(screenshotPath, database);
        screenshotPath = '';
      }
      return {
        ok: true as const,
        database: saveDatabase(database),
        imported: Math.max(0, database.captures.length - before.captures.length),
      };
    } catch (error) {
      if (screenshotPath) {
        await removeManagedCaptureImageIfUnused(screenshotPath, loadDatabase());
      }
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:updateCapture', async (
    _event,
    id: string,
    patch: VisualNovelCapturePatch,
  ) => {
    try {
      return {
        ok: true as const,
        database: saveDatabase(updateVisualNovelCapture(loadDatabase(), id, patch ?? {})),
      };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:removeCapture', async (_event, id: string) => {
    const before = loadDatabase();
    return saveDatabase(removeVisualNovelCapture(before, id));
  });

  ipcMain.handle('visual-novel:readCaptureImage', async (_event, filePath: string) => {
    try {
      if (!filePath || !isManagedCaptureAsset(filePath)) {
        throw new Error('The requested capture image is not managed by the visual novel library.');
      }
      const data = await fs.promises.readFile(filePath);
      if (!data.length || data.length > MAX_CAPTURE_SCREENSHOT_BYTES) {
        throw new Error('The capture image is unavailable or too large.');
      }
      const mime = path.extname(filePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
      return { ok: true as const, dataUrl: `data:${mime};base64,${data.toString('base64')}` };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:attachCaptureAudio', async (_event, id: string) => {
    const before = loadDatabase();
    const capture = before.captures.find((candidate) => candidate.id === id);
    if (!capture) return { ok: false as const, error: 'The captured sentence does not exist.' };
    const entry = before.entries.find((candidate) => candidate.id === capture.visualNovelId);
    const result = await dialog.showOpenDialog({
      title: 'Attach visual novel voice clip',
      defaultPath: entry?.installPath || undefined,
      properties: ['openFile'],
      filters: [
        { name: 'Audio clips', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'webm', 'flac'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false as const, canceled: true };
    try {
      const audioPath = await saveCaptureAudio(result.filePaths[0]);
      const database = saveDatabase({
        ...before,
        captures: before.captures.map((candidate) => candidate.id === id
          ? { ...candidate, audioPath }
          : candidate),
      });
      return { ok: true as const, database };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:removeCaptureAudio', async (_event, id: string) => {
    const before = loadDatabase();
    if (!before.captures.some((candidate) => candidate.id === id)) {
      return { ok: false as const, error: 'The captured sentence does not exist.' };
    }
    return {
      ok: true as const,
      database: saveDatabase({
        ...before,
        captures: before.captures.map((candidate) => candidate.id === id
          ? { ...candidate, audioPath: '' }
          : candidate),
      }),
    };
  });

  ipcMain.handle('visual-novel:readCaptureAudio', async (_event, filePath: string) => {
    try {
      if (!filePath || !isManagedCaptureAsset(filePath)) {
        throw new Error('The requested audio is not managed by the visual novel library.');
      }
      const extension = path.extname(filePath).toLowerCase();
      const mime = CAPTURE_AUDIO_MIME[extension];
      if (!mime) throw new Error('The capture audio format is not supported.');
      const data = await fs.promises.readFile(filePath);
      if (!data.length || data.length > MAX_CAPTURE_AUDIO_BYTES) {
        throw new Error('The capture audio is unavailable or too large.');
      }
      return {
        ok: true as const,
        dataUrl: `data:${mime};base64,${data.toString('base64')}`,
        filename: `visual-novel-voice${extension}`,
      };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('visual-novel:launch', async (_event, id: string) => {
    const entry = loadDatabase().entries.find((candidate) => candidate.id === id);
    if (!entry?.executablePath) return { ok: false as const, error: 'No executable is configured.' };
    if (!fs.existsSync(entry.executablePath)) return { ok: false as const, error: 'The executable could not be found.' };
    const settings = visualNovelSettings(loadDatabase());
    if (!activeGames.has(id)) {
      const installPath = entry.installPath || path.dirname(entry.executablePath);
      const files = await scanRelativeFiles(installPath).catch(() => [] as string[]);
      try {
        const game = trackGame({
          executablePath: entry.executablePath,
          candidateNames: candidateGameNames(entry.executablePath, files),
          localeEmulatorPath: settings.localeEmulatorPath,
        }, {
          spawn,
          listProcessNames,
          // An executable whose manifest demands elevation cannot be spawned
          // directly; the shell starts it with a UAC prompt and it is then
          // followed by process name.
          onSpawnError: () => {
            void shell.openPath(entry.executablePath);
          },
        }, () => {
          activeGames.delete(id);
          stopReadingSession(id);
        });
        activeGames.set(id, game);
      } catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
      }
    }
    const startedAt = activeReadingSessions.get(id) ?? Date.now();
    activeReadingSessions.set(id, startedAt);
    const database = updateVisualNovelProgress(loadDatabase(), id, {
      status: entry.status === 'planned' ? 'reading' : entry.status,
      lastPlayedAt: startedAt,
    });
    saveDatabase(database);
    // The reading loop starts with the game: capture on, reader beside it.
    try {
      startCapture(id);
    } catch {
      /* capture is best-effort; the game is already running */
    }
    if (settings.reader.autoShow) openReaderFor(id);
    broadcastSessionState(id);
    return { ok: true as const, startedAt };
  });
}
