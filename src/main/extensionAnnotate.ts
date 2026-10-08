/**
 * `/v1/annotate` and `/v1/known-snapshot`, the extension's page word-status
 * colouring (WP8).
 *
 * Tokenizing happens in the bridge host renderer, which already holds the
 * app's kuromoji tokenizer and the known-word store (the same request/reply
 * pattern as the known-word snapshot in extensionBridgeHost.ts). This module
 * owns the main-process half: one request per batch, a timeout, and strict
 * sanitizing of whatever the renderer answers.
 */
import crypto from 'node:crypto';
import { ipcMain } from 'electron';
import { bridgeHostWindow } from './extensionBridgeHost';

export const ANNOTATE_MAX_TEXTS = 64;
export const ANNOTATE_MAX_TEXT_CHARS = 2000;
export const ANNOTATE_MAX_TOTAL_CHARS = 40_000;
const ANNOTATE_TIMEOUT_MS = 4000;

export interface AnnotateToken {
  /** Offset into the text. */
  o: number;
  /** Length in UTF-16 units. */
  n: number;
  /** Lemma (dictionary form). */
  l: string;
  /** Hiragana reading, only for words with kanji. */
  r?: string;
  /** Known level 0 (new) to 3 (known). */
  k: number;
}

export interface AnnotateResult {
  ok: boolean;
  results: AnnotateToken[][];
  error?: string;
}

interface Waiter {
  resolve: (r: AnnotateResult) => void;
  timer: ReturnType<typeof setTimeout>;
  texts: string[];
}

const waiters = new Map<string, Waiter>();

/** Clamp the request: at most 64 texts, 2000 chars each, 40k in all. */
export function clampAnnotateTexts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  let total = 0;
  for (const item of raw.slice(0, ANNOTATE_MAX_TEXTS)) {
    const text = String(item ?? '').slice(0, ANNOTATE_MAX_TEXT_CHARS);
    if (total + text.length > ANNOTATE_MAX_TOTAL_CHARS) break;
    total += text.length;
    out.push(text);
  }
  return out;
}

function sanitizeTokens(raw: unknown, text: string): AnnotateToken[] {
  if (!Array.isArray(raw)) return [];
  const out: AnnotateToken[] = [];
  for (const t of raw.slice(0, 1000)) {
    if (!t || typeof t !== 'object') continue;
    const r = t as Record<string, unknown>;
    const o = Number(r.o);
    const n = Number(r.n);
    if (!Number.isInteger(o) || !Number.isInteger(n) || o < 0 || n <= 0 || o + n > text.length) continue;
    const lemma = typeof r.l === 'string' && r.l ? r.l.slice(0, 64) : text.slice(o, o + n);
    const k = Number(r.k);
    const tok: AnnotateToken = { o, n, l: lemma, k: Number.isFinite(k) ? Math.max(0, Math.min(3, Math.round(k))) : 0 };
    if (typeof r.r === 'string' && r.r && r.r.length <= 64) tok.r = r.r;
    out.push(tok);
  }
  return out;
}

/** Ask the host renderer to tokenize `texts` and level each word. */
export function requestAnnotate(texts: string[], lang: string, opts: { timeoutMs?: number } = {}): Promise<AnnotateResult> {
  if (!texts.length) return Promise.resolve({ ok: true, results: [] });
  const host = bridgeHostWindow();
  if (!host) return Promise.resolve({ ok: false, results: [], error: 'app_window_closed' });
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiters.delete(id);
      resolve({ ok: false, results: [], error: 'timeout' });
    }, opts.timeoutMs ?? ANNOTATE_TIMEOUT_MS);
    waiters.set(id, { resolve, timer, texts });
    try {
      host.webContents.send('extension:annotate-request', { id, texts, lang });
    } catch {
      clearTimeout(timer);
      waiters.delete(id);
      resolve({ ok: false, results: [], error: 'app_window_closed' });
    }
  });
}

/**
 * A short, stable version for a known-word map: FNV-1a over the sorted
 * entries. The extension sends it back as `?since=`; an unchanged map is
 * answered without the words.
 */
export function knownSnapshotVersion(words: Record<string, number>): string {
  let h = 0x811c9dc5;
  const keys = Object.keys(words).sort();
  for (const key of keys) {
    const s = `${key}\u0000${words[key]}\u0001`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return `${keys.length.toString(36)}-${h.toString(36)}`;
}

let ipcRegistered = false;

export function registerExtensionAnnotateIpc(): void {
  if (ipcRegistered) return;
  ipcRegistered = true;
  ipcMain.on('extension:annotate-reply', (_e, payload: { id?: unknown; results?: unknown }) => {
    const id = typeof payload?.id === 'string' ? payload.id : '';
    const waiter = id ? waiters.get(id) : undefined;
    if (!waiter) return;
    clearTimeout(waiter.timer);
    waiters.delete(id);
    const raw = Array.isArray(payload.results) ? payload.results : null;
    if (!raw) {
      waiter.resolve({ ok: false, results: [], error: 'bad annotate reply' });
      return;
    }
    waiter.resolve({ ok: true, results: waiter.texts.map((text, i) => sanitizeTokens(raw[i], text)) });
  });
}

/** Test hook. */
export function __resetExtensionAnnotateForTests(): void {
  for (const w of waiters.values()) clearTimeout(w.timer);
  waiters.clear();
  ipcRegistered = false;
}
