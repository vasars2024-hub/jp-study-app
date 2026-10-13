/**
 * Snip to cards — main's half.
 *
 * The owner presses Windows' own Win+Shift+S and snips study-language text
 * anywhere on screen. This module notices the new picture on the clipboard
 * (Gum keeps running in the tray, so it works with every window hidden), keeps
 * the picture in the profile's snip history, OCRs it with an installed accurate
 * engine when there is one, and hands it to the main window's renderer
 * (`renderer/snipToCards.ts`), which splits the text, adds the unknown words as
 * cards and reports back. A small toast window says what happened while Gum is
 * in the background, with Undo and Open.
 *
 * Clipboard watching is a cheap poll (~500 ms). Electron exposes no clipboard
 * sequence number and the app takes no native dependency for one, so each poll
 * reads only the format list and the raw bytes of the registered "PNG" format
 * (a copy, no decode). The picture itself is decoded only when those changed —
 * or, for a bitmap-only clipboard, on a schedule that backs off to 2 s while
 * the same picture stays. A decoded picture is told apart by its size and a
 * hash of a few sampled patches; only a changed probe pays for the full
 * content hash, and a content hash already in the history is never read again. The picture
 * on the clipboard when watching starts is never treated as a new snip, nor is
 * one that arrives while the app is locked, nor one Gum put there itself.
 *
 * Nothing leaves the machine from here: the pictures stay in the profile
 * (`snips/`, capped by count and bytes, oldest deleted first) and OCR only uses
 * engines that are installed — a missing model is offered, never downloaded.
 */

import { app, BrowserWindow, clipboard, ipcMain, nativeImage, screen } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readJsonSync, writeFileAtomicSync, writeJsonAtomicSync } from './atomicJson';
import { appLocked } from './lockGuard';
import { gumWroteClipboardRecently } from './gumClipboardWrites';
import { getMainStudyLang } from './studyLanguage';
import { installedPaddleLangs, paddleOcrAvailable, type PaddleLang } from './paddleOcr';
import { mangaOcrAvailable } from './mangaOcr';
import { boundedScreenshotDataUrl, ocrClipboardImage } from './screenOcr';
import { refreshGlobalCommands, registerGlobalCommand } from './globalCommands';
import { refreshAppTray } from './systemDictionary';
import { mt } from './i18n';
import {
  cleanSnipDeckName,
  clipboardHasImageFormat,
  normalizeSnipAction,
  normalizeSnipSettings,
  normalizeSnipToastPayload,
  normalizeSnipWord,
  pruneSnipHistory,
  snipImageRejection,
  snipMatchesQuery,
  SNIP_CLEARABLE_FIELDS,
  SNIP_SETTINGS_DEFAULTS,
  SNIP_TOAST_NOTICE_MS,
  type SnipAction,
  type SnipEntry,
  type SnipEntryPatch,
  type SnipError,
  type SnipJob,
  type SnipSettings,
  type SnipStatus,
  type SnipToastPayload,
} from '../shared/snipToCards';
import { normalizeStudyLang } from '../shared/studyLang';
import { holdUnsavedWork } from './unsavedWork';

interface SnipDeps {
  rendererUrl: (query?: string) => string;
  forwardConsole?: (win: BrowserWindow) => void;
  attachNavGuards?: (win: BrowserWindow) => void;
  isDevServer: boolean;
  /** The Study OS window, when it exists. */
  getMainWindow: () => BrowserWindow | null;
  /** The Blanc window, when it exists (a Blanc-only launch mines there). */
  getBlancWindow?: () => BrowserWindow | null;
  /** Create the Study OS window hidden, so a snip has somewhere to be mined. */
  ensureMainWindow: () => void;
}

let deps: SnipDeps | null = null;

export function configureSnipToCards(next: SnipDeps): void {
  deps = next;
}

// ---- Settings ---------------------------------------------------------------

const SETTINGS_FILE = 'snip-to-cards.json';
let settings: SnipSettings = { ...SNIP_SETTINGS_DEFAULTS };
let settingsLoaded = false;

