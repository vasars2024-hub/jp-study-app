/**
 * What the Anki review sync remembers between runs and windows: its status
 * (last sync, last error, the Anki profile it is bound to), the opt-in for
 * sending Gum answers to Anki, and the mirror of Anki's schedule for linked
 * cards. The engine is `ankiReviewSync.ts`; the sync panel reads only this
 * module, so opening the panel does not load the engine.
 *
 * IndexedDB, through `kvUpdate`: two windows (Study OS and Blanc) may write at
 * once, and a read-modify-write in one transaction cannot lose either.
 */

import { writeLocalStorage } from './localStorageWrite';
import { kvGet, kvUpdate } from './storage/db';
import type {
  AnkiReviewPushOutcome,
  AnkiScheduleMirror,
  AnkiSyncErrorKind,
} from '../shared/ankiReviewSync';

/** Opt-in: replay Gum answers into Anki (only while Gum owns scheduling). Off by default. */
export const ANKI_PUSH_REVIEWS_KEY = 'jp-anki-push-reviews';
export const ANKI_SYNC_STATE_IDB_KEY = 'anki-sync-state-v1';
export const ANKI_SCHEDULE_MIRROR_IDB_KEY = 'anki-schedule-mirror-v1';
export const ANKI_SYNC_STATE_EVENT = 'jp-anki-sync-state-changed';

/** Unlinked cards the panel lists (rule 6), newest first. */
const UNLINKED_KEEP = 50;

