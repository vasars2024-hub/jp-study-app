/**
 * Which window answers the Chrome extension, and the mines it has not answered yet.
 *
 * Every Study OS window (pop-outs included) and Blanc install the renderer
 * bridges (studyBackgroundJobs.ts). Main used to send each extension request to
 * ALL windows, so with a pop-out open a mined word was added to the deck twice
 * and Whisper ran twice. Main now sends to exactly one host window
 * (`bridgeTargets()`), chosen by a resolver main.ts registers.
 *
 * A mine is also durable: `deliverMined` persists it to
 * `userData/extension-pending-mines.json` before sending, and only an
 * `extension:mined-ack` from the renderer removes it. A mine that arrives with
 * no window open (or a window still loading) stays pending and is replayed to
 * the host when its renderer sends `extension:bridge-ready`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';

// ── host window ──────────────────────────────────────────────────────────────

export type ExtensionBridgeHostResolver = () => BrowserWindow | null;

function isLive(w: BrowserWindow | null | undefined): w is BrowserWindow {
  if (!w) return false;
  try {
    if (w.isDestroyed()) return false;
    const wc = w.webContents as (Electron.WebContents & { isDestroyed?: () => boolean }) | undefined;
    if (!wc) return false;
    if (typeof wc.isDestroyed === 'function' && wc.isDestroyed()) return false;
    return true;
  } catch {
    return false;
  }
}

/** First live window that is not always-on-top (a widget), else none. */
function defaultResolver(): BrowserWindow | null {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!isLive(w)) continue;
    let onTop = false;
    try {
      onTop = typeof w.isAlwaysOnTop === 'function' && w.isAlwaysOnTop();
    } catch {
      onTop = false;
    }
    if (!onTop) return w;
  }
  return null;
}

let resolver: ExtensionBridgeHostResolver = defaultResolver;

/** Register how the host window is chosen; `null` restores the default. */
export function setExtensionBridgeHostResolver(fn: ExtensionBridgeHostResolver | null): void {
  resolver = fn ?? defaultResolver;
}

/** The one window that answers the extension right now, or null. */
export function bridgeHostWindow(): BrowserWindow | null {
  let w: BrowserWindow | null = null;
  try {
    w = resolver();
  } catch {
    w = null;
  }
  return isLive(w) ? w : null;
}

/** 0 or 1 window: iterate this instead of `BrowserWindow.getAllWindows()` when sending a bridge request. */
export function bridgeTargets(): BrowserWindow[] {
  const w = bridgeHostWindow();
  return w ? [w] : [];
}

function sendToHost(host: BrowserWindow, channel: string, payload: unknown): boolean {
  try {
    host.webContents.send(channel, payload);
    return true;
  } catch {
    return false;
  }
}

// ── durable pending mines ────────────────────────────────────────────────────

export const PENDING_MINES_FILE = 'extension-pending-mines.json';
export const PENDING_MINES_SIDECAR_DIR = 'extension-pending-mines';
const MAX_PENDING_MINES = 500;
const MAX_PENDING_BYTES = 50 * 1024 * 1024;
/** A payload larger than this keeps its audio in a sidecar file. */
const SIDECAR_THRESHOLD_BYTES = 8 * 1024 * 1024;
/** A mine the renderer acked with ok:false is retried this many times, then dropped. */
const MAX_FAILED_ATTEMPTS = 3;
const DEFAULT_ACK_TIMEOUT_MS = 4000;

interface PendingMine {
  mineId: string;
  createdAt: number;
  /** Renderer acks with ok:false so far. */
  failures: number;
  /** Bytes this entry occupies (inline payload + sidecar). */
  bytes: number;
  payload: Record<string, unknown>;
  /** Present when the audio was moved to `<sidecar dir>/<mineId>.json`. */
  sidecar?: boolean;
}

interface SidecarAudio {
  audioDataUrl?: string;
  ankiAudioBase64?: string;
}

let store: PendingMine[] | null = null;

function storeFile(): string {
  return path.join(app.getPath('userData'), PENDING_MINES_FILE);
}

function sidecarFile(mineId: string): string {
  return path.join(app.getPath('userData'), PENDING_MINES_SIDECAR_DIR, `${mineId.replace(/[^A-Za-z0-9-]/g, '')}.json`);
}

function isPendingMine(value: unknown): value is PendingMine {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<PendingMine>;
  return typeof v.mineId === 'string' && !!v.mineId && !!v.payload && typeof v.payload === 'object';
}