function settingsPath(): string {
  return path.join(app.getPath('userData'), SETTINGS_FILE);
}

function ensureSettings(): SnipSettings {
  if (!settingsLoaded) {
    // No file is a new or an existing profile from before this feature: both
    // get the defaults, which have watching on.
    settings = normalizeSnipSettings(readJsonSync<unknown>(settingsPath(), {}));
    settingsLoaded = true;
  }
  return settings;
}

function saveSettings(): void {
  try {
    writeJsonAtomicSync(settingsPath(), settings);
  } catch (err) {
    console.error('[snipToCards] settings save failed', err);
  }
}

// ---- History ----------------------------------------------------------------

const HISTORY_DIR = 'snips';
const INDEX_FILE = 'index.json';
let history: SnipEntry[] | null = null;

function historyDir(): string {
  return path.join(app.getPath('userData'), HISTORY_DIR);
}

function imagePath(id: string): string {
  // Ids are minted here (`snip-<base36>-<hex>`); anything else never reaches the disk.
  return path.join(historyDir(), `${id.replace(/[^a-z0-9-]/gi, '')}.png`);
}

function normalizeEntry(raw: unknown): SnipEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && /^snip-[a-z0-9-]+$/i.test(r.id) ? r.id : null;
  if (!id) return null;
  const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const words = Array.isArray(r.words) ? r.words.map(normalizeSnipWord).filter((w): w is NonNullable<typeof w> => !!w) : [];
  const status = r.status === 'done' || r.status === 'error' ? r.status : 'processing';
  return {
    id,
    createdAt: num(r.createdAt),
    lang: normalizeStudyLang(r.lang),
    status,
    ...(typeof r.error === 'string' ? { error: r.error as SnipError } : {}),
    ...(Array.isArray(r.installIds) ? { installIds: r.installIds.filter((x): x is string => typeof x === 'string').slice(0, 8) } : {}),
    width: num(r.width),
    height: num(r.height),
    bytes: num(r.bytes),
    hash: typeof r.hash === 'string' ? r.hash : '',
    ...(typeof r.engine === 'string' ? { engine: r.engine } : {}),
    ...(Number.isFinite(Number(r.confidence)) && r.confidence !== undefined ? { confidence: Number(r.confidence) } : {}),
    text: typeof r.text === 'string' ? r.text.slice(0, 20_000) : '',
    words,
    grammar: Array.isArray(r.grammar)
      ? r.grammar
        .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object' && typeof (g as { title?: unknown }).title === 'string')
        .slice(0, 40)
        .map((g) => ({
          title: String(g.title).slice(0, 200),
          ...(typeof g.id === 'string' ? { id: g.id } : {}),
          ...(typeof g.meaning === 'string' ? { meaning: g.meaning.slice(0, 500) } : {}),
          ...(typeof g.level === 'string' ? { level: g.level.slice(0, 20) } : {}),
        }))
      : [],
    ...(typeof r.translation === 'string' ? { translation: r.translation.slice(0, 20_000) } : {}),
    ...(typeof r.translationError === 'string' ? { translationError: r.translationError.slice(0, 500) } : {}),
    cardIds: Array.isArray(r.cardIds) ? r.cardIds.filter((x): x is string => typeof x === 'string').slice(0, 200) : [],
    ankiNoteIds: Array.isArray(r.ankiNoteIds)
      ? r.ankiNoteIds.map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 200)
      : [],
    ...(r.undone === true ? { undone: true } : {}),
    ...(Number.isFinite(Number(r.overLimit)) && Number(r.overLimit) > 0 ? { overLimit: Number(r.overLimit) } : {}),
    ...(r.review === 'manual' || r.review === 'uncertain' ? { review: r.review } : {}),
    ...(cleanSnipDeckName(r.deck) ? { deck: cleanSnipDeckName(r.deck) } : {}),
    ...(typeof r.ocrText === 'string' ? { ocrText: r.ocrText.slice(0, 20_000) } : {}),
  };
}

