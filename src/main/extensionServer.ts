/**
 * Loopback HTTP bridge for the Chrome extension (Phase 9).
 * Binds 127.0.0.1 only; every mutating route requires a Bearer pairing token.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron';
import {
  EXTENSION_PORT,
  INBOX_FOLDER,
  buildInboxMetaBase,
  checkBearerToken,
  isAllowedExtensionOrigin,
} from '../shared/inboxMeta';
import {
  classifyMineSelection,
  detectArticleSubtype,
  detectContentCategory,
  detectPageKind,
  extractMineTerm,
  parseYoutubeVideoId,
  primaryCaptureAction,
  type ExtensionContentCategory,
  type ExtensionMineMode,
} from '../shared/extensionCapture';
import {
  planExtensionTranscribe,
  resolveExtensionTranscribeStatus,
} from '../shared/extensionTranscribe';
import { youtubeIdFromFileName } from '../shared/filesApp/catalog';
import { extensionContractManifest } from '../shared/extensionContract';
import { extractReadableFromHtml, htmlToText } from './readabilityExtract';
import { importGeneratedArticle, importMangaFromImageUrls } from './library';
import { mineNote } from './anki';
import type { MineNoteResult } from '../shared/anki';
import {
  ensureChromeExtensionFolder,
  getChromeExtensionFolder,
  readInstalledExtensionVersion,
} from './extensionInstall';
import { mangaOcrAvailable, recognizeMangaOcrRegionsDataUrl } from './mangaOcr';
import { installedPaddleLangs, paddleOcrAvailable, type PaddleLang } from './paddleOcr';
import { ocrAuto } from './ocrAuto';
import { startDownload } from './downloads';
import { loadProfileRules } from './profileRules';
import {
  detectMineLanguage,
  resolveProfileMatch,
  type MineCardKind,
  type MineLanguage,
  type MineSource,
} from '../shared/profileRules';

const STATE_FILE = 'extension-bridge.json';

interface DownloadJob {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  percent: number;
  stage: string;
  error?: string;
  results?: Array<{ videoId: string; ok: boolean; error?: string; mediaItemId?: string }>;
  createdAt: number;
}

const downloadJobs = new Map<string, DownloadJob>();
type KnownLevelsBridgeResult =
  | { ok: true; levels: Record<string, number> }
  | { ok: false; error: string; levels: Record<string, number> };

type ClipboardListBridgeResult =
  | { ok: true; entries: Array<{ id: string; type: string; text: string; createdAt: number }> }
  | { ok: false; error: string; entries: Array<{ id: string; type: string; text: string; createdAt: number }> };

const pendingLevelReplies = new Map<
  string,
  { resolve: (m: KnownLevelsBridgeResult) => void; timer: ReturnType<typeof setTimeout> }
>();
const pendingClipboardListReplies = new Map<
  string,
  {
    resolve: (r: ClipboardListBridgeResult) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const pendingKnownSetReplies = new Map<
  string,
  { resolve: (r: { ok: boolean; error?: string }) => void; timer: ReturnType<typeof setTimeout> }
>();
const pendingComprehensibilityReplies = new Map<
  string,
  {
    resolve: (r: { ok: boolean; percent?: number; known?: number; total?: number; error?: string }) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const pendingGrammarMatchReplies = new Map<
  string,
  {
    resolve: (r: {
      ok: boolean;
      matches?: Array<{ id: string; title: string; level: string; meaning: string }>;
      error?: string;
    }) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const pendingTranscribeReplies = new Map<
  string,
  {
    resolve: (result: { ok: boolean; text?: string; error?: string }) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

export interface LevelEstimateBridgeResult {
  ok: boolean;
  /** Compact badge: N3 / HSK4 / X / — */
  badge: string;
  /** No relevant JA/ZH text on the page. */
  empty?: boolean;
  /** Settings vocab bands missing — cannot score. */
  noLists?: boolean;
  lang?: 'ja' | 'zh' | null;
  scheme?: 'jlpt' | 'hsk' | null;
  label?: string;
  confidence?: number;
  error?: string;
}

const pendingLevelEstimateReplies = new Map<
  string,
  { resolve: (r: LevelEstimateBridgeResult) => void; timer: ReturnType<typeof setTimeout> }
>();

function broadcastClipboardAppend(entry: {
  text: string;
  type?: string;
  url?: string;
  title?: string;
}): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('extension:clipboard-append', entry);
  }
}

// Keep in sync with the switch in src/renderer/extensionBridgeUi.ts
// (handleExtensionUiOpen) — every target accepted here must resolve to a
// real case there, or the renderer will silently no-op on focus.
const UI_OPEN_TARGETS = new Set([
  'clipboard',
  'clipboard-history',
  'anki',
  'anki-mapping',
  'profile-rules',
  'mining-rules',
  'extension-bridge',
  'extension-settings',
  'flashcards',
  'statistics',
  'stats',
  'grammar',
  'grammar-practice',
  'notebook',
  'translate',
  'translate-history',
  'library',
  'inbox',
  'youtube',
  'special',
]);

/** Focus a GrammarX window and tell the renderer to open an in-app surface. */
function broadcastUiOpen(target: string, extra?: Record<string, unknown>): boolean {
  const windows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
  if (!windows.length) return false;
  const focused = BrowserWindow.getFocusedWindow();
  const main =
    focused && !focused.isDestroyed()
      ? focused
      : (windows.find((w) => !w.isAlwaysOnTop()) ?? windows[0]);
  if (main.isMinimized()) main.restore();
  main.show();
  main.focus();
  for (const w of windows) {
    w.webContents.send('extension:ui-open', { target, ...extra });
  }
  return true;
}

function requestKnownLevels(terms: string[]): Promise<KnownLevelsBridgeResult> {
  const id = crypto.randomUUID();
  const list = terms.filter((t) => typeof t === 'string' && t.trim()).slice(0, 400);
  if (!list.length) return Promise.resolve({ ok: true, levels: {} });
  const windows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
  if (!windows.length) {
    return Promise.resolve({ ok: false, error: 'GrammarX window is not open', levels: {} });
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingLevelReplies.delete(id);
      resolve({ ok: false, error: 'timeout', levels: {} });
    }, 2000);
    pendingLevelReplies.set(id, { resolve, timer });
    for (const w of windows) {
      w.webContents.send('extension:known-levels-request', { id, terms: list });
    }
  });
}

const MAX_LEVEL_ESTIMATE_CHARS = 40_000;

function requestLevelEstimate(text: string): Promise<LevelEstimateBridgeResult> {
  const sample = String(text || '').slice(0, MAX_LEVEL_ESTIMATE_CHARS);
  const windows = BrowserWindow.getAllWindows();
  if (!windows.length) {
    return Promise.resolve({
      ok: false,
      badge: '—',
      error: 'GrammarX window is not open',
    });
  }
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingLevelEstimateReplies.delete(id);
      resolve({ ok: false, badge: '—', error: 'Level estimate timed out' });
    }, 4000);
    pendingLevelEstimateReplies.set(id, { resolve, timer });
    for (const w of windows) {
      w.webContents.send('extension:level-estimate-request', { id, text: sample });
    }
  });
}

function requestClipboardList(): Promise<ClipboardListBridgeResult> {
  const id = crypto.randomUUID();
  const windows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
  if (!windows.length) {
    return Promise.resolve({ ok: false, error: 'GrammarX window is not open', entries: [] });
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingClipboardListReplies.delete(id);
      resolve({ ok: false, error: 'timeout', entries: [] });
    }, 2000);
    pendingClipboardListReplies.set(id, { resolve, timer });
    for (const w of windows) {
      w.webContents.send('extension:clipboard-list-request', { id });
    }
  });
}

function requestSetKnownLevel(term: string, level: number): Promise<{ ok: boolean; error?: string }> {
  const windows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
  if (!windows.length) {
    return Promise.resolve({ ok: false, error: 'GrammarX window is not open' });
  }
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingKnownSetReplies.delete(id);
      resolve({ ok: false, error: 'timeout' });
    }, 2000);
    pendingKnownSetReplies.set(id, { resolve, timer });
    for (const w of windows) {
      w.webContents.send('extension:known-level-set', { id, term, level });
    }
  });
}

function requestComprehensibility(text: string): Promise<{
  ok: boolean;
  percent?: number;
  known?: number;
  total?: number;
  error?: string;
}> {
  const sample = String(text || '').slice(0, MAX_LEVEL_ESTIMATE_CHARS);
  const windows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
  if (!windows.length) {
    return Promise.resolve({ ok: false, error: 'GrammarX window is not open' });
  }
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingComprehensibilityReplies.delete(id);
      resolve({ ok: false, error: 'timeout' });
    }, 8000);
    pendingComprehensibilityReplies.set(id, { resolve, timer });
    for (const w of windows) {
      w.webContents.send('extension:comprehensibility-request', { id, text: sample });
    }
  });
}