function loadStore(): PendingMine[] {
  if (store) return store;
  try {
    const raw = readJsonSync<unknown>(storeFile(), [], { validate: (v) => Array.isArray(v) });
    store = (Array.isArray(raw) ? raw : []).filter(isPendingMine).map((m) => ({
      ...m,
      createdAt: Number(m.createdAt) || 0,
      failures: Number(m.failures) || 0,
      bytes: Number(m.bytes) || 0,
    }));
  } catch {
    store = [];
  }
  return store;
}

function saveStore(): void {
  try {
    writeJsonAtomicSync(storeFile(), loadStore(), { space: 0 });
  } catch (err) {
    console.warn(`[extensionBridgeHost] could not persist pending mines: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function removeSidecar(mineId: string): void {
  try {
    fs.rmSync(sidecarFile(mineId), { force: true });
  } catch {
    /* housekeeping */
  }
}

/** Drop the oldest entries until the store fits its entry and byte caps. */
function enforceCaps(list: PendingMine[]): void {
  let total = list.reduce((sum, m) => sum + m.bytes, 0);
  while (list.length > MAX_PENDING_MINES || (total > MAX_PENDING_BYTES && list.length > 1)) {
    const dropped = list.shift();
    if (!dropped) break;
    total -= dropped.bytes;
    if (dropped.sidecar) removeSidecar(dropped.mineId);
    console.warn(`[extensionBridgeHost] pending-mine store full; dropped ${dropped.mineId}`);
  }
}

/** Build a store entry; a huge payload's audio goes to a sidecar file. */
function makeEntry(mineId: string, payload: Record<string, unknown>): PendingMine {
  const inline = JSON.stringify(payload) ?? '{}';
  const bytes = Buffer.byteLength(inline, 'utf8');
  const entry: PendingMine = { mineId, createdAt: Date.now(), failures: 0, bytes, payload };
  if (bytes <= SIDECAR_THRESHOLD_BYTES) return entry;
  const audio: SidecarAudio = {};
  const stripped: Record<string, unknown> = { ...payload };
  if (typeof payload.audioDataUrl === 'string') {
    audio.audioDataUrl = payload.audioDataUrl;
    delete stripped.audioDataUrl;
  }
  const ankiRequest = payload.ankiRequest;
  if (ankiRequest && typeof ankiRequest === 'object' && typeof (ankiRequest as { audioBase64?: unknown }).audioBase64 === 'string') {
    audio.ankiAudioBase64 = (ankiRequest as { audioBase64: string }).audioBase64;
    const rest: Record<string, unknown> = { ...(ankiRequest as Record<string, unknown>) };
    delete rest.audioBase64;
    stripped.ankiRequest = rest;
  }
  if (audio.audioDataUrl === undefined && audio.ankiAudioBase64 === undefined) return entry;
  try {
    writeJsonAtomicSync(sidecarFile(mineId), audio, { space: 0, backup: false });
    // `bytes` stays the full size: the sidecar counts toward the 50 MB cap.
    return { ...entry, payload: stripped, sidecar: true };
  } catch {
    return entry;
  }
}

/** The payload as the renderer should receive it (sidecar audio put back). */
function rehydrate(entry: PendingMine): Record<string, unknown> {
  if (!entry.sidecar) return { ...entry.payload };
  const audio = readJsonSync<SidecarAudio>(sidecarFile(entry.mineId), {}, { validate: (v) => !!v && typeof v === 'object' });
  const out: Record<string, unknown> = { ...entry.payload };
  if (typeof audio.audioDataUrl === 'string') out.audioDataUrl = audio.audioDataUrl;
  if (typeof audio.ankiAudioBase64 === 'string' && out.ankiRequest && typeof out.ankiRequest === 'object') {
    out.ankiRequest = { ...(out.ankiRequest as Record<string, unknown>), audioBase64: audio.ankiAudioBase64 };
  }
  return out;
}

function findEntry(mineId: string): PendingMine | undefined {
  return loadStore().find((m) => m.mineId === mineId);
}

function removeEntry(mineId: string): void {
  const list = loadStore();
  const idx = list.findIndex((m) => m.mineId === mineId);
  if (idx < 0) return;
  const [entry] = list.splice(idx, 1);
  if (entry?.sidecar) removeSidecar(mineId);
  saveStore();
}

export interface MineAckResult {
  /** The renderer received it and answered. */
  acked: boolean;
  /** The renderer could not save it locally (it stays pending for a retry, up to a limit). */
  error?: string;
}

interface AckWaiter {
  resolve: (result: MineAckResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

const ackWaiters = new Map<string, AckWaiter>();
/** One send per mineId at a time: a replay never sends a mine a live delivery is still waiting on. */
const inFlight = new Map<string, Promise<MineAckResult>>();

/** Apply a renderer ack to the store (also for an ack that arrives after its timeout). */
function applyAck(mineId: string, ok: boolean, error?: string): MineAckResult {
  const entry = findEntry(mineId);
  if (ok) {
    removeEntry(mineId);
    return { acked: true };
  }
  if (entry) {
    entry.failures += 1;
    if (entry.failures >= MAX_FAILED_ATTEMPTS) removeEntry(mineId);
    else saveStore();
  }
  return { acked: true, error: error || 'The app could not save the mined card' };
}

function sendAndAwaitAck(
  host: BrowserWindow,
  mineId: string,
  payload: Record<string, unknown>,
  ackTimeoutMs: number,
): Promise<MineAckResult> {
  const running = inFlight.get(mineId);
  if (running) return running;
  const work = new Promise<MineAckResult>((resolve) => {
    const timer = setTimeout(() => {
      ackWaiters.delete(mineId);
      resolve({ acked: false });
    }, Math.max(0, ackTimeoutMs));
    ackWaiters.set(mineId, { resolve, timer });
    if (!sendToHost(host, 'extension:mined', { ...payload, mineId })) {
      clearTimeout(timer);
      ackWaiters.delete(mineId);
      resolve({ acked: false });
    }
  }).finally(() => {
    inFlight.delete(mineId);
  });
  inFlight.set(mineId, work);
  return work;
}

export interface DeliverMinedResult {
  /** The host renderer received the mine and acked it. */
  delivered: boolean;
  /** Still persisted, to be replayed when a host renderer is ready. */
  pending: boolean;
  mineId: string;
  /** The renderer acked but could not save the card. */
  error?: string;
}

/**
 * Persist a mine, send it to the host window only, and wait for its ack.
 * With no host, or no ack in time, the mine stays persisted for replay.
 */
export async function deliverMined(
  payload: Record<string, unknown>,
  opts: { ackTimeoutMs?: number } = {},
): Promise<DeliverMinedResult> {
  const mineId = crypto.randomUUID();
  const list = loadStore();
  list.push(makeEntry(mineId, { ...payload }));
  enforceCaps(list);
  saveStore();
  const host = bridgeHostWindow();
  if (!host) return { delivered: false, pending: !!findEntry(mineId), mineId };
  const result = await sendAndAwaitAck(host, mineId, payload, opts.ackTimeoutMs ?? DEFAULT_ACK_TIMEOUT_MS);
  const pending = !!findEntry(mineId);
  if (!result.acked) return { delivered: false, pending, mineId };
  return { delivered: true, pending, mineId, ...(result.error ? { error: result.error } : {}) };
}

export function pendingMineCount(): number {
  return loadStore().length;
}

let replayRun: Promise<number> | null = null;

/**
 * Send every pending mine to the host, oldest first, each awaiting its ack.
 * Concurrent calls share the running replay. Stops at the first mine the host
 * does not ack (it is not ready; the next `extension:bridge-ready` retries).
 * Resolves with the number of mines acked.
 */
export function replayPendingMines(opts: { ackTimeoutMs?: number } = {}): Promise<number> {
  if (replayRun) return replayRun;
  const run = (async () => {
    let acked = 0;
    const ids = loadStore().map((m) => m.mineId);
    for (const mineId of ids) {
      const host = bridgeHostWindow();
      if (!host) break;
      const running = inFlight.get(mineId);
      if (running) {
        // A live delivery is already waiting on this one; never send it twice.
        if ((await running).acked) acked++;
        continue;
      }
      const entry = findEntry(mineId);
      if (!entry) continue;
      let payload: Record<string, unknown>;
      try {
        payload = rehydrate(entry);
      } catch {
        payload = { ...entry.payload };
      }
      const result = await sendAndAwaitAck(host, mineId, payload, opts.ackTimeoutMs ?? DEFAULT_ACK_TIMEOUT_MS);
      if (!result.acked) break;
      acked++;
    }
    return acked;
  })().finally(() => {
    replayRun = null;
  });
  replayRun = run;
  return run;
}

// ── known-word snapshot ──────────────────────────────────────────────────────

const MAX_SNAPSHOT_WORDS = 200_000;
const SNAPSHOT_TIMEOUT_MS = 4000;
const SNAPSHOT_CACHE_MS = 30_000;

export interface KnownSnapshotResult {
  ok: boolean;
  words: Record<string, number>;
  lang?: string;
  error?: string;
}

interface SnapshotWaiter {
  resolve: (result: KnownSnapshotResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

const snapshotWaiters = new Map<string, SnapshotWaiter>();
let cachedSnapshot: { at: number; words: Record<string, number>; lang?: string } | null = null;

function sanitizeWords(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  let n = 0;
  for (const [word, level] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_SNAPSHOT_WORDS) break;
    if (!word || word.length > 200) continue;
    const lv = Number(level);
    if (!Number.isFinite(lv)) continue;
    out[word] = lv;
    n++;
  }
  return out;
}

/** Ask the host renderer for every known word and its level (page word-status colouring). */
export function requestKnownSnapshot(opts: { timeoutMs?: number } = {}): Promise<KnownSnapshotResult> {
  const host = bridgeHostWindow();
  if (!host) return Promise.resolve({ ok: false, words: {}, error: 'Gum window is not open' });
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      snapshotWaiters.delete(id);
      resolve({ ok: false, words: {}, error: 'timeout' });
    }, opts.timeoutMs ?? SNAPSHOT_TIMEOUT_MS);
    snapshotWaiters.set(id, { resolve, timer });
    if (!sendToHost(host, 'extension:known-snapshot-request', { id })) {
      clearTimeout(timer);
      snapshotWaiters.delete(id);
      resolve({ ok: false, words: {}, error: 'Gum window is not open' });
    }
  });
}

/** The last good snapshot when it is under 30 s old, else null. */
export function getCachedKnownSnapshot(now: number = Date.now()): KnownSnapshotResult | null {
  if (!cachedSnapshot || now - cachedSnapshot.at > SNAPSHOT_CACHE_MS) return null;
  return {
    ok: true,
    words: cachedSnapshot.words,
    ...(cachedSnapshot.lang ? { lang: cachedSnapshot.lang } : {}),
  };
}

/** Forget the cached snapshot (a word's level changed). */
export function invalidateKnownSnapshotCache(): void {
  cachedSnapshot = null;
}

// ── IPC ──────────────────────────────────────────────────────────────────────

let ipcRegistered = false;

export function registerExtensionBridgeHostIpc(): void {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.on('extension:mined-ack', (_e, payload: { mineId?: unknown; ok?: unknown; error?: unknown }) => {
    const mineId = typeof payload?.mineId === 'string' ? payload.mineId : '';
    if (!mineId) return;
    const ok = payload.ok !== false;
    const result = applyAck(mineId, ok, typeof payload.error === 'string' ? payload.error : undefined);
    const waiter = ackWaiters.get(mineId);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    ackWaiters.delete(mineId);
    waiter.resolve(result);
  });

  ipcMain.on('extension:bridge-ready', (e) => {
    const host = bridgeHostWindow();
    if (!host) return;
    // Only the host's renderer triggers a replay; a pop-out's bridge is idle.
    if (!e || host.webContents !== (e as { sender?: unknown }).sender) return;
    if (!pendingMineCount()) return;
    void replayPendingMines();
  });

  ipcMain.on('extension:known-snapshot-reply', (_e, payload: { id?: unknown; words?: unknown; lang?: unknown }) => {
    const id = typeof payload?.id === 'string' ? payload.id : '';
    const waiter = id ? snapshotWaiters.get(id) : undefined;
    if (!waiter) return;
    clearTimeout(waiter.timer);
    snapshotWaiters.delete(id);
    const words = sanitizeWords(payload.words);
    if (!words) {
      waiter.resolve({ ok: false, words: {}, error: 'bad snapshot reply' });
      return;
    }
    const lang = typeof payload.lang === 'string' && payload.lang ? payload.lang.slice(0, 8) : undefined;
    cachedSnapshot = { at: Date.now(), words, ...(lang ? { lang } : {}) };
    waiter.resolve({ ok: true, words, ...(lang ? { lang } : {}) });
  });
}

/** Test hook: forget all in-memory state (the store is re-read from disk). */
export function __resetExtensionBridgeHostForTests(): void {
  for (const w of ackWaiters.values()) clearTimeout(w.timer);
  for (const w of snapshotWaiters.values()) clearTimeout(w.timer);
  ackWaiters.clear();
  snapshotWaiters.clear();
  inFlight.clear();
  replayRun = null;
  store = null;
  cachedSnapshot = null;
  resolver = defaultResolver;
}