function loadHistory(): SnipEntry[] {
  if (history) return history;
  const raw = readJsonSync<{ entries?: unknown }>(path.join(historyDir(), INDEX_FILE), {}, {
    validate: (v) => typeof v === 'object' && v !== null,
  });
  const entries = Array.isArray(raw.entries) ? raw.entries.map(normalizeEntry).filter((e): e is SnipEntry => !!e) : [];
  // A snip that was still being read when the app closed is not going to finish.
  history = entries.map((e) => (e.status === 'processing' ? { ...e, status: 'error', error: 'cancelled' } : e));
  return history;
}

function saveHistory(): void {
  if (!history) return;
  try {
    fs.mkdirSync(historyDir(), { recursive: true });
    writeJsonAtomicSync(path.join(historyDir(), INDEX_FILE), { version: 1, entries: history }, { space: 0 });
  } catch (err) {
    console.error('[snipToCards] history save failed', err);
  }
}

function removeImages(entries: readonly SnipEntry[]): void {
  for (const entry of entries) {
    try {
      fs.rmSync(imagePath(entry.id), { force: true });
    } catch {
      /* already gone */
    }
  }
}

function addEntry(entry: SnipEntry): void {
  const { kept, dropped } = pruneSnipHistory([entry, ...loadHistory()]);
  history = kept;
  removeImages(dropped);
  saveHistory();
}

function getEntry(id: unknown): SnipEntry | null {
  return typeof id === 'string' ? loadHistory().find((e) => e.id === id) ?? null : null;
}

function patchEntry(id: unknown, patch: unknown): SnipEntry | null {
  const current = getEntry(id);
  if (!current || !patch || typeof patch !== 'object') return null;
  const { clear, ...p } = patch as SnipEntryPatch;
  // Identity, size and the picture's hash belong to main; the rest is the pipeline's.
  const merged: Record<string, unknown> = {
    ...current,
    ...p,
    id: current.id,
    hash: current.hash,
    createdAt: current.createdAt,
    bytes: current.bytes,
    width: current.width,
    height: current.height,
  };
  for (const field of Array.isArray(clear) ? clear : []) {
    if (SNIP_CLEARABLE_FIELDS.has(field)) delete merged[field];
  }
  const next = normalizeEntry(merged);
  if (!next) return null;
  history = loadHistory().map((e) => (e.id === current.id ? next : e));
  saveHistory();
  broadcast('snip:history-changed', { id: next.id });
  return next;
}

function historyBytes(): number {
  return loadHistory().reduce((s, e) => s + (e.bytes || 0), 0);
}

// ---- Watching ---------------------------------------------------------------

const POLL_MS = 500;
/**
 * With no raw-bytes fingerprint (an app that put only a bitmap on the
 * clipboard), the picture is re-checked on a backing-off schedule up to this.
 */
const IDLE_PROBE_MAX_MS = 2000;
/** Bigger than any real snip's PNG; never hashed or stored. */
const MAX_PNG_BYTES = 40 * 1024 * 1024;
const SAMPLE = 8;
/**
 * The clipboard formats whose raw bytes identify the picture without decoding
 * it. The Snipping Tool (Win+Shift+S), ShareX and browsers put the registered
 * "PNG" format next to the bitmap; reading it is a copy, not a decode.
 */
const RAW_FORMATS = ['PNG'] as const;
/** Above this, the raw fingerprint hashes the length and three slices, not every byte. */
const RAW_HASH_ALL_BYTES = 8 * 1024 * 1024;
const RAW_SLICE = 64 * 1024;

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;
let lastProbe = '';
/** The cheap signal (format list + raw-bytes fingerprint) at the last poll. */
let lastCheap = '';
/** No raw fingerprint: when the picture may be decoded again, and the current back-off. */
let nextFullAt = 0;
let idleDelay = POLL_MS;
/** How many times a clipboard picture was decoded (`readImage`); a test seam. */
let decodes = 0;
const sessionHashes = new Set<string>();