function requestGrammarMatch(text: string): Promise<{
  ok: boolean;
  matches?: Array<{ id: string; title: string; level: string; meaning: string }>;
  error?: string;
}> {
  const sample = String(text || '').trim().slice(0, 500);
  if (!sample) return Promise.resolve({ ok: false, error: 'text required', matches: [] });
  const windows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
  if (!windows.length) {
    return Promise.resolve({ ok: false, error: 'GrammarX window is not open', matches: [] });
  }
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingGrammarMatchReplies.delete(id);
      resolve({ ok: false, error: 'timeout', matches: [] });
    }, 4000);
    pendingGrammarMatchReplies.set(id, { resolve, timer });
    for (const w of windows) {
      w.webContents.send('extension:grammar-match-request', { id, text: sample });
    }
  });
}

/** Ask the renderer to run the installed Whisper pipeline on 16 kHz mono PCM. */
function requestWhisperTranscribe(pcm: ArrayBuffer): Promise<{ ok: boolean; text?: string; error?: string }> {
  const id = crypto.randomUUID();
  const windows = BrowserWindow.getAllWindows();
  if (!windows.length) {
    return Promise.resolve({ ok: false, error: 'GrammarX window is not open — open the app to transcribe.' });
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingTranscribeReplies.delete(id);
      resolve({ ok: false, error: 'Transcription timed out — is a Whisper model installed?' });
    }, 180_000);
    pendingTranscribeReplies.set(id, { resolve, timer });
    const buf = Buffer.from(pcm);
    for (const w of windows) {
      w.webContents.send('extension:transcribe-request', { id, pcmBase64: buf.toString('base64') });
    }
  });
}

export interface ExtensionBridgeState {
  token: string;
  port: number;
}

export interface ExtensionBridgeStatus {
  running: boolean;
  port: number;
  token: string;
  folderPath: string;
  /** Manifest version in the load-unpacked folder (empty when unreadable). */
  extensionVersion: string;
  /**
   * Why the server is not listening, when it is not. `undefined` while running.
   *
   * A bind failure used to go to `console.error` alone, so the only thing a
   * surface could say was "stopped" — with no reason, and next to a port number
   * that another process owned. Named here so the settings card can say which.
   */
  stoppedReasonKey?: 'portInUse' | 'listenFailed';
  /** Free-form detail for `listenFailed`; the port is already in `port`. */
  stoppedDetail?: string;
}

let server: http.Server | null = null;
let bridgeState: ExtensionBridgeState | null = null;
/** Set by the listen error handler, cleared once a listen succeeds. */
let listenFailure: Pick<ExtensionBridgeStatus, 'stoppedReasonKey' | 'stoppedDetail'> | null = null;

/**
 * A dev-only port override, so a second dev instance can run its own extension
 * server instead of silently losing the bind to the first one.
 *
 * `JP_DEBUG_PORT` / `JP_USER_DATA_DIR` (64c22632) already give a worktree its own
 * debug bridge and its own profile, but the extension server stayed on the shared
 * 18765. Measured 2026-09-01: the second instance failed to bind, reported
 * `running: false` with no reason, and STILL advertised 18765 — which is the
 * FIRST app's server. Anything driving the extension against that status measures
 * the wrong app on the wrong profile, which is precisely the class of false
 * result this plan's gates exist to catch.
 *
 * Deliberately NOT persisted: the override belongs to the environment, not to the
 * user's profile, so `saveState` must never write it into the state file.
 * Guarded by `!app.isPackaged`, like the other two, so a shipped app cannot be
 * moved off its port by a stray environment variable.
 */
function devPortOverride(): number | null {
  if (app.isPackaged) return null;
  const raw = Number.parseInt(process.env.JP_EXTENSION_PORT ?? '', 10);
  return Number.isInteger(raw) && raw > 0 && raw < 65536 ? raw : null;
}

/** The port this process actually listens on — and therefore the one to report. */
function effectivePort(state: ExtensionBridgeState): number {
  return devPortOverride() ?? state.port;
}

function statePath(): string {
  return path.join(app.getPath('userData'), STATE_FILE);
}

// The pairing token is a shared secret shown to the user (Settings) and sent
// as a Bearer header by the extension — it's necessarily plaintext at
// runtime. What was missing (PHASE_6_5_AUDIT.md §3/§8) was at-rest
// protection: it previously sat in plaintext JSON on disk. Encrypted here
// via safeStorage the same way as the AI provider keys in mining.ts.
interface ExtensionBridgeStateFile {
  token?: string;
  port?: number;
  _encrypted?: boolean;
}

function encryptToken(token: string): string {
  if (!token || !safeStorage.isEncryptionAvailable()) return token;
  return safeStorage.encryptString(token).toString('base64');
}

function decryptToken(stored: string, encrypted: boolean): string {
  if (!stored) return '';
  if (!encrypted) return stored;
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'));
  } catch {
    return '';
  }
}

function loadOrCreateState(): ExtensionBridgeState {
  try {
    const raw = fs.readFileSync(statePath(), 'utf8');
    const parsed = JSON.parse(raw) as ExtensionBridgeStateFile;
    const token = decryptToken(typeof parsed.token === 'string' ? parsed.token : '', parsed._encrypted === true);
    if (token.length >= 16) {
      bridgeState = {
        token,
        port: typeof parsed.port === 'number' ? parsed.port : EXTENSION_PORT,
      };
      // Migrate a legacy plaintext state file to encrypted-at-rest immediately.
      if (parsed._encrypted !== true) saveState(bridgeState);
      return bridgeState;
    }
  } catch {
    /* create fresh */
  }
  bridgeState = {
    token: crypto.randomBytes(24).toString('hex'),
    port: EXTENSION_PORT,
  };
  saveState(bridgeState);
  return bridgeState;
}

