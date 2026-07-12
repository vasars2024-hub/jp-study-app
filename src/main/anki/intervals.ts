// Interval reading pipeline (SERVICES_PATCH.md 5.5): extract per-expression
// mastery intervals from Anki, chunked and sequential (500 ids per call, main
// process only — CLAUDE.md performance rule), persist an atomic snapshot to
// userData/anki-intervals.json, and diff snapshots by FNV-1a fingerprint so
// the renderer is only pushed real changes.

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { IntervalEntry, IntervalSnapshot } from '../../shared/anki';
import type { AnkiNoteInfo } from './client';
import { invoke } from './client';
import { fnv1a, resolveTermFieldName } from './fieldMapper';

const CHUNK_SIZE = 500; // notes/cards per AnkiConnect bulk call (A-4)
const ENTRY_CAP = 100000; // safety cap; snapshot.truncated = true when hit
const PERIODIC_POLL_MS = 5 * 60000; // cadence while connected

// ----- Configuration (injected by anki/index.ts; keeps this module free of
// direct ProfileStore/heartbeat imports) ---------------------------------------

export interface IntervalsConfig {
  /** Union of every profile's deckParams.syncQuery (deduped here). */
  getQueries(): string[];
  /** ProfileStore.profileEpoch — polls abort between chunks on mismatch (P-4/A-7). */
  getEpoch(): number;
  /** Heartbeat wire state === 'connected'. */
  isConnected(): boolean;
  /** A bound profile's fieldMap.term override for this model, when one exists. */
  getTermOverride(modelName: string): string | undefined;
}

let config: IntervalsConfig | null = null;

export function configureIntervals(cfg: IntervalsConfig): void {
  config = cfg;
}

// ----- State --------------------------------------------------------------------

let currentSnapshot: IntervalSnapshot | null = null;
let currentHash: string | null = null;
let lastQueriesKey: string | null = null;

interface InFlightPoll {
  epoch: number;
  ctrl: AbortController;
  promise: Promise<IntervalSnapshot>;
}
let inFlight: InFlightPoll | null = null;
let periodicTimer: NodeJS.Timeout | null = null;
let writeChain: Promise<void> = Promise.resolve();

const snapshotListeners = new Set<(snap: IntervalSnapshot) => void>();

class PollAbortedError extends Error {
  constructor() {
    super('Interval poll aborted (profile switched)');
    this.name = 'PollAbortedError';
  }
}

// ----- Public surface --------------------------------------------------------------

/** Fires only when an expression's interval actually changed (5.5 step 8). */
export function onSnapshotChanged(cb: (snap: IntervalSnapshot) => void): () => void {
  snapshotListeners.add(cb);
  return () => snapshotListeners.delete(cb);
}

export function getCachedSnapshot(): IntervalSnapshot | null {
  return currentSnapshot;
}

/**
 * Offline boot (A-5): load the persisted snapshot so the renderer can tint
 * the reader before any probe succeeds. Never throws.
 */
export async function loadPersistedSnapshot(): Promise<void> {
  try {
    const raw = await fs.promises.readFile(snapshotPath(), 'utf-8');
    const parsed = JSON.parse(raw) as IntervalSnapshot;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) return;
    currentSnapshot = {
      generatedAt: typeof parsed.generatedAt === 'number' ? parsed.generatedAt : 0,
      sourceQueries: Array.isArray(parsed.sourceQueries) ? parsed.sourceQueries : [],
      entries: parsed.entries,
      noteCount: typeof parsed.noteCount === 'number' ? parsed.noteCount : parsed.entries.length,
      truncated: parsed.truncated === true,
    };
    currentHash = hashEntries(currentSnapshot.entries);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') console.error('[anki] interval snapshot unreadable:', err);
  }
}

/**
 * Serve the cached snapshot when it is fresh enough, otherwise poll.
 * maxAgeMs undefined = any cache is acceptable; 0 = always poll. Throws on
 * poll failure — callers choose whether to fall back to the stale cache.
 */