/** Size + a hash of five small patches: cheap, and different for any two real snips. */
function probeKey(formats: readonly string[], image: Electron.NativeImage): string {
  const { width, height } = image.getSize();
  const h = crypto.createHash('sha1');
  h.update(`${formats.join(',')}|${width}x${height}`);
  try {
    if (width >= SAMPLE * 2 && height >= SAMPLE * 2) {
      const xs = [0, Math.floor((width - SAMPLE) / 2), width - SAMPLE];
      const ys = [0, Math.floor((height - SAMPLE) / 2), height - SAMPLE];
      for (const [x, y] of [[xs[0], ys[0]], [xs[2], ys[0]], [xs[1], ys[1]], [xs[0], ys[2]], [xs[2], ys[2]]]) {
        h.update(image.crop({ x, y, width: SAMPLE, height: SAMPLE }).toBitmap());
      }
    } else {
      h.update(image.toBitmap());
    }
  } catch {
    /* a picture that cannot be sampled is still told apart by its size */
  }
  return h.digest('hex');
}

/** A hash of the raw bytes of one picture format, or '' when none is on the clipboard. */
function rawFingerprint(): string {
  if (typeof clipboard.readBuffer !== 'function') return '';
  for (const format of RAW_FORMATS) {
    let buf: Buffer;
    try {
      buf = clipboard.readBuffer(format);
    } catch {
      continue;
    }
    if (!buf || !buf.length) continue;
    const h = crypto.createHash('sha1');
    h.update(`${format}:${buf.length}:`);
    if (buf.length <= RAW_HASH_ALL_BYTES) {
      h.update(buf);
    } else {
      const mid = Math.floor((buf.length - RAW_SLICE) / 2);
      h.update(buf.subarray(0, RAW_SLICE));
      h.update(buf.subarray(mid, mid + RAW_SLICE));
      h.update(buf.subarray(buf.length - RAW_SLICE));
    }
    return h.digest('hex');
  }
  return '';
}

interface CheapProbe {
  formats: string[];
  hasImage: boolean;
  /** Raw-bytes fingerprint; '' when the clipboard carries no raw picture format. */
  raw: string;
  /** Formats + raw: changes whenever anything on the clipboard visibly changed. */
  key: string;
}

/** What can be learned without decoding a picture. */
function cheapProbe(): CheapProbe {
  let formats: string[];
  try {
    formats = clipboard.availableFormats();
  } catch {
    return { formats: [], hasImage: false, raw: '', key: '' };
  }
  const hasImage = clipboardHasImageFormat(formats);
  const raw = hasImage ? rawFingerprint() : '';
  return { formats, hasImage, raw, key: `${formats.join(',')}|${raw}` };
}

/** Decode the clipboard picture and probe it; '' when there is none. */
function fullProbe(formats: readonly string[]): { key: string; image: Electron.NativeImage | null } {
  let image: Electron.NativeImage;
  try {
    decodes += 1;
    image = clipboard.readImage();
  } catch {
    return { key: '', image: null };
  }
  if (!image || image.isEmpty()) return { key: '', image: null };
  return { key: probeKey(formats, image), image };
}

function resetBackoff(now: number): void {
  idleDelay = POLL_MS;
  nextFullAt = now + POLL_MS;
}

/** Whatever is on the clipboard now is "already seen" (start, resume, unlock). */
function primeProbe(now = Date.now()): void {
  const cheap = cheapProbe();
  lastCheap = cheap.key;
  lastProbe = cheap.hasImage ? fullProbe(cheap.formats).key : '';
  resetBackoff(now);
}

/**
 * One poll. The picture is decoded only when something may have changed: the
 * format list or the raw PNG bytes changed, or — for a clipboard that carries
 * only a bitmap, where nothing cheaper tells two pictures apart — on a schedule
 * that backs off to `IDLE_PROBE_MAX_MS` while the same picture stays. A
 * picture that sits on the clipboard for hours is no longer decoded twice a
 * second.
 */