function saveState(state: ExtensionBridgeState): void {
  bridgeState = state;
  try {
    const payload: ExtensionBridgeStateFile = {
      token: encryptToken(state.token),
      port: state.port,
      _encrypted: safeStorage.isEncryptionAvailable(),
    };
    fs.writeFileSync(statePath(), JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    console.error('[extensionServer] failed to persist bridge state', err);
  }
}

export function getExtensionBridgeStatus(): ExtensionBridgeStatus {
  const state = bridgeState ?? loadOrCreateState();
  const running = !!server?.listening;
  return {
    running,
    port: effectivePort(state),
    token: state.token,
    folderPath: getChromeExtensionFolder(),
    extensionVersion: readInstalledExtensionVersion() || '',
    ...(running ? {} : (listenFailure ?? {})),
  };
}

export function regenerateExtensionToken(): ExtensionBridgeStatus {
  const state = bridgeState ?? loadOrCreateState();
  state.token = crypto.randomBytes(24).toString('hex');
  saveState(state);
  return getExtensionBridgeStatus();
}

function setCors(res: http.ServerResponse, origin: string | undefined): void {
  if (origin && isAllowedExtensionOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  // Chrome Private Network Access preflight
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX = 8 * 1024 * 1024;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(payload);
}

// ----- OCR engine helpers ------------------------------------------------

function asPaddleLang(value: unknown): PaddleLang | undefined {
  return value === 'ja' || value === 'zh' || value === 'ru' ? value : undefined;
}

/**
 * Languages already requested this session. Every OCR attempt on a page whose
 * models are missing would otherwise re-queue the same download.
 */
const webOcrRequested = new Set<string>();

/**
 * Pull web-OCR language packs in the background so the first OCR on a fresh
 * install (or the first Chinese/Russian page) sets itself up instead of
 * dead-ending. Asking for the language asset is enough — startDownload
 * resolves `requires`, which brings the shared detector and the charset.
 *
 * Auto language pick can only score *installed* recognisers, so after the
 * first web OCR we also request ja+zh+ru (~30 MB total) so switching works
 * without the user visiting each language once.
 */
async function ensureWebOcrModels(langHint?: PaddleLang): Promise<void> {
  // Must complete before any language pack is requested — see below.
  if (!(await ensureWebOcrDetector())) return;

  const primary = langHint ?? 'ja';
  const langs: PaddleLang[] = [primary, 'ja', 'zh', 'ru'].filter(
    (lang, i, arr): lang is PaddleLang => arr.indexOf(lang) === i,
  );
  await Promise.all(
    langs.map(async (lang) => {
      if (webOcrRequested.has(lang)) return;
      webOcrRequested.add(lang);
      try {
        const result = await startDownload(`paddle-ocr-${lang}`);
        // Let a failed download be retried by a later OCR attempt.
        if (!result.ok) webOcrRequested.delete(lang);
      } catch {
        webOcrRequested.delete(lang);
      }
    }),
  );
}

/** In-flight detector fetch, so parallel language requests share one download. */
let detectorDownload: Promise<boolean> | null = null;

/**
 * Fetch the shared text detector, once.
 *
 * Every language pack lists `paddle-ocr-det` in `requires`, so downloading
 * ja/zh/ru in parallel makes three downloaders resolve the same dependency at
 * once. They then race on its staging directory and it installs nothing —
 * leaving recognisers on disk with no detector, which reads as "web OCR not
 * installed" forever. Fetching it separately and awaiting it before the
 * languages fan out is what keeps that from happening.
 */
function ensureWebOcrDetector(): Promise<boolean> {
  if (detectorDownload) return detectorDownload;
  detectorDownload = (async () => {
    try {
      return (await startDownload('paddle-ocr-det')).ok;
    } catch {
      return false;
    }
  })();
  // Drop a failed attempt so a later OCR can retry it.
  void detectorDownload.then((ok) => {
    if (!ok) detectorDownload = null;
  });
  return detectorDownload;
}

function describeOcrEngines(web: boolean, manga: boolean, langs: PaddleLang[]): string {
  if (!web && !manga) {
    return 'No OCR models are installed — open Settings → Models & dictionaries to download them.';
  }
  const parts: string[] = [];
  if (web) parts.push(`Web OCR ready (${langs.join(', ')})`);
  else parts.push('Web OCR not installed — it downloads on first use');
  parts.push(manga ? 'manga OCR ready' : 'manga OCR not installed');
  return `${parts.join('; ')}.`;
}

function requireAuth(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const state = bridgeState ?? loadOrCreateState();
  const auth = req.headers.authorization;
  if (!checkBearerToken(typeof auth === 'string' ? auth : undefined, state.token)) {
    json(res, 401, { ok: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

function broadcastMineQueued(payload: {
  mode: ExtensionMineMode;
  term: string;
  sentence?: string;
  text: string;
  url?: string;
  title?: string;
  anki: MineNoteResult;
  folder?: string;
  audioDataUrl?: string;
  profileId?: string;
}): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('extension:mined', payload);
  }
}

async function handleInbox(body: {
  title?: string;
  url?: string;
  html?: string;
  selection?: string;
}): Promise<{ ok: boolean; duplicate?: boolean; id?: string; error?: string; kind?: string }> {
  const url = String(body.url ?? '').trim();
  const html = String(body.html ?? '');
  if (!html.trim() && !body.selection?.trim()) {
    return { ok: false, error: 'html or selection required' };
  }

  let title = String(body.title ?? '').trim();
  let contentHtml = html;
  let plain = '';

  if (html.trim()) {
    const extracted = extractReadableFromHtml(html, url || 'https://local.invalid/');
    if (extracted.ok && extracted.content) {
      contentHtml = extracted.content;
      if (extracted.title) title = title || extracted.title;
      plain = extracted.text ?? htmlToText(extracted.content);
    } else {
      plain = htmlToText(html);
      contentHtml = `<div>${html}</div>`;
    }
  } else {
    plain = String(body.selection ?? '').trim();
    contentHtml = `<p>${plain.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
  }

  title = title || 'Web article';
  const meta = buildInboxMetaBase({ sourceUrl: url || `local://${crypto.randomUUID()}`, text: plain });
  const result = importGeneratedArticle({
    title,
    html: contentHtml,
    source: url || undefined,
    folder: INBOX_FOLDER,
    inboxMeta: meta,
  });
  return {
    ok: true,
    duplicate: result.duplicate,
    id: result.item?.id,
    kind: 'article',
  };
}

async function handleMine(body: {
  text?: string;
  url?: string;
  title?: string;
  mode?: ExtensionMineMode | 'auto';
  folder?: string;
  source?: MineSource;
  category?: ExtensionContentCategory;
  audioBase64?: string;
  audioFilename?: string;
  audioDataUrl?: string;
  /** When false, skip AnkiConnect and save only to GrammarX flashcards. */
  preferAnki?: boolean;
  /** Force Anki attempt regardless of preferAnki (dictionary “Add to Anki”). */
  forceAnki?: boolean;
}): Promise<{
  ok: boolean;
  mode?: ExtensionMineMode;
  term?: string;
  anki?: MineNoteResult;
  error?: string;
  localFolder?: string;
  profileName?: string;
  deckName?: string;
  profileId?: string;
  matchedRuleLabel?: string;
  category?: ExtensionContentCategory;
  preferAnki?: boolean;
  forceAnki?: boolean;
  ankiAttempted?: boolean;
  primaryDestination?: 'anki' | 'app';
  destinations?: {
    anki: { attempted: boolean; ok: boolean; error?: string; noteId?: number };
    app: { ok: boolean; folder: string; label: string };
  };
}> {
  const text = String(body.text ?? '').trim();
  if (!text) return { ok: false, error: 'text required' };

  const mode: ExtensionMineMode =
    body.mode === 'word' || body.mode === 'sentence' ? body.mode : classifyMineSelection(text);
  const term = extractMineTerm(text, mode);
  if (!term) return { ok: false, error: 'Could not extract a term to mine' };

  const sentence = mode === 'sentence' ? text.slice(0, 2000) : undefined;
  const folder =
    typeof body.folder === 'string' && body.folder.trim() ? body.folder.trim().slice(0, 40) : 'Extension';
  const source: MineSource =
    body.source === 'audio' ||
    body.source === 'subtitle' ||
    body.source === 'epub' ||
    body.source === 'reader' ||
    body.source === 'dictionary' ||
    body.source === 'other'
      ? body.source
      : folder === 'audio'
        ? 'audio'
        : 'extension';

  const category: ExtensionContentCategory =
    body.category === 'news' ||
    body.category === 'novel' ||
    body.category === 'manga' ||
    body.category === 'youtube' ||
    body.category === 'article' ||
    body.category === 'other'
      ? body.category
      : detectContentCategory(String(body.url ?? ''), { title: body.title });

  const forceAnki = body.forceAnki === true;
  const preferAnki = forceAnki || body.preferAnki !== false;
  const ankiAttempted = preferAnki;

  let profileId = '';
  let profileName = 'Default';
  let deckName = '';
  let matchedRuleLabel: string | undefined;
  try {
    const { getProfileStore } = await import('./profiles');
    const store = getProfileStore();
    const active = store.getActiveProfile();
    const rules = loadProfileRules().rules;
    const resolved = resolveProfileMatch(
      rules,
      {
        source,
        cardKind: mode === 'sentence' ? 'sentence' : 'word',
        language: detectMineLanguage(text),
        category,
      },
      active?.id || '',
    );
    profileId = resolved.profileId;
    matchedRuleLabel = resolved.matchedRule?.label;
    const profile = (profileId && store.getProfile(profileId)) || active;
    profileId = profile?.id || profileId;
    profileName = profile?.label || profile?.id || 'Default';
    deckName = profile?.anki?.deckName || '';
  } catch {
    /* profiles may be unavailable during early boot */
  }

  let audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64.trim() : '';
  let audioDataUrl = typeof body.audioDataUrl === 'string' ? body.audioDataUrl.trim() : '';
  if (!audioBase64 && audioDataUrl.startsWith('data:')) {
    const m = /^data:[^;,]+(;base64)?,(.*)$/s.exec(audioDataUrl);
    if (m?.[2] && m[1]) audioBase64 = m[2];
  }
  if (!audioDataUrl && audioBase64) {
    audioDataUrl = `data:audio/webm;base64,${audioBase64}`;
  }

  let anki: MineNoteResult;
  if (ankiAttempted) {
    try {
      anki = await mineNote({
        term,
        sentence,
        surface: mode === 'word' ? term : undefined,
        profileId: profileId || undefined,
        audioBase64: audioBase64 || undefined,
        audioFilename: body.audioFilename,
        extraTags: [
          'jp-study-app::extension',
          mode === 'word' ? 'jp-study-app::extension-word' : 'jp-study-app::extension-sentence',
          folder === 'audio' || source === 'audio' ? 'jp-study-app::extension-audio' : '',
        ].filter(Boolean),
      });
    } catch (err) {
      anki = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  } else {
    anki = { ok: false, error: 'skipped' };
  }

  broadcastMineQueued({
    mode,
    term,
    sentence,
    text: text.slice(0, 2000),
    url: body.url,
    title: body.title,
    anki,
    folder,
    audioDataUrl: audioDataUrl || undefined,
    profileId: profileId || undefined,
  });

  const primaryDestination: 'anki' | 'app' = anki.ok ? 'anki' : 'app';

  return {
    ok: true,
    mode,
    term,
    anki,
    localFolder: folder,
    profileName,
    deckName,
    profileId: profileId || undefined,
    matchedRuleLabel,
    category,
    preferAnki,
    forceAnki,
    ankiAttempted,
    primaryDestination,
    destinations: {
      anki: {
        attempted: ankiAttempted,
        ok: !!anki.ok,
        error: anki.error,
        noteId: anki.noteId,
      },
      app: { ok: true, folder, label: 'GrammarX' },
    },
  };
}

async function handleAudioSave(body: {
  dataUrl?: string;
  base64?: string;
  mimeType?: string;
  url?: string;
  title?: string;
}): Promise<{
  ok: boolean;
  text?: string;
  term?: string;
  anki?: MineNoteResult;
  localFolder?: string;
  profileName?: string;
  deckName?: string;
  error?: string;
}> {
  let bytes: Buffer | null = null;
  let mime = typeof body.mimeType === 'string' ? body.mimeType : 'audio/webm';
  if (typeof body.dataUrl === 'string' && body.dataUrl.startsWith('data:')) {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(body.dataUrl);
    if (!m) return { ok: false, error: 'Invalid audio data URL' };
    if (m[1]) mime = m[1];
    bytes = Buffer.from(m[3], m[2] ? 'base64' : 'utf8');
  } else if (typeof body.base64 === 'string' && body.base64.trim()) {
    bytes = Buffer.from(body.base64.trim(), 'base64');
  }
  if (!bytes || !bytes.length) return { ok: false, error: 'audio required' };
  if (bytes.length > 25 * 1024 * 1024) return { ok: false, error: 'Audio too large (max 25 MB)' };

  const ext =
    mime.includes('wav') ? '.wav' : mime.includes('ogg') || mime.includes('opus') ? '.ogg' : mime.includes('mp4') || mime.includes('m4a') ? '.m4a' : '.webm';
  const tmpDir = path.join(app.getPath('temp'), 'jp-study-ext-audio');
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `rec_${Date.now()}${ext}`);
  try {
    fs.writeFileSync(tmpFile, bytes);
    const { extractAudioPcm } = await import('./media');
    const pcm = await extractAudioPcm(tmpFile);
    if (!pcm.byteLength) return { ok: false, error: 'No audio track found in recording' };
    const asr = await requestWhisperTranscribe(pcm);
    if (!asr.ok || !asr.text?.trim()) {
      return { ok: false, error: asr.error || 'Transcription returned empty text' };
    }
    const text = asr.text.trim();
    const audioBase64 = bytes.toString('base64');
    const audioDataUrl =
      typeof body.dataUrl === 'string' && body.dataUrl.startsWith('data:')
        ? body.dataUrl
        : `data:${mime};base64,${audioBase64}`;
    const mined = await handleMine({
      text,
      url: body.url,
      title: body.title,
      mode: 'sentence',
      folder: 'audio',
      source: 'audio',
      audioBase64,
      audioDataUrl,
      audioFilename: `ext_${Date.now()}${ext}`,
    });
    if (!mined.ok) return { ok: false, error: mined.error || 'Save failed', text };
    return {
      ok: true,
      text,
      term: mined.term,
      anki: mined.anki,
      localFolder: mined.localFolder,
      profileName: mined.profileName,
      deckName: mined.deckName,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}

async function handleCapture(body: {
  title?: string;
  url?: string;
  html?: string;
  selection?: string;
  action?: 'auto' | 'inbox' | 'playlist' | 'video';
}): Promise<Record<string, unknown>> {
  const url = String(body.url ?? '').trim();
  if (!url && !body.html?.trim() && !body.selection?.trim()) {
    return { ok: false, error: 'url, html, or selection required' };
  }
  const kind = detectPageKind(url);
  const action =
    body.action && body.action !== 'auto' ? body.action : primaryCaptureAction(kind);

  if (action === 'playlist') {
    const { addPlaylistByUrl } = await import('./ytPlaylists');
    const out = await addPlaylistByUrl(url);
    if (!out.ok) return { ok: false, error: out.error, kind, action };
    return { ok: true, kind, action, playlistId: out.playlistId };
  }
  if (action === 'video') {
    const { addVideoByUrl } = await import('./ytPlaylists');
    const out = await addVideoByUrl(url);
    if (!out.ok) return { ok: false, error: out.error, kind, action };
    return {
      ok: true,
      kind,
      action,
      playlistId: out.playlistId,
      videoId: out.videoId,
      youtubeId: out.youtubeId,
      duplicate: out.duplicate,
    };
  }
  // Inbox / article
  if (!body.html?.trim() && !body.selection?.trim()) {
    return {
      ok: false,
      error: 'This page looks like an article — open the popup on the article tab and use Capture (needs page HTML).',
      kind,
      action,
    };
  }
  const inbox = await handleInbox(body);
  const subtype = detectArticleSubtype(String(body.html ?? ''), url);
  return { ...inbox, kind, action, subtype };
}

/** Long-strip/webtoon capture from the extension: a title + ordered panel image URLs. */
async function handleMangaImport(body: {
  title?: string;
  url?: string;
  images?: string[];
}): Promise<{ ok: boolean; id?: string; pageCount?: number; failed?: number; error?: string }> {
  const url = String(body.url ?? '').trim();
  const images = Array.isArray(body.images) ? body.images.filter((x) => typeof x === 'string') : [];
  if (!url || !images.length) return { ok: false, error: 'url and images are required' };
  return importMangaFromImageUrls({ title: body.title, url, images });
}

async function onRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  setCors(res, origin);

  // Only accept loopback remote addresses.
  const ra = req.socket.remoteAddress ?? '';
  if (ra && ra !== '127.0.0.1' && ra !== '::1' && ra !== '::ffff:127.0.0.1') {
    json(res, 403, { ok: false, error: 'Forbidden' });
    return;
  }

  if (req.method === 'OPTIONS') {
    // Private Network Access preflight may send this header.
    if (req.headers['access-control-request-private-network'] === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://127.0.0.1`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'GET' && pathname === '/v1/extension-settings') {
    // Loopback-only: require chrome-extension Origin (or missing Origin for same-machine tools).
    // Reject browser tabs / other Origins so the pairing token is not leaked cross-origin.
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    if (origin && !isAllowedExtensionOrigin(origin)) {
      json(res, 403, { ok: false, error: 'Forbidden origin' });
      return;
    }
    const status = getExtensionBridgeStatus();
    json(res, 200, {
      ok: true,
      token: status.token,
      port: status.port,
      folderPath: status.folderPath,
    });
    return;
  }

  if (req.method === 'GET' && (pathname === '/v1/health' || pathname === '/health')) {
    // `contract` is additive: existing clients read `ok`/`version`/`port` and
    // ignore the rest. It publishes the shared identity tables so a client can
    // feature-detect this build instead of assuming a command exists and
    // discovering otherwise when the user presses it. See
    // src/shared/extensionContract.ts for why those tables are shared at all.
    json(res, 200, {
      ok: true,
      version: 1,
      port: bridgeState?.port ?? EXTENSION_PORT,
      features: { sentenceAnalysis: true },
      contract: extensionContractManifest(),
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/v1/page-kind') {
    const pageUrl = url.searchParams.get('url') ?? '';
    const title = url.searchParams.get('title') ?? '';
    const kind = detectPageKind(pageUrl);
    const subtype =
      kind === 'article' ? detectArticleSubtype('', pageUrl) : undefined;
    const category = detectContentCategory(pageUrl, { title });
    json(res, 200, {
      ok: true,
      kind,
      subtype,
      category,
      action: primaryCaptureAction(kind),
    });
    return;
  }

  /**
   * Category + which Anki profile a default extension mine would hit.
   * Requires pairing (profile resolution). Category is also returned for clients
   * that prefer a single round-trip; local heuristics remain available offline.
   */
  if (req.method === 'GET' && pathname === '/v1/page-context') {
    if (!requireAuth(req, res)) return;
    const pageUrl = url.searchParams.get('url') ?? '';
    const title = url.searchParams.get('title') ?? '';
    const sampleText = url.searchParams.get('text') ?? '';
    const cardKindParam = url.searchParams.get('cardKind');
    const cardKind: MineCardKind =
      cardKindParam === 'sentence' || cardKindParam === 'word'
        ? cardKindParam
        : sampleText
          ? classifyMineSelection(sampleText) === 'sentence'
            ? 'sentence'
            : 'word'
          : 'word';

    const kind = detectPageKind(pageUrl);
    const subtype = kind === 'article' ? detectArticleSubtype('', pageUrl) : undefined;
    const category = detectContentCategory(pageUrl, { title });

    let language: MineLanguage = detectMineLanguage(sampleText);
    let profileName = 'Default';
    let profileId = '';
    let matchedRuleLabel: string | undefined;
    let usedDefault = true;
    try {
      const { getProfileStore } = await import('./profiles');
      const store = getProfileStore();
      const active = store.getActiveProfile();
      if (language === 'unknown' && (active?.targetLang === 'ja' || active?.targetLang === 'zh')) {
        language = active.targetLang;
      }
      const resolved = resolveProfileMatch(
        loadProfileRules().rules,
        {
          source: 'extension',
          cardKind,
          language,
          category,
        },
        active?.id || '',
      );
      profileId = resolved.profileId;
      matchedRuleLabel = resolved.matchedRule?.label;
      usedDefault = resolved.usedDefault;
      const profile = (profileId && store.getProfile(profileId)) || active;
      profileId = profile?.id || profileId;
      profileName = profile?.label || profile?.id || 'Default';
    } catch {
      /* profiles may be unavailable during early boot */
    }

    json(res, 200, {
      ok: true,
      pageKind: kind,
      kind,
      subtype,
      category,
      cardKind,
      language,
      matchedRuleLabel,
      profileId: profileId || undefined,
      profileName,
      usedDefault,
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/v1/ocr/status') {
    if (!requireAuth(req, res)) return;
    const manga = mangaOcrAvailable();
    const web = paddleOcrAvailable();
    const langs = installedPaddleLangs();
    // Warm ja+zh+ru in the background when the extension checks status so the
    // first real crop on a Chinese/Russian page already has a head available.
    if (langs.length < 3) void ensureWebOcrModels();
    json(res, 200, {
      ok: true,
      // `available` stays the single "can this page be OCR'd at all?" flag the
      // extension pre-checks; the per-engine flags below say which one will run.
      available: web || manga,
      web,
      manga,
      langs,
      message: describeOcrEngines(web, manga, langs),
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/v1/mine-info') {
    if (!requireAuth(req, res)) return;
    let profileName = 'Default';
    let deckName = '';
    let profileId = '';
    try {
      const { getProfileStore } = await import('./profiles');
      const profile = getProfileStore().getActiveProfile();
      profileName = profile?.label || profile?.id || 'Default';
      deckName = profile?.anki?.deckName || '';
      profileId = profile?.id || '';
    } catch {
      /* ignore */
    }
    json(res, 200, {
      ok: true,
      localFolder: 'Extension',
      profileName,
      profileId,
      deckName,
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/v1/download/status') {
    if (!requireAuth(req, res)) return;
    const jobId = url.searchParams.get('id') ?? '';
    const job = downloadJobs.get(jobId);
    if (!job) {
      json(res, 404, { ok: false, error: 'Job not found' });
      return;
    }
    json(res, 200, { ok: true, job });
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/inbox') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as {
        title?: string;
        url?: string;
        html?: string;
        selection?: string;
      };
      const out = await handleInbox(body);
      if (out.ok && body.html) {
        const subtype = detectArticleSubtype(body.html, String(body.url ?? ''));
        json(res, 200, { ...out, subtype });
      } else {
        json(res, out.ok ? 200 : 400, out);
      }
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/mine') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as {
        text?: string;
        url?: string;
        title?: string;
        mode?: ExtensionMineMode | 'auto';
        folder?: string;
        preferAnki?: boolean;
        forceAnki?: boolean;
      };
      const out = await handleMine(body);
      json(res, out.ok ? 200 : 400, out);
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/capture') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as {
        title?: string;
        url?: string;
        html?: string;
        selection?: string;
        action?: 'auto' | 'inbox' | 'playlist' | 'video';
      };
      const out = await handleCapture(body);
      json(res, out.ok ? 200 : 400, out);
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/manga-import') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as { title?: string; url?: string; images?: string[] };
      const out = await handleMangaImport(body);
      json(res, out.ok ? 200 : 400, out);
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/download') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as {
        url?: string;
        videoIds?: string[];
        playlist?: boolean;
        audioOnly?: boolean;
      };
      const { addVideoByUrl, addPlaylistByUrl, downloadVideosByIds, readStoreForExtension } =
        await import('./ytPlaylists');

      let ids: string[] = Array.isArray(body.videoIds) ? body.videoIds.filter((x) => typeof x === 'string') : [];
      const pageUrl = typeof body.url === 'string' ? body.url.trim() : '';
      const audioOnly = body.audioOnly === true;
      let kindLabel: 'playlist' | 'video' = 'video';

      let savedPlaylistId: string | null = null;

      if (!ids.length && pageUrl) {
        const kind = detectPageKind(pageUrl);
        if (kind === 'youtube-playlist' || body.playlist) {
          kindLabel = 'playlist';
          const out = await addPlaylistByUrl(pageUrl);
          if (!out.ok) {
            json(res, 400, { ok: false, error: out.error });
            return;
          }
          savedPlaylistId = out.playlistId;
          const store = readStoreForExtension();
          ids = store.videos.filter((v) => v.playlistId === out.playlistId && !v.downloaded).map((v) => v.id);
        } else {
          const out = await addVideoByUrl(pageUrl);
          if (!out.ok) {
            json(res, 400, { ok: false, error: out.error });
            return;
          }
          ids = [out.videoId];
        }
      } else if (body.playlist) {
        kindLabel = 'playlist';
      }

      if (!ids.length) {
        // The playlist itself was saved and broadcast above; having nothing new
        // to download (every video already downloaded, or an empty playlist) is
        // a success for "Save playlist", not a failure. Reporting 400 here made
        // the extension show an error for a playlist that had in fact saved.
        if (savedPlaylistId) {
          json(res, 200, {
            ok: true,
            action: 'playlist',
            kind: 'playlist',
            playlistId: savedPlaylistId,
            videoCount: 0,
            queued: 0,
            mode: 'saved',
          });
          return;
        }
        json(res, 400, { ok: false, error: 'No videos to download (url or videoIds required).' });
        return;
      }

      const jobId = crypto.randomUUID();
      const job: DownloadJob = {
        id: jobId,
        status: 'queued',
        percent: 0,
        stage: 'queued',
        createdAt: Date.now(),
      };
      downloadJobs.set(jobId, job);
      json(res, 200, {
        ok: true,
        jobId,
        videoCount: ids.length,
        queued: ids.length,
        audioOnly,
        action: kindLabel,
        kind: kindLabel,
        mode: 'download',
      });

      void (async () => {
        job.status = 'running';
        try {
          const { results } = await downloadVideosByIds(
            ids,
            (ev) => {
              job.percent = ev.percent;
              job.stage = ev.stage;
              // Mirror playlist-manager downloads onto the same channel so the
              // Media "In progress" view sees extension downloads too; without
              // this they only ever updated this local job object.
              for (const w of BrowserWindow.getAllWindows()) {
                w.webContents.send('yt:downloadProgress', ev);
              }
            },
            // Extension downloads always take every subtitle track, including
            // auto-generated captions — the point of saving from the browser is
            // to get studiable text without a second pass.
            { audioOnly, allSubs: true },
          );
          job.results = results;
          job.status = 'done';
          job.percent = 100;
          job.stage = 'done';
          if (results.some((r) => !r.ok)) {
            job.error = results.find((r) => !r.ok)?.error;
          }
        } catch (err) {
          job.status = 'error';
          job.error = err instanceof Error ? err.message : String(err);
        }
      })();
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  /**
   * MINING gate 11 — transcribe the page being watched.
   *
   * Composes what already exists rather than adding a second transcription
   * path: the generated track on the media row (with the older playlist cue
   * file as a fallback) answers immediately when the video is already
   * transcribed, and otherwise the media row this app downloaded is
   * handed to the SAME Whisper queue `transcriptionJobs` runs for the Media
   * library. The result lands as a generated subtitle record on that media row,
   * which the Files-app index reads — so it is mineable later without returning
   * to the page, which is the second half of the gate.
   *
   * Every refusal is NAMED by `planExtensionTranscribe` and carries its own
   * i18n key. Nothing here returns a bare failure.
   */
  if (req.method === 'POST' && pathname === '/v1/transcribe') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as { url?: string };
      const pageUrl = typeof body.url === 'string' ? body.url.trim() : '';
      const { readTranscriptCueCount } = await import('./ytPlaylists');
      const {
        enqueueTranscription,
        transcribableItems,
        transcriptionArtifactStatus,
        transcriptionHostReady,
      } =
        await import('./transcriptionJobs');

      const videoId = parseYoutubeVideoId(pageUrl);
      // The library row for this video, found by the id yt-dlp wrote into the
      // filename — the same parser the Files app index uses, so the extension
      // and the catalogue agree about which file belongs to which video.
      const item = videoId
        ? transcribableItems().find(
            (entry) => youtubeIdFromFileName(entry.fileName || entry.path || '') === videoId,
          )
        : undefined;
      const artifact = item
        ? transcriptionArtifactStatus(item.id)
        : { cueCount: null, active: false, queuedAt: null };
      const plan = planExtensionTranscribe({
        pageKind: detectPageKind(pageUrl),
        videoId,
        existingCueCount: artifact.cueCount ?? (videoId ? readTranscriptCueCount(videoId) : null),
        mediaId: item?.id ?? null,
        mediaFileExists: !!item?.path && fs.existsSync(item.path),
        alreadyQueued: artifact.active,
        transcriberReady: transcriptionHostReady(),
      });

      // A job that is already running is neither a new queue nor a refusal, and
      // `enqueueTranscription`'s dedup answered `{ok:true}` for both — so the
      // popup restarted its elapsed counter at zero for a job eight minutes in.
      // `queuedAt` is the queue's own timestamp, never `Date.now()`.
      if (plan.action === 'follow') {
        json(res, 200, {
          ok: true,
          state: 'running',
          videoId: plan.videoId,
          mediaId: plan.mediaId,
          queuedAt: artifact.queuedAt,
        });
        return;
      }

      if (plan.action === 'report') {
        json(res, 200, {
          ok: true,
          state: 'transcribed',
          videoId: plan.videoId,
          cueCount: plan.cueCount,
        });
        return;
      }
      if (plan.action === 'refuse') {
        // 200, not 400: this is an answer, not a malformed request, and the
        // extension renders the named reason rather than "request failed".
        json(res, 200, {
          ok: false,
          state: 'refused',
          reason: plan.reason,
          reasonKey: plan.reasonKey,
          videoId: plan.videoId,
          // `notDownloaded` is the one refusal with an obvious next step, and
          // saying so is what keeps the button from looking broken.
          ...(plan.reason === 'notDownloaded' ? { canDownload: true } : {}),
        });
        return;
      }
      const queued = enqueueTranscription({ mediaId: plan.mediaId, lang: 'ja' });
      json(res, 200, {
        ok: queued.ok,
        state: queued.ok ? 'queued' : 'refused',
        videoId: plan.videoId,
        mediaId: plan.mediaId,
        ...(queued.ok ? {} : { reason: queued.error, reasonKey: queued.error }),
      });
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  /**
   * The cue count, once the queued run has landed. Gate 11 asks for a NUMBER,
   * and a Whisper pass is minutes long, so the POST above returns `queued` and
   * the extension polls here.
   */
  if (req.method === 'GET' && pathname === '/v1/transcribe/status') {
    if (!requireAuth(req, res)) return;
    const videoId = url.searchParams.get('videoId') ?? '';
    const { readTranscriptCueCount } = await import('./ytPlaylists');
    const { transcribableItems, transcriptionArtifactStatus } = await import('./transcriptionJobs');
    const item = videoId
      ? transcribableItems().find(
          (entry) => youtubeIdFromFileName(entry.fileName || entry.path || '') === videoId,
        )
      : undefined;
    const artifact = item
      ? transcriptionArtifactStatus(item.id)
      : { cueCount: null, active: false, queuedAt: null };
    const status = resolveExtensionTranscribeStatus({
      playlistCueCount: videoId ? readTranscriptCueCount(videoId) : null,
      mediaCueCount: artifact.cueCount,
      active: artifact.active,
      // `item` is the media row `enqueueTranscription` would have been given.
      // Absent, nothing was ever queued, and the honest answer is "not started"
      // rather than a failure the user would go looking for in a log.
      mediaKnown: Boolean(item),
    });
    json(res, 200, {
      // "a transcript exists or is on its way". `notStarted` and `failed` are
      // both true answers, and neither yields a cue count without a new action.
      ok: status.state === 'transcribed' || status.state === 'pending',
      videoId,
      // `notStarted` names the next step, exactly as the POST's `notDownloaded`
      // refusal does, so the popup does not have to infer it from the state.
      ...(status.state === 'notStarted' ? { canDownload: true } : {}),
      // The queue's own timestamp, so a poller that attached late reports how
      // long the JOB has run rather than how long it has been watching.
      ...(status.state === 'pending' && artifact.queuedAt !== null
        ? { queuedAt: artifact.queuedAt }
        : {}),
      ...status,
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/audio/save') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as {
        dataUrl?: string;
        base64?: string;
        mimeType?: string;
        url?: string;
        title?: string;
      };
      const out = await handleAudioSave(body);
      json(res, out.ok ? 200 : 400, out);
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/clipboard') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as {
        text?: string;
        type?: string;
        url?: string;
        title?: string;
      };
      const text = String(body.text ?? '').trim();
      if (!text) {
        json(res, 400, { ok: false, error: 'text required' });
        return;
      }
      broadcastClipboardAppend({
        text: text.slice(0, 8000),
        type: body.type,
        url: body.url,
        title: body.title,
      });
      json(res, 200, { ok: true });
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  /** Deep-link into app chrome (clipboard history, Anki, mining rules, …). */
  if (req.method === 'POST' && pathname === '/v1/ui/open') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as {
        target?: string;
        functions?: string | string[];
        level?: string;
        levels?: string[];
        lang?: string;
      };
      const target = String(body.target ?? '')
        .trim()
        .toLowerCase()
        .slice(0, 64);
      if (!target) {
        json(res, 400, { ok: false, error: 'target required' });
        return;
      }
      if (!UI_OPEN_TARGETS.has(target)) {
        json(res, 400, {
          ok: false,
          error: `unknown target '${target}'`,
          validTargets: Array.from(UI_OPEN_TARGETS),
        });
        return;
      }
      const opened = broadcastUiOpen(target, {
        functions: body.functions,
        level: body.level,
        levels: body.levels,
        lang: body.lang,
      });
      if (!opened) {
        json(res, 503, { ok: false, error: 'GrammarX window is not open' });
        return;
      }
      json(res, 200, { ok: true, target });
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/v1/clipboard') {
    if (!requireAuth(req, res)) return;
    try {
      const result = await requestClipboardList();
      if (!result.ok) {
        json(res, 504, { ok: false, error: result.error, entries: result.entries });
        return;
      }
      json(res, 200, { ok: true, entries: result.entries });
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/known-levels') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as { terms?: string[] };
      const terms = Array.isArray(body.terms) ? body.terms : [];
      const result = await requestKnownLevels(terms.map(String));
      if (!result.ok) {
        json(res, 504, { ok: false, error: result.error, levels: result.levels });
        return;
      }
      json(res, 200, { ok: true, levels: result.levels });
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/known-level') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as { term?: string; level?: number };
      const term = String(body.term ?? '').trim().slice(0, 80);
      const level = Number(body.level);
      if (!term) {
        json(res, 400, { ok: false, error: 'term required' });
        return;
      }
      if (![0, 1, 2, 3].includes(level)) {
        json(res, 400, { ok: false, error: 'level must be 0–3' });
        return;
      }
      const result = await requestSetKnownLevel(term, level);
      json(res, result.ok ? 200 : 504, result);
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/comprehensibility') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as { text?: string; sample?: string };
      const text = String(body.text ?? body.sample ?? '');
      const result = await requestComprehensibility(text);
      json(res, result.ok ? 200 : 504, result);
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/grammar-match') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as { text?: string; query?: string };
      const text = String(body.text ?? body.query ?? '');
      const result = await requestGrammarMatch(text);
      json(res, result.ok ? 200 : 504, result);
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/immersion/visit') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as {
        url?: string;
        title?: string;
        seconds?: number;
        chars?: number;
      };
      const pageUrl = String(body.url ?? '').trim();
      if (!pageUrl) {
        json(res, 400, { ok: false, error: 'url required' });
        return;
      }
      const { recordVisitFromBridge } = await import('./immersion');
      const out = recordVisitFromBridge({
        url: pageUrl,
        title: typeof body.title === 'string' ? body.title : undefined,
        seconds: typeof body.seconds === 'number' ? Math.max(0, body.seconds) : undefined,
        chars: typeof body.chars === 'number' ? Math.max(0, body.chars) : undefined,
      });
      json(res, out.ok ? 200 : 400, out);
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/translate') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as {
        text?: string;
        source?: string;
        target?: string;
      };
      const text = String(body.text ?? '').trim().slice(0, 4000);
      if (!text) {
        json(res, 400, { ok: false, error: 'text required' });
        return;
      }
      const { isTranslateAvailable, runTranslationBatch } = await import('./translate');
      if (!isTranslateAvailable()) {
        json(res, 503, { ok: false, error: 'Translation model not installed' });
        return;
      }
      const source = String(body.source || 'ja').slice(0, 8);
      const target = String(body.target || 'en').slice(0, 8);
      const results = await runTranslationBatch([{ id: 'ext', text, source, target }]);
      const resultText = results[0]?.text || '';
      json(res, 200, {
        ok: true,
        text: resultText,
        source,
        target,
      });
      // Best-effort: append translation history via renderer if open
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) {
          w.webContents.send('extension:translation-result', {
            sourceLang: source,
            targetLang: target,
            sourceText: text,
            resultText,
          });
        }
      }
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Page JLPT/HSK estimate — same Settings vocab bands as EPUB covers.
  if (req.method === 'POST' && pathname === '/v1/level-estimate') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as { text?: string; sample?: string };
      const text = String(body.text ?? body.sample ?? '');
      const result = await requestLevelEstimate(text);
      json(res, 200, result);
    } catch (err) {
      json(res, 400, {
        ok: false,
        badge: '—',
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/lookup') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as { query?: string };
      const query = String(body.query ?? '').trim().slice(0, 80);
      if (!query) {
        json(res, 400, { ok: false, error: 'query required' });
        return;
      }
      const { lookupOfflineDeinflected } = await import('./dictionary/yomitan');
      const local = lookupOfflineDeinflected(query);
      const entries = (local.entries || []).slice(0, 8).map((e) => ({
        word: e.word,
        reading: e.reading,
        pitchHtml: e.pitchHtml,
        glossaryHtml: e.glossaryHtml,
        senses: (e.senses || []).slice(0, 6).map((s) => ({
          partsOfSpeech: s.partsOfSpeech || [],
          definitions: (s.definitions || []).filter(Boolean).slice(0, 8),
        })),
        meanings: (e.senses || [])
          .flatMap((s) => s.definitions || [])
          .filter(Boolean)
          .slice(0, 6),
        source: e.source,
        isCommon: e.isCommon,
        jlpt: e.jlpt,
        frequency: e.frequency,
      }));
      json(res, 200, {
        ok: true,
        query,
        entries,
        deinflection: local.deinflection,
      });
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Whole-sentence AI annotation — the extension's "AI OCR / Dictionary AI"
  // mode. Shares analyzeSentence()'s disk cache with the Reading Lens, so the
  // same sentence read in either place costs one cloud call in total.
  if (req.method === 'POST' && pathname === '/v1/sentence-analysis') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as {
        text?: string;
        lang?: string;
        explainIn?: string;
        context?: string;
        learnerLevel?: string;
      };
      const text = String(body.text ?? '').trim();
      if (!text) {
        json(res, 400, { ok: false, error: 'text required' });
        return;
      }
      const { analyzeSentence } = await import('./sentenceAnalysis');
      const result = await analyzeSentence({
        text,
        lang: String(body.lang || 'ja').slice(0, 8),
        explainIn: String(body.explainIn || 'en').slice(0, 8),
        context: String(body.context || '').slice(0, 1200),
        learnerLevel: String(body.learnerLevel || '').slice(0, 16) || undefined,
      });
      // A missing key or local model is a configuration problem, not a bad
      // request — 200 with needsKey / needsLocalModel lets the extension render
      // a "set it up" message instead of a generic error.
      // The response carries the user's preferences, so the extension renders
      // the same sections the app does without a second round trip.
      json(res, 200, result);
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // The extension reads (never writes) the analysis preferences, so its popup
  // can show the current mode and section list. Settings stay app-owned.
  if (req.method === 'GET' && pathname === '/v1/sentence-analysis/prefs') {
    if (!requireAuth(req, res)) return;
    try {
      const { readAnalysisPrefs } = await import('./sentenceAnalysis');
      json(res, 200, { ok: true, prefs: readAnalysisPrefs() });
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // File an analysis snapshot into the app's notebook. The extension sends the
  // analysis it already has rather than the sentence, so no second cloud call
  // is made and the snapshot matches exactly what the user was looking at.
  if (req.method === 'POST' && pathname === '/v1/sentence-analysis/snapshot') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as {
        result?: unknown;
        lang?: string;
        sourceLabel?: string;
      };
      if (!body.result || typeof body.result !== 'object') {
        json(res, 400, { ok: false, error: 'result required' });
        return;
      }
      const { readAnalysisPrefs, broadcastSnapshot } = await import('./sentenceAnalysis');
      const { buildAnalysisSnapshot } = await import('../shared/analysisSnapshot');
      const snapshot = buildAnalysisSnapshot(
        body.result as import('../shared/sentenceAnalysisCore').SentenceAnalysisResult,
        readAnalysisPrefs(),
        {
          lang: String(body.lang || 'ja').slice(0, 8),
          source: 'extension',
          sourceLabel: String(body.sourceLabel || '').slice(0, 200) || undefined,
        },
      );
      broadcastSnapshot(snapshot);
      json(res, 200, { ok: true, title: snapshot.title, folder: snapshot.folder });
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Mine a card straight out of an analysis, through the same Anki pipeline and
  // deck override the app uses.
  if (req.method === 'POST' && pathname === '/v1/sentence-analysis/mine') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as {
        result?: unknown;
        annotationIndex?: number;
        cardKind?: 'word' | 'sentence';
        lang?: string;
        uiLang?: string;
      };
      if (!body.result || typeof body.result !== 'object') {
        json(res, 400, { ok: false, error: 'result required' });
        return;
      }
      const result = body.result as import('../shared/sentenceAnalysisCore').SentenceAnalysisResult;
      const { readAnalysisPrefs } = await import('./sentenceAnalysis');
      const { buildAnalysisMineRequest, buildSentenceMineRequest } = await import(
        '../shared/analysisMining'
      );
      const prefs = readAnalysisPrefs();
      const opts = {
        lang: String(body.lang || 'ja').slice(0, 8),
        uiLang: String(body.uiLang || 'en').slice(0, 8),
        cardKind: body.cardKind,
      };
      const annotation = Array.isArray(result.annotations)
        ? result.annotations[Number(body.annotationIndex) || 0]
        : undefined;
      const mineReq =
        annotation && body.cardKind !== 'sentence'
          ? buildAnalysisMineRequest(annotation, result, prefs, opts)
          : buildSentenceMineRequest(result, prefs, opts);
      json(res, 200, await mineNote(mineReq));
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/examples') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as { query?: string; limit?: number };
      const query = String(body.query ?? '').trim().slice(0, 80);
      if (!query) {
        json(res, 400, { ok: false, error: 'query required' });
        return;
      }
      const limit = Math.min(30, Math.max(1, Number(body.limit) || 8));
      const { searchExamples } = await import('./dictionary');
      const result = await searchExamples(query, limit);
      json(res, 200, {
        ok: true,
        query,
        examples: (result.examples || []).slice(0, limit).map((ex) => ({
          jp: ex.jp,
          en: ex.en,
        })),
      });
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/ocr') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as {
        image?: string;
        dataUrl?: string;
        category?: string;
        langHint?: string;
      };
      const dataUrl = String(body.dataUrl || body.image || '');
      if (!dataUrl.startsWith('data:')) {
        json(res, 400, { ok: false, error: 'dataUrl (PNG/JPEG data URL) required' });
        return;
      }

      // A page category of 'manga' still pins the engine — the site is known to
      // be manga, which is better evidence than anything derived from one crop.
      // Everything else goes through ocrAuto, which starts on the general engine
      // and only falls back to manga-ocr when the general read looks like the
      // tategaki failure described in shared/ocrRouting.ts. That keeps printed
      // web text away from manga-ocr, which hallucinates on it.
      if (body.category === 'manga') {
        if (!mangaOcrAvailable()) {
          json(res, 503, {
            ok: false,
            available: false,
            engine: 'manga-ocr',
            error:
              'Manga OCR models are not installed — open Settings → Models & dictionaries and download the manga-ocr pack.',
          });
          return;
        }
        const manga = await recognizeMangaOcrRegionsDataUrl(dataUrl);
        json(res, 200, {
          ok: true,
          text: manga.text,
          lines: manga.lines,
          lang: 'ja',
          engine: 'manga-ocr',
          available: true,
        });
        return;
      }

      const langHint = asPaddleLang(body.langHint);
      // Always nudge ja+zh+ru downloads so auto language pick has every head.
      // Cheap when already installed (startDownload no-ops / marks requested).
      void ensureWebOcrModels(langHint);
      if (!paddleOcrAvailable()) {
        json(res, 503, {
          ok: false,
          available: false,
          downloading: true,
          engine: 'web',
          error: 'Downloading web OCR models — try again in a moment.',
        });
        return;
      }
      // Hinted language still missing: refuse with downloading rather than
      // OCR with the wrong script head (looks like confident garbage).
      if (langHint && !installedPaddleLangs().includes(langHint)) {
        json(res, 503, {
          ok: false,
          available: false,
          downloading: true,
          engine: 'web',
          lang: langHint,
          error: `Downloading ${langHint.toUpperCase()} web OCR — try again in a moment.`,
        });
        return;
      }

      const result = await ocrAuto(dataUrl, { engine: 'auto', langHint });
      json(res, 200, {
        ok: true,
        text: result.text,
        lines: result.lines,
        lang: result.lang,
        engine: result.engine === 'manga' ? 'manga-ocr' : 'web',
        available: true,
      });
    } catch (err) {
      json(res, 400, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        available: paddleOcrAvailable() || mangaOcrAvailable(),
      });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/v1/playlists/status') {
    if (!requireAuth(req, res)) return;
    const list = (url.searchParams.get('list') ?? url.searchParams.get('url') ?? '').trim();
    if (!list) {
      json(res, 400, { ok: false, error: 'Missing list or url' });
      return;
    }
    try {
      const { playlistTrackedStatus } = await import('./ytPlaylists');
      const status = playlistTrackedStatus(list);
      json(res, 200, { ok: true, ...status });
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // YouTube playlist metadata sync (also reachable via /v1/capture).
  if (req.method === 'POST' && pathname === '/v1/playlist') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as { url?: string };
      const listUrl = typeof body.url === 'string' ? body.url.trim() : '';
      if (!listUrl) {
        json(res, 400, { ok: false, error: 'Missing url' });
        return;
      }
      const { addPlaylistByUrl, readStoreForExtension } = await import('./ytPlaylists');
      const out = await addPlaylistByUrl(listUrl);
      if (out.ok) {
        const store = readStoreForExtension();
        const pl = store.playlists.find((p) => p.id === out.playlistId);
        json(res, 200, {
          ok: true,
          playlistId: out.playlistId,
          youtubePlaylistId: pl?.youtubePlaylistId,
          title: pl?.title,
          tracked: true,
          kind: 'youtube-playlist',
          action: 'playlist',
        });
      } else {
        json(res, 400, { ok: false, error: out.error });
      }
    } catch (err) {
      json(res, 400, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/video') {
    if (!requireAuth(req, res)) return;
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}') as { url?: string };
      const videoUrl = typeof body.url === 'string' ? body.url.trim() : '';
      if (!videoUrl) {
        json(res, 400, { ok: false, error: 'Missing url' });
        return;
      }
      const { addVideoByUrl } = await import('./ytPlaylists');
      const out = await addVideoByUrl(videoUrl);
      if (out.ok) {
        json(res, 200, {
          ok: true,
          playlistId: out.playlistId,
          videoId: out.videoId,
          youtubeId: out.youtubeId,
          duplicate: out.duplicate,
          kind: 'youtube-video',
          action: 'video',
        });
      } else {
        json(res, 400, { ok: false, error: out.error });
      }
    } catch (err) {
      json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  json(res, 404, { ok: false, error: 'Not found' });
}

export function startExtensionServer(): void {
  if (server) return;
  ensureChromeExtensionFolder();
  const state = loadOrCreateState();
  server = http.createServer((req, res) => {
    void onRequest(req, res);
  });
  const port = effectivePort(state);
  server.on('error', (err) => {
    // Record WHICH failure, so `getExtensionBridgeStatus` can say more than
    // "stopped". EADDRINUSE is the one a user (or a second dev instance) can act
    // on, and it is the one that used to be invisible.
    const code = (err as NodeJS.ErrnoException).code;
    listenFailure =
      code === 'EADDRINUSE'
        ? { stoppedReasonKey: 'portInUse' }
        : { stoppedReasonKey: 'listenFailed', stoppedDetail: err.message };
    console.error('[extensionServer]', err);
  });
  server.listen(port, '127.0.0.1', () => {
    listenFailure = null;
    console.log(`[extensionServer] listening on 127.0.0.1:${port}`);
  });
}

export function stopExtensionServer(): void {
  if (!server) return;
  server.close();
  server = null;
}

export function registerExtensionBridgeIpc(): void {
  ipcMain.handle('extension:status', () => getExtensionBridgeStatus());
  ipcMain.handle('extension:regenerateToken', () => regenerateExtensionToken());
  ipcMain.handle('extension:revealFolder', async () => {
    const folder = getChromeExtensionFolder();
    const err = await shell.openPath(folder);
    return err || null;
  });
  ipcMain.on('extension:known-levels-reply', (_e, payload: { id?: string; levels?: Record<string, number> }) => {
    if (!payload || typeof payload.id !== 'string') return;
    const pending = pendingLevelReplies.get(payload.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingLevelReplies.delete(payload.id);
    pending.resolve({
      ok: true,
      levels: payload.levels && typeof payload.levels === 'object' ? payload.levels : {},
    });
  });
  ipcMain.on(
    'extension:known-level-set-reply',
    (_e, payload: { id?: string; ok?: boolean; error?: string }) => {
      if (!payload || typeof payload.id !== 'string') return;
      const pending = pendingKnownSetReplies.get(payload.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingKnownSetReplies.delete(payload.id);
      pending.resolve({ ok: payload.ok === true, error: payload.error });
    },
  );
  ipcMain.on(
    'extension:comprehensibility-reply',
    (
      _e,
      payload: { id?: string; ok?: boolean; percent?: number; known?: number; total?: number; error?: string },
    ) => {
      if (!payload || typeof payload.id !== 'string') return;
      const pending = pendingComprehensibilityReplies.get(payload.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingComprehensibilityReplies.delete(payload.id);
      pending.resolve({
        ok: payload.ok === true,
        percent: typeof payload.percent === 'number' ? payload.percent : undefined,
        known: typeof payload.known === 'number' ? payload.known : undefined,
        total: typeof payload.total === 'number' ? payload.total : undefined,
        error: typeof payload.error === 'string' ? payload.error : undefined,
      });
    },
  );
  ipcMain.on(
    'extension:grammar-match-reply',
    (
      _e,
      payload: {
        id?: string;
        ok?: boolean;
        matches?: Array<{ id: string; title: string; level: string; meaning: string }>;
        error?: string;
      },
    ) => {
      if (!payload || typeof payload.id !== 'string') return;
      const pending = pendingGrammarMatchReplies.get(payload.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingGrammarMatchReplies.delete(payload.id);
      pending.resolve({
        ok: payload.ok === true,
        matches: Array.isArray(payload.matches) ? payload.matches : [],
        error: typeof payload.error === 'string' ? payload.error : undefined,
      });
    },
  );
  ipcMain.on(
    'extension:level-estimate-reply',
    (_e, payload: { id?: string; result?: LevelEstimateBridgeResult }) => {
      if (!payload || typeof payload.id !== 'string') return;
      const pending = pendingLevelEstimateReplies.get(payload.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingLevelEstimateReplies.delete(payload.id);
      const r = payload.result;
      pending.resolve(
        r && typeof r === 'object'
          ? {
              ok: r.ok === true,
              badge: typeof r.badge === 'string' && r.badge ? r.badge : '—',
              empty: !!r.empty,
              noLists: !!r.noLists,
              lang: r.lang === 'ja' || r.lang === 'zh' ? r.lang : null,
              scheme: r.scheme === 'jlpt' || r.scheme === 'hsk' ? r.scheme : null,
              label: typeof r.label === 'string' ? r.label : undefined,
              confidence: typeof r.confidence === 'number' ? r.confidence : undefined,
              error: typeof r.error === 'string' ? r.error : undefined,
            }
          : { ok: false, badge: '—' },
      );
    },
  );
  ipcMain.on(
    'extension:clipboard-list-reply',
    (
      _e,
      payload: {
        id?: string;
        entries?: Array<{ id: string; type: string; text: string; createdAt: number }>;
      },
    ) => {
      if (!payload || typeof payload.id !== 'string') return;
      const pending = pendingClipboardListReplies.get(payload.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingClipboardListReplies.delete(payload.id);
      pending.resolve({
        ok: true,
        entries: Array.isArray(payload.entries) ? payload.entries : [],
      });
    },
  );
  ipcMain.on(
    'extension:transcribe-reply',
    (_e, payload: { id?: string; ok?: boolean; text?: string; error?: string }) => {
      if (!payload || typeof payload.id !== 'string') return;
      const pending = pendingTranscribeReplies.get(payload.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingTranscribeReplies.delete(payload.id);
      pending.resolve({
        ok: payload.ok === true,
        text: typeof payload.text === 'string' ? payload.text : undefined,
        error: typeof payload.error === 'string' ? payload.error : undefined,
      });
    },
  );
}