export function ankiPushReviewsEnabled(): boolean {
  try {
    return localStorage.getItem(ANKI_PUSH_REVIEWS_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAnkiPushReviewsEnabled(on: boolean): void {
  writeLocalStorage(ANKI_PUSH_REVIEWS_KEY, on ? '1' : '0');
  emitAnkiSyncStateChanged();
}

export interface AnkiSyncUnlinkedCard {
  cardId: string;
  word: string;
  at: number;
}

export interface AnkiSyncRunSummary {
  answered: number;
  skipped: Partial<Record<AnkiReviewPushOutcome, number>>;
  linked: number;
  pulled: number;
  unlinked: number;
}

export interface AnkiSyncSnapshot {
  lastSyncAt?: number;
  lastPushAt?: number;
  lastPullAt?: number;
  lastLinkAt?: number;
  lastError?: { kind: AnkiSyncErrorKind; detail?: string; at: number };
  /** The Anki profile whose note ids the Gum links refer to (rule 7). */
  boundProfile?: string;
  /** The profile Anki reported last. */
  seenProfile?: string;
  /** Answers sent since sync was first used. */
  answeredTotal: number;
  lastRun?: AnkiSyncRunSummary;
  /** Cards whose Anki note was deleted and which went back to Gum's schedule. */
  unlinked: AnkiSyncUnlinkedCard[];
  /** Answers waiting in the queue, as of the last queue change. */
  outboxCount: number;
  /** Rotation cursor through the linked cards a pull reads. */
  pullCursor: number;
}

export function emptyAnkiSyncSnapshot(): AnkiSyncSnapshot {
  return { answeredTotal: 0, unlinked: [], outboxCount: 0, pullCursor: 0 };
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Whatever is stored, as a well-formed snapshot (unknown fields dropped, bad ones defaulted). */
export function normalizeAnkiSyncSnapshot(raw: unknown): AnkiSyncSnapshot {
  const out = emptyAnkiSyncSnapshot();
  if (!raw || typeof raw !== 'object') return out;
  const value = raw as Partial<AnkiSyncSnapshot>;
  for (const key of ['lastSyncAt', 'lastPushAt', 'lastPullAt', 'lastLinkAt'] as const) {
    const at = finite(value[key]);
    if (at !== undefined) out[key] = at;
  }
  if (value.lastError && typeof value.lastError === 'object' && typeof value.lastError.kind === 'string') {
    out.lastError = {
      kind: value.lastError.kind,
      at: finite(value.lastError.at) ?? 0,
      ...(typeof value.lastError.detail === 'string' ? { detail: value.lastError.detail.slice(0, 300) } : {}),
    };
  }
  if (typeof value.boundProfile === 'string') out.boundProfile = value.boundProfile;
  if (typeof value.seenProfile === 'string') out.seenProfile = value.seenProfile;
  out.answeredTotal = Math.max(0, Math.floor(finite(value.answeredTotal) ?? 0));
  if (value.lastRun && typeof value.lastRun === 'object') out.lastRun = value.lastRun;
  if (Array.isArray(value.unlinked)) {
    out.unlinked = value.unlinked
      .filter((row): row is AnkiSyncUnlinkedCard => Boolean(row) && typeof row.cardId === 'string')
      .slice(0, UNLINKED_KEEP);
  }
  out.outboxCount = Math.max(0, Math.floor(finite(value.outboxCount) ?? 0));
  out.pullCursor = Math.max(0, Math.floor(finite(value.pullCursor) ?? 0));
  return out;
}

let cached: AnkiSyncSnapshot | null = null;

export function emitAnkiSyncStateChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(ANKI_SYNC_STATE_EVENT));
  } catch {
    /* no window */
  }
}

export function onAnkiSyncStateChanged(cb: () => void): () => void {
  window.addEventListener(ANKI_SYNC_STATE_EVENT, cb);
  return () => window.removeEventListener(ANKI_SYNC_STATE_EVENT, cb);
}

/** The last snapshot this window read or wrote, without waiting (null before the first read). */
export function peekAnkiSyncState(): AnkiSyncSnapshot | null {
  return cached;
}

export async function readAnkiSyncState(): Promise<AnkiSyncSnapshot> {
  try {
    cached = normalizeAnkiSyncSnapshot(await kvGet<unknown>(ANKI_SYNC_STATE_IDB_KEY));
  } catch {
    cached = cached ?? emptyAnkiSyncSnapshot();
  }
  return cached;
}

/** One atomic read-modify-write of the snapshot. */
export async function updateAnkiSyncState(
  change: (state: AnkiSyncSnapshot) => AnkiSyncSnapshot,
): Promise<AnkiSyncSnapshot> {
  let next: AnkiSyncSnapshot | null = null;
  try {
    await kvUpdate(ANKI_SYNC_STATE_IDB_KEY, (current) => {
      next = change(normalizeAnkiSyncSnapshot(current));
      return next;
    });
  } catch (error) {
    console.error('[anki-sync] state write failed:', error);
    next = change(cached ?? emptyAnkiSyncSnapshot());
  }
  cached = next ?? cached ?? emptyAnkiSyncSnapshot();
  emitAnkiSyncStateChanged();
  return cached;
}

/** Record cards that were unlinked because their note is gone from Anki. */
export function withUnlinkedCards(state: AnkiSyncSnapshot, cards: readonly AnkiSyncUnlinkedCard[]): AnkiSyncSnapshot {
  if (!cards.length) return state;
  const seen = new Set(cards.map((card) => card.cardId));
  return {
    ...state,
    unlinked: [...cards, ...state.unlinked.filter((card) => !seen.has(card.cardId))].slice(0, UNLINKED_KEEP),
  };
}

// ----- Schedule mirror -----------------------------------------------------------

export type AnkiScheduleMirrorMap = Record<string, AnkiScheduleMirror>;

function normalizeMirror(raw: unknown): AnkiScheduleMirrorMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: AnkiScheduleMirrorMap = {};
  for (const [cardId, value] of Object.entries(raw as Record<string, unknown>)) {
    const mirror = value as Partial<AnkiScheduleMirror> | null;
    if (mirror && typeof mirror.cardId === 'number' && typeof mirror.state === 'string') out[cardId] = mirror as AnkiScheduleMirror;
  }
  return out;
}

/** Anki's schedule for linked Gum cards, keyed by Gum card id. Display only (rule 1). */
export async function readAnkiScheduleMirror(): Promise<AnkiScheduleMirrorMap> {
  try {
    return normalizeMirror(await kvGet<unknown>(ANKI_SCHEDULE_MIRROR_IDB_KEY));
  } catch {
    return {};
  }
}

export async function updateAnkiScheduleMirror(
  change: (mirror: AnkiScheduleMirrorMap) => AnkiScheduleMirrorMap,
): Promise<AnkiScheduleMirrorMap> {
  let next: AnkiScheduleMirrorMap = {};
  try {
    await kvUpdate(ANKI_SCHEDULE_MIRROR_IDB_KEY, (current) => {
      next = change(normalizeMirror(current));
      return next;
    });
  } catch (error) {
    console.error('[anki-sync] mirror write failed:', error);
  }
  emitAnkiSyncStateChanged();
  return next;
}