function tick(now = Date.now()): void {
  if (!started || !ensureSettings().enabled) return;
  const cheap = cheapProbe();
  const changed = cheap.key !== lastCheap;
  lastCheap = cheap.key;
  if (!cheap.hasImage) {
    lastProbe = '';
    resetBackoff(now);
    return;
  }
  // The same raw bytes are the same picture; without them, wait for the back-off.
  if (!changed && (cheap.raw || now < nextFullAt)) return;
  const { key, image } = fullProbe(cheap.formats);
  if (key === lastProbe) {
    idleDelay = Math.min(IDLE_PROBE_MAX_MS, idleDelay * 2);
    nextFullAt = now + idleDelay;
    return;
  }
  resetBackoff(now);
  lastProbe = key;
  if (!image) return;
  // Seen, never read: a snip taken while Gum is locked is not studied after the
  // unlock, and Gum's own clipboard writes are not snips.
  if (appLocked() || gumWroteClipboardRecently()) return;
  void acceptImage(image);
}

function isKnownHash(hash: string): boolean {
  return sessionHashes.has(hash) || loadHistory().some((e) => e.hash === hash);
}

let chain: Promise<void> = Promise.resolve();

async function acceptImage(image: Electron.NativeImage): Promise<void> {
  const size = image.getSize();
  const rejected = snipImageRejection(size);
  if (rejected) {
    console.log(`[snipToCards] clipboard picture ignored (${rejected}, ${size.width}x${size.height})`);
    return;
  }
  let png: Buffer;
  try {
    png = image.toPNG();
  } catch {
    return;
  }
  if (!png.length || png.length > MAX_PNG_BYTES) return;
  const hash = crypto.createHash('sha256').update(png).digest('hex');
  if (isKnownHash(hash)) return;
  sessionHashes.add(hash);
  // One snip at a time: OCR is heavy, and two snips in a row keep their order.
  // Queued or being read, a snip is something "Restart to update" would cut short.
  const releaseUnsaved = holdUnsavedWork('snip');
  chain = chain.then(() => processSnip(image, png, hash)).catch((err) => {
    console.error('[snipToCards] snip failed', err);
  }).finally(releaseUnsaved);
  await chain;
}