export async function getSnapshotOrPoll(maxAgeMs?: number): Promise<IntervalSnapshot> {
  const snap = currentSnapshot;
  if (snap && (maxAgeMs === undefined || Date.now() - snap.generatedAt <= maxAgeMs)) {
    return snap;
  }
  return kickPoll();
}

/**
 * Single-flight poll: a new trigger coalesces into the running poll unless
 * the profile epoch changed, in which case the stale poll is aborted and a
 * fresh one starts (last switch wins, AC-8).
 */
export function kickPoll(): Promise<IntervalSnapshot> {
  const cfg = requireConfig();
  const epoch = cfg.getEpoch();
  if (inFlight) {
    if (inFlight.epoch === epoch) return inFlight.promise;
    inFlight.ctrl.abort();
    inFlight = null;
  }
  const ctrl = new AbortController();
  const promise = runPoll(epoch, ctrl);
  const record: InFlightPoll = { epoch, ctrl, promise };
  inFlight = record;
  promise.then(
    () => {
      if (inFlight === record) inFlight = null;
    },
    () => {
      if (inFlight === record) inFlight = null;
    },
  );
  return promise;
}

/** Heartbeat H2/H7: immediate poll, then every 5 minutes while connected. */
export function onAnkiConnected(): void {
  if (periodicTimer) clearInterval(periodicTimer);
  periodicTimer = setInterval(() => {
    kickPoll().catch(() => undefined);
  }, PERIODIC_POLL_MS);
  kickPoll().catch(() => undefined);
}

/** Heartbeat H6/H3: stop the periodic cadence until reconnect. */
export function onAnkiDisconnected(): void {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
}

/**
 * Profile switch/update hook: poll iff the deduped query union actually
 * changed (5.5 trigger table). Also restarts a poll that the epoch bump of a
 * switch aborted mid-flight, so its data is not lost until the next tick.
 */
export function onQueriesMaybeChanged(): void {
  const cfg = requireConfig();
  if (!cfg.isConnected()) return;
  const key = dedupe(cfg.getQueries()).join('\x1f');
  const unionChanged = lastQueriesKey !== null && key !== lastQueriesKey;
  const staleInFlight = inFlight !== null && inFlight.epoch !== cfg.getEpoch();
  if (unionChanged || staleInFlight) kickPoll().catch(() => undefined);
}

// ----- Poll implementation -----------------------------------------------------------

function requireConfig(): IntervalsConfig {
  if (!config) throw new Error('intervals: configureIntervals() has not been called');
  return config;
}

function snapshotPath(): string {
  return path.join(app.getPath('userData'), 'anki-intervals.json');
}