function newId(): string {
  return `snip-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

/** Whether an accurate (downloaded) engine reads this study language. */
function accurateEngineFor(lang: string): boolean {
  if (lang === 'ja' && mangaOcrAvailable()) return true;
  return paddleOcrAvailable() && installedPaddleLangs().includes(lang as PaddleLang);
}

async function processSnip(image: Electron.NativeImage, png: Buffer, hash: string): Promise<void> {
  const lang = getMainStudyLang();
  const { width, height } = image.getSize();
  const entry: SnipEntry = {
    id: newId(),
    createdAt: Date.now(),
    lang,
    status: 'processing',
    width,
    height,
    bytes: png.length,
    hash,
    text: '',
    words: [],
    grammar: [],
    cardIds: [],
    ankiNoteIds: [],
  };
  try {
    fs.mkdirSync(historyDir(), { recursive: true });
    writeFileAtomicSync(imagePath(entry.id), png);
  } catch (err) {
    console.error('[snipToCards] could not store the snip', err);
    return;
  }
  addEntry(entry);
  broadcast('snip:history-changed', { id: entry.id });

  const job: SnipJob = { entry, settings: { ...ensureSettings() } };
  try {
    const jpeg = boundedScreenshotDataUrl(image);
    job.cardImage = { base64: jpeg.replace(/^data:image\/jpeg;base64,/, ''), filename: `gum-snip-${entry.id}.jpg` };
  } catch {
    /* cards without the picture are still cards */
  }

  if (accurateEngineFor(lang)) {
    const read = await ocrClipboardImage(image);
    if (read.ok && read.text.trim()) {
      job.ocr = { text: read.text, engine: read.engine, ...(read.confidence !== undefined ? { confidence: read.confidence } : {}) };
    } else if (lang !== 'ja') {
      job.entry = patchEntry(entry.id, { status: 'error', error: read.error ? 'ocr-failed' : 'no-text' }) ?? entry;
    }
  }
  if (!job.ocr && job.entry.status === 'processing') {
    if (lang === 'ja') {
      // The bundled offline recognizer (Tesseract, in the renderer) reads Japanese
      // with no download. The PNG is lossless, which is what it needs.
      job.basicOcr = { dataUrl: `data:image/png;base64,${png.toString('base64')}`, width, height };
    } else {
      // Chinese and Russian need their PaddleOCR pack. Offer it; never fetch it unasked.
      job.entry = patchEntry(entry.id, {
        status: 'error',
        error: 'models-missing',
        installIds: [`paddle-ocr-${lang}`],
      }) ?? entry;
    }
  }
  dispatch({ kind: 'process', payload: job });
}

// ---- The pipeline window ----------------------------------------------------

type Outgoing =
  | { kind: 'process'; payload: SnipJob }
  | { kind: 'action'; payload: SnipAction }
  | { kind: 'open'; payload: { id: string | null } };

const CHANNEL: Record<Outgoing['kind'], string> = {
  process: 'snip:process',
  action: 'snip:action',
  open: 'snip:open',
};

const readyIds = new Set<number>();
const pending: Outgoing[] = [];
const PENDING_LIMIT = 20;

function pipelineWindow(): BrowserWindow | null {
  const candidates = [deps?.getMainWindow() ?? null, deps?.getBlancWindow?.() ?? null];
  for (const win of candidates) {
    if (win && !win.isDestroyed() && readyIds.has(win.webContents.id)) return win;
  }
  return null;
}

function dispatch(message: Outgoing): void {
  const win = pipelineWindow();
  if (win) {
    win.webContents.send(CHANNEL[message.kind], message.payload);
    return;
  }
  pending.push(message);
  if (pending.length > PENDING_LIMIT) pending.splice(0, pending.length - PENDING_LIMIT);
  const main = deps?.getMainWindow() ?? null;
  const blanc = deps?.getBlancWindow?.() ?? null;
  if ((!main || main.isDestroyed()) && (!blanc || blanc.isDestroyed())) deps?.ensureMainWindow();
}

function flushPending(): void {
  const win = pipelineWindow();
  if (!win) return;
  for (const message of pending.splice(0)) win.webContents.send(CHANNEL[message.kind], message.payload);
}

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

// ---- Toast window -----------------------------------------------------------

const TOAST_WIDTH = 400;
/** Plain toast; one with Undo (and its countdown); one carrying the first-run notice. */
const TOAST_HEIGHT = { plain: 128, undo: 156, notice: 248 } as const;
/** The toast closes itself; this is the backstop if its page never does. */
const TOAST_MAX_MS = SNIP_TOAST_NOTICE_MS + 5_000;
let toast: BrowserWindow | null = null;
let toastPayload: SnipToastPayload | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function toastHeight(payload: SnipToastPayload): number {
  if (payload.notice) return TOAST_HEIGHT.notice;
  return payload.kind === 'added' && (payload.count ?? 0) > 0 ? TOAST_HEIGHT.undo : TOAST_HEIGHT.plain;
}

function toastBounds(payload: SnipToastPayload): Electron.Rectangle {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const height = toastHeight(payload);
  return {
    x: Math.round(area.x + area.width - TOAST_WIDTH - 16),
    y: Math.round(area.y + area.height - height - 16),
    width: TOAST_WIDTH,
    height,
  };
}

/**
 * The first snip that makes cards carries the one-time notice: watching and
 * adding are on by default, so the learner is told, once, and asked whether to
 * keep it. Marked as shown here (main owns the setting), so two windows never
 * both show it.
 */
function withNotice(payload: SnipToastPayload): SnipToastPayload {
  const s = ensureSettings();
  if (payload.kind !== 'added' || !(payload.count ?? 0) || s.notice !== 'pending') return payload;
  settings = { ...s, notice: 'shown' };
  saveSettings();
  broadcast('snip:settings-changed', status());
  return { ...payload, notice: true };
}

function hideToast(): void {
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = null;
  if (toast && !toast.isDestroyed()) toast.hide();
}

/** Show the small toast over other apps, without taking the focus from them. */
function showToast(payload: SnipToastPayload): boolean {
  if (!deps || appLocked()) return false;
  toastPayload = payload;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, TOAST_MAX_MS);
  const bounds = toastBounds(payload);
  if (toast && !toast.isDestroyed()) {
    toast.setBounds(bounds);
    toast.webContents.send('snip:toast', payload);
    toast.showInactive();
    return true;
  }
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  toast = win;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
  deps.attachNavGuards?.(win);
  if (deps.isDevServer) deps.forwardConsole?.(win);
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.showInactive();
  });
  win.on('closed', () => {
    if (toast === win) toast = null;
  });
  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed()) win.webContents.send('snip:toast', toastPayload);
  });
  void win.loadURL(deps.rendererUrl('snipToast=1'));
  return true;
}

/** Bring Gum forward on the Snips view (the user asked: a click on Open, the tray row). */
function openView(id: string | null): void {
  if (appLocked()) return;
  const main = deps?.getMainWindow() ?? null;
  const blanc = deps?.getBlancWindow?.() ?? null;
  const target = main && !main.isDestroyed() ? main : blanc && !blanc.isDestroyed() ? blanc : null;
  if (target) {
    if (target.isMinimized()) target.restore();
    target.show();
    target.focus();
  }
  dispatch({ kind: 'open', payload: { id } });
}

// ---- On / off ---------------------------------------------------------------

function status(): SnipStatus {
  const s = ensureSettings();
  return {
    ...s,
    watching: started && s.enabled && !appLocked(),
    historyCount: loadHistory().length,
    historyBytes: historyBytes(),
  };
}

function applySettings(next: SnipSettings): SnipStatus {
  const wasEnabled = settings.enabled;
  settings = next;
  settingsLoaded = true;
  saveSettings();
  // Turning watching back on must not read the picture that was already there.
  if (!wasEnabled && settings.enabled) primeProbe();
  refreshGlobalCommands();
  refreshAppTray();
  const out = status();
  broadcast('snip:settings-changed', out);
  return out;
}

function toggleWatching(): void {
  const next = applySettings({ ...ensureSettings(), enabled: !ensureSettings().enabled });
  showToast({ kind: next.enabled ? 'resumed' : 'paused' });
}

/** Gum's tray rows for the feature (added to the one app tray by main.ts). */
export function snipTrayItems(): Electron.MenuItemConstructorOptions[] {
  const s = ensureSettings();
  return [
    {
      label: mt('snip.tray.watch'),
      type: 'checkbox',
      checked: s.enabled,
      click: () => toggleWatching(),
    },
    { label: mt('snip.tray.open'), click: () => openView(null) },
  ];
}

// ---- Lifecycle --------------------------------------------------------------

let commandRegistered = false;

function ensureCommand(): void {
  if (commandRegistered) return;
  commandRegistered = true;
  registerGlobalCommand('snip.toggle', () => toggleWatching(), { available: () => started });
}

export function startSnipToCards(): void {
  ensureSettings();
  ensureCommand();
  started = true;
  primeProbe();
  if (!timer) {
    timer = setInterval(tick, POLL_MS);
    timer.unref?.();
  }
  refreshGlobalCommands();
}

export function stopSnipToCards(): void {
  started = false;
  if (timer) clearInterval(timer);
  timer = null;
  hideToast();
  if (toast && !toast.isDestroyed()) toast.destroy();
  toast = null;
}

export function registerSnipToCardsIpc(): void {
  ensureCommand();
  ipcMain.handle('snip:getStatus', (): SnipStatus => status());
  ipcMain.handle('snip:setSettings', (_e, patch: unknown): SnipStatus => {
    const p = patch && typeof patch === 'object' ? (patch as Record<string, unknown>) : {};
    return applySettings(normalizeSnipSettings({ ...ensureSettings(), ...p }));
  });

  ipcMain.handle('snip:history:list', (_e, query: unknown): SnipEntry[] => {
    const q = query && typeof query === 'object' ? (query as { search?: unknown; limit?: unknown }) : {};
    const search = typeof q.search === 'string' ? q.search : '';
    const limit = Math.max(1, Math.min(500, Number(q.limit) || 500));
    return loadHistory().filter((e) => snipMatchesQuery(e, search)).slice(0, limit);
  });
  ipcMain.handle('snip:history:get', (_e, id: unknown): SnipEntry | null => getEntry(id));
  ipcMain.handle('snip:history:update', (_e, id: unknown, patch: unknown): SnipEntry | null => patchEntry(id, patch));
  ipcMain.handle('snip:history:remove', (_e, id: unknown): number => {
    const entry = getEntry(id);
    if (!entry) return 0;
    history = loadHistory().filter((e) => e.id !== entry.id);
    removeImages([entry]);
    saveHistory();
    broadcast('snip:history-changed', { id: entry.id });
    return 1;
  });
  ipcMain.handle('snip:history:clear', (): number => {
    const all = loadHistory();
    history = [];
    removeImages(all);
    saveHistory();
    broadcast('snip:history-changed', { id: null });
    return all.length;
  });
  /** The stored picture as a bounded JPEG, for display. */
  ipcMain.handle('snip:image', (_e, id: unknown): string | null => {
    const entry = getEntry(id);
    if (!entry) return null;
    try {
      const image = nativeImage.createFromPath(imagePath(entry.id));
      return image.isEmpty() ? null : boundedScreenshotDataUrl(image);
    } catch {
      return null;
    }
  });

  // The pipeline window says it is listening; anything that waited is sent now.
  ipcMain.handle('snip:ready', (e): void => {
    const id = (e as Partial<Electron.IpcMainInvokeEvent>).sender?.id;
    if (typeof id === 'number') {
      readyIds.add(id);
      e.sender.once('destroyed', () => readyIds.delete(id));
    }
    flushPending();
  });
  // Undo and the per-word toggle run where the deck lives.
  ipcMain.handle('snip:action', (_e, raw: unknown): boolean => {
    const action = normalizeSnipAction(raw);
    if (!action || !getEntry(action.id)) return false;
    dispatch({ kind: 'action', payload: action });
    return true;
  });
  ipcMain.handle('snip:open', (_e, id: unknown): void => {
    hideToast();
    openView(typeof id === 'string' ? id : null);
  });

  ipcMain.handle('snip:toast:show', (_e, raw: unknown): boolean => {
    const payload = normalizeSnipToastPayload(raw);
    if (!payload || !deps || appLocked()) return false;
    return showToast(withNotice(payload));
  });
  ipcMain.handle('snip:toast:get', (): SnipToastPayload | null => toastPayload);
  ipcMain.handle('snip:toast:close', (): void => hideToast());
}

export const __snipToCardsTestables = {
  probeKey,
  tick,
  primeProbe,
  acceptImage,
  loadHistory,
  status,
  reset(): void {
    history = null;
    settingsLoaded = false;
    settings = { ...SNIP_SETTINGS_DEFAULTS };
    lastProbe = '';
    lastCheap = '';
    nextFullAt = 0;
    idleDelay = POLL_MS;
    decodes = 0;
    sessionHashes.clear();
    readyIds.clear();
    pending.splice(0);
    chain = Promise.resolve();
    started = false;
    if (timer) clearInterval(timer);
    timer = null;
  },
  pending: (): readonly Outgoing[] => pending,
  setStarted(on: boolean): void {
    started = on;
  },
  settled: (): Promise<void> => chain,
  /** How many times a clipboard picture has been decoded so far. */
  decodes: (): number => decodes,
};