function dedupe(values: string[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (v && out.indexOf(v) === -1) out.push(v);
  }
  return out;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Data-only fingerprint (order-independent, generatedAt excluded). */
function hashEntries(entries: IntervalEntry[]): string {
  const parts = entries.map((e) => `${e.expression}\x1f${e.ivlDays}`).sort();
  return fnv1a(parts.join('\x1e'));
}

// Strip HTML + Anki furigana (`漢字[かんじ]`) from a note field to recover the
// underlying word/expression text. Byte-identical to the legacy rule.
function cleanAnkiField(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/\[[^\]]*\]/g, '') // furigana readings
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function runPoll(epoch: number, ctrl: AbortController): Promise<IntervalSnapshot> {
  const cfg = requireConfig();
  const signal = ctrl.signal;
  const checkEpoch = (): void => {
    if (cfg.getEpoch() !== epoch) {
      ctrl.abort();
      throw new PollAbortedError();
    }
  };

  const queries = dedupe(cfg.getQueries());
  lastQueriesKey = queries.join('\x1f');

  // 1-2. note id union across every profile's sync query.
  const noteIdSet = new Set<number>();
  for (const query of queries) {
    checkEpoch();
    const ids = (await invoke('findNotes', { query }, { signal })) ?? [];
    for (const id of ids) noteIdSet.add(id);
  }
  const noteIds = Array.from(noteIdSet);

  // 3. notesInfo in sequential chunks of 500.
  const notes: AnkiNoteInfo[] = [];
  for (const chunk of chunks(noteIds, CHUNK_SIZE)) {
    checkEpoch();
    const batch = (await invoke('notesInfo', { notes: chunk }, { signal })) ?? [];
    for (const n of batch) notes.push(n);
  }

  // 5. cardsInfo in sequential chunks of 500.
  const cardIdSet = new Set<number>();
  for (const n of notes) for (const c of n.cards ?? []) cardIdSet.add(c);
  const ivlByCard = new Map<number, number>();
  for (const chunk of chunks(Array.from(cardIdSet), CHUNK_SIZE)) {
    checkEpoch();
    const batch = (await invoke('cardsInfo', { cards: chunk }, { signal })) ?? [];
    for (const c of batch) {
      // Negative intervals are learning steps in seconds — clamp to 0 days.
      ivlByCard.set(c.cardId, typeof c.interval === 'number' ? Math.max(0, c.interval) : 0);
    }
  }

  // 4+6. term extraction and max-interval fold.
  const termFieldByModel = new Map<string, string | undefined>();
  const best = new Map<string, IntervalEntry>();
  let truncated = false;
  for (const n of notes) {
    if (best.size >= ENTRY_CAP) {
      truncated = true;
      break;
    }
    const fields = n.fields ?? {};
    const orderedFields = Object.keys(fields).sort((a, b) => fields[a].order - fields[b].order);
    if (!orderedFields.length) continue;

    let termField: string | undefined;
    if (termFieldByModel.has(n.modelName)) {
      termField = termFieldByModel.get(n.modelName);
    } else {
      termField = resolveTermFieldName(n.modelName, orderedFields, cfg.getTermOverride(n.modelName));
      termFieldByModel.set(n.modelName, termField);
    }
    if (!termField || !fields[termField]) continue;

    const expression = cleanAnkiField(fields[termField].value ?? '');
    // Skip empty or sentence-length fields (word-based decks only) — today's rule.
    if (!expression || expression.length > 24 || /\s/.test(expression)) continue;

    let maxIvl = 0;
    for (const c of n.cards ?? []) maxIvl = Math.max(maxIvl, ivlByCard.get(c) ?? 0);
    const prev = best.get(expression);
    if (!prev || maxIvl > prev.ivlDays) {
      best.set(expression, {
        expression,
        ivlDays: maxIvl,
        noteId: n.noteId,
        modelName: n.modelName,
      });
    }
  }
  checkEpoch(); // discard everything if a switch landed during the fold

  const snapshot: IntervalSnapshot = {
    generatedAt: Date.now(),
    sourceQueries: queries,
    entries: Array.from(best.values()),
    noteCount: notes.length,
    truncated,
  };

  // 7-8. persist atomically, diff by fingerprint, push only real changes.
  const hash = hashEntries(snapshot.entries);
  const changed = hash !== currentHash;
  currentSnapshot = snapshot;
  currentHash = hash;
  persistSnapshot(snapshot);
  if (changed) {
    for (const cb of Array.from(snapshotListeners)) {
      try {
        cb(snapshot);
      } catch (err) {
        console.error('[anki] interval snapshot listener threw:', err);
      }
    }
  }
  return snapshot;
}

/** Atomic write (tmp + rename), serialized so writes never interleave (P-1 style). */
function persistSnapshot(snapshot: IntervalSnapshot): void {
  const file = snapshotPath();
  const tmp = `${file}.tmp`;
  writeChain = writeChain
    .then(async () => {
      await fs.promises.writeFile(tmp, JSON.stringify(snapshot), 'utf-8');
      await fs.promises.rename(tmp, file);
    })
    .catch((err) => {
      console.error('[anki] interval snapshot persist failed:', err);
    });
}
