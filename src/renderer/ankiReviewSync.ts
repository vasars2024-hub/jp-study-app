/**
 * Two-way review sync — the renderer engine: the answer queue, the timers, and
 * applying what Anki said back to the deck. The rules themselves (who owns a
 * card, what is skipped and why) are `shared/ankiReviewSync.ts`; the
 * AnkiConnect calls are `main/anki/reviewSync.ts`.
 *
 * CAPTURE runs in every window that can grade a card (Study OS and Blanc): each
 * graded review of a card linked to an Anki note is queued, keyed by its
 * review-log row, and an undo takes it out again. Nothing is queued unless the
 * user turned "Send my Gum reviews to Anki" on, and nothing while Anki owns
 * scheduling.
 *
 * SYNC runs in one window at a time (a Web Lock), on Anki's link coming up, on
 * a timer while something is waiting, and on "Sync now":
 *   1. probe — AnkiConnect version and the active Anki profile (rule 7);
 *   2. link — Gum cards Anki already has are linked by note id, not re-added;
 *   3. push — queued answers, collapsed and checked (rules 2-6), via `answerCards`;
 *   4. pull — while Anki owns scheduling, Anki's state for linked cards is
 *      mirrored for display; a deleted note unlinks its card (rule 6).
 * The queue lives in IndexedDB, so answers given offline survive a restart and
 * go out the next time Anki is reachable.
 */

import {
  ANKI_SYNC_MAX_ATTEMPTS,
  ANKI_SYNC_PULL_BATCH,
  ankiEaseForRating,
  countAnkiMirrorsDue,
  isFinalAnkiPushOutcome,
  isTransientAnkiSyncError,
  needsAnkiLink,
  planAnkiReviewPush,
  type AnkiReviewOutboxItem,
  type AnkiReviewPushOutcome,
  type AnkiSyncErrorKind,
  type AnkiSyncProbeResult,
} from '../shared/ankiReviewSync';
import type { ReviewLogEntry } from '../shared/reviewLog';
import { ankiOwnsScheduling } from './ankiSchedulingOwner';
import { linkCardsToExistingAnkiNotes } from './ankiNoteLinking';
import {
  ankiPushReviewsEnabled,
  readAnkiScheduleMirror,
  readAnkiSyncState,
  updateAnkiScheduleMirror,
  updateAnkiSyncState,
  withUnlinkedCards,
  type AnkiSyncRunSummary,
  type AnkiSyncSnapshot,
  type AnkiSyncUnlinkedCard,
} from './ankiSyncState';
import { loadDeck, updateDeckCard, type DeckFlashcard } from './flashcardDeck';
import { onReviewLogEntry } from './reviewLog';
import { kvGet, kvUpdate } from './storage/db';
import { flushAnkiMineQueue, pendingAnkiCards } from './studyMining';

export const ANKI_REVIEW_OUTBOX_IDB_KEY = 'anki-review-outbox-v1';
/** How often a window checks whether anything is waiting. */
export const ANKI_REVIEW_SYNC_TICK_MS = 120_000;
/** While Anki owns scheduling, how stale the mirror may get before a pull. */
export const ANKI_REVIEW_PULL_EVERY_MS = 10 * 60_000;
/** How often a link pass may run for cards that are not waiting in the queue. */
export const ANKI_REVIEW_LINK_EVERY_MS = 30 * 60_000;
/** Push batches one run sends at most; the rest wait for the next tick. */
const PUSH_BATCHES_PER_RUN = 5;
const SYNC_LOCK = 'gum-anki-review-sync';

type Outbox = Record<string, AnkiReviewOutboxItem>;

function parseOutbox(raw: unknown): Outbox {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Outbox = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const item = value as Partial<AnkiReviewOutboxItem> | null;
    if (!item || typeof item.noteId !== 'number' || typeof item.reviewedAt !== 'number') continue;
    if (typeof item.cardId !== 'string' || ![1, 2, 3, 4].includes(Number(item.ease))) continue;
    out[id] = {
      reviewId: id,
      cardId: item.cardId,
      noteId: item.noteId,
      ease: item.ease as AnkiReviewOutboxItem['ease'],
      reviewedAt: item.reviewedAt,
      queuedAt: typeof item.queuedAt === 'number' ? item.queuedAt : item.reviewedAt,
      attempts: typeof item.attempts === 'number' ? item.attempts : 0,
    };
  }
  return out;
}

export async function readAnkiReviewOutbox(): Promise<AnkiReviewOutboxItem[]> {
  try {
    return Object.values(parseOutbox(await kvGet<unknown>(ANKI_REVIEW_OUTBOX_IDB_KEY)));
  } catch {
    return [];
  }
}

/** One atomic change to the queue; `change` returns false to leave it untouched. */
async function changeOutbox(change: (box: Outbox) => boolean): Promise<number> {
  let size = 0;
  let changed = false;
  try {
    await kvUpdate(ANKI_REVIEW_OUTBOX_IDB_KEY, (current) => {
      const box = parseOutbox(current);
      changed = change(box);
      size = Object.keys(box).length;
      return changed ? box : undefined;
    });
  } catch (error) {
    console.error('[anki-sync] queue write failed:', error);
    return size;
  }
  if (changed) await updateAnkiSyncState((s) => ({ ...s, outboxCount: size }));
  return size;
}

/**
 * The queue entry a graded review becomes, or null when it must not cross:
 * sending is off, Anki owns scheduling (rule 1), it is not a recall review on a
 * review surface, or the card has no Anki note to answer.
 */
export function ankiOutboxItemForReview(
  entry: ReviewLogEntry,
  card: Pick<DeckFlashcard, 'id' | 'ankiNoteId'> | undefined,
  now = Date.now(),
): AnkiReviewOutboxItem | null {
  if (!ankiPushReviewsEnabled() || ankiOwnsScheduling()) return null;
  if (entry.mode !== 'review' || entry.source !== undefined || !entry.cardId || !entry.rating) return null;
  const noteId = card?.ankiNoteId;
  if (typeof noteId !== 'number' || noteId <= 0) return null;
  return {
    reviewId: entry.id,
    cardId: entry.cardId,
    noteId,
    ease: ankiEaseForRating(entry.rating),
    reviewedAt: entry.at,
    queuedAt: now,
    attempts: 0,
  };
}

/** Queue graded answers of linked cards, and drop them again on undo. Mounted in every window. */
export function installAnkiReviewCapture(): () => void {
  return onReviewLogEntry({
    appended(entry) {
      if (!ankiPushReviewsEnabled() || !entry.cardId) return;
      const card = loadDeck().find((c) => c.id === entry.cardId);
      const item = ankiOutboxItemForReview(entry, card);
      if (!item) return;
      void changeOutbox((box) => {
        if (box[item.reviewId]) return false;
        box[item.reviewId] = item;
        return true;
      });
    },
    removed(entry) {
      void changeOutbox((box) => {
        if (!box[entry.id]) return false;
        delete box[entry.id];
        return true;
      });
    },
  });
}

/** Turning sending off forgets what was waiting: a later "on" must not replay old answers. */
export async function clearAnkiReviewOutbox(): Promise<void> {
  await changeOutbox((box) => {
    const ids = Object.keys(box);
    for (const id of ids) delete box[id];
    return ids.length > 0;
  });
}

// ----- One sync run -----------------------------------------------------------------

export interface AnkiSyncRunReport extends AnkiSyncRunSummary {
  ok: boolean;
  /** Another window is syncing right now. */
  busy?: boolean;
  errorKind?: AnkiSyncErrorKind;
  error?: string;
  /** Answers still queued after this run. */
  waiting: number;
}

function emptyReport(): AnkiSyncRunReport {
  return { ok: true, answered: 0, skipped: {}, linked: 0, pulled: 0, unlinked: 0, waiting: 0 };
}

function bump(skipped: AnkiSyncRunReport['skipped'], outcome: AnkiReviewPushOutcome, by = 1): void {
  if (by > 0) skipped[outcome] = (skipped[outcome] ?? 0) + by;
}

/** Rule 6: the card's note is gone from Anki; Gum takes the card back. */
function unlinkCards(ids: readonly string[], now: number): AnkiSyncUnlinkedCard[] {
  if (!ids.length) return [];
  const wanted = new Set(ids);
  const out: AnkiSyncUnlinkedCard[] = [];
  for (const card of loadDeck()) {
    if (!wanted.has(card.id) || !card.ankiNoteId) continue;
    updateDeckCard(card.id, {
      ankiNoteId: undefined,
      ankiExported: undefined,
      ankiDuplicate: undefined,
      ankiPending: undefined,
    });
    out.push({ cardId: card.id, word: card.word, at: now });
  }
  return out;
}

type LockRequest = (name: string, options: { ifAvailable: boolean }, callback: (lock: unknown) => Promise<unknown>) => Promise<unknown>;

async function withSyncLock<T>(run: () => Promise<T>, busy: () => T): Promise<T> {
  const locks = typeof navigator !== 'undefined'
    ? (navigator as unknown as { locks?: { request?: LockRequest } }).locks
    : undefined;
  if (typeof locks?.request !== 'function') return run();
  return (await locks.request.call(locks, SYNC_LOCK, { ifAvailable: true }, async (lock: unknown) => (lock ? run() : busy()))) as T;
}

async function recordFailure(report: AnkiSyncRunReport, kind: AnkiSyncErrorKind, detail: string | undefined, now: number): Promise<AnkiSyncRunReport> {
  report.ok = false;
  report.errorKind = kind;
  if (detail) report.error = detail;
  await updateAnkiSyncState((s) => ({
    ...s,
    lastError: { kind, at: now, ...(detail ? { detail } : {}) },
  }));
  return report;
}

async function pushQueued(report: AnkiSyncRunReport, state: AnkiSyncSnapshot, force: boolean, now: number): Promise<AnkiSyncErrorKind | null> {
  const push = window.api.ankiPushReviews;
  if (typeof push !== 'function') return 'unsupported';
  const missingCards: string[] = [];
  // An answer is tried once per run: a refusal is retried on the next run, not
  // five times in a row within this one.
  const attempted = new Set<string>();
  for (let round = 0; round < PUSH_BATCHES_PER_RUN; round += 1) {
    const items = (await readAnkiReviewOutbox()).filter((item) => !attempted.has(item.reviewId));
    const plan = planAnkiReviewPush(items, now, { force });
    for (const item of plan.push) attempted.add(item.reviewId);
    report.waiting = plan.waiting;
    const settled = new Map<string, AnkiReviewPushOutcome>();
    for (const id of plan.superseded) settled.set(id, 'superseded');
    for (const id of plan.stale) settled.set(id, 'stale');
    let failed: string[] = [];
    let error: AnkiSyncErrorKind | null = null;
    if (plan.push.length) {
      const result = await push({
        items: plan.push.map(({ reviewId, noteId, ease, reviewedAt }) => ({ reviewId, noteId, ease, reviewedAt })),
        ...(state.boundProfile ? { expectedProfile: state.boundProfile } : {}),
      });
      if (!result.ok) {
        error = result.errorKind ?? 'api';
        report.error = result.error;
      } else {
        for (const item of plan.push) {
          const outcome = result.outcomes[item.reviewId] ?? 'failed';
          if (isFinalAnkiPushOutcome(outcome)) settled.set(item.reviewId, outcome);
          else failed.push(item.reviewId);
          if (outcome === 'note-missing') missingCards.push(item.cardId);
        }
      }
    }
    // A data problem (not "Anki is away") counts against each answer, so one bad
    // answer cannot hold the queue forever.
    if (error && !isTransientAnkiSyncError(error)) failed = plan.push.map((item) => item.reviewId);
    if (settled.size || failed.length) {
      const dropped: string[] = [];
      await changeOutbox((box) => {
        for (const id of settled.keys()) delete box[id];
        for (const id of failed) {
          const item = box[id];
          if (!item) continue;
          item.attempts += 1;
          if (item.attempts >= ANKI_SYNC_MAX_ATTEMPTS) {
            delete box[id];
            dropped.push(id);
          }
        }
        return true;
      });
      for (const outcome of settled.values()) {
        if (outcome === 'answered') report.answered += 1;
        else bump(report.skipped, outcome);
      }
      bump(report.skipped, 'failed', dropped.length);
    }
    if (error) {
      report.waiting = (await readAnkiReviewOutbox()).length;
      return error;
    }
    if (!plan.push.length) break;
  }
  report.waiting = (await readAnkiReviewOutbox()).length;
  const unlinked = unlinkCards(missingCards, now);
  report.unlinked += unlinked.length;
  await updateAnkiSyncState((s) => withUnlinkedCards({
    ...s,
    lastPushAt: now,
    answeredTotal: s.answeredTotal + report.answered,
    outboxCount: report.waiting,
  }, unlinked));
  return null;
}

async function pullMirror(report: AnkiSyncRunReport, state: AnkiSyncSnapshot, now: number): Promise<AnkiSyncErrorKind | null> {
  const pull = window.api.ankiPullSchedule;
  if (typeof pull !== 'function') return 'unsupported';
  const linked = loadDeck().filter((card) => typeof card.ankiNoteId === 'number' && card.ankiNoteId > 0);
  const cardsByNote = new Map<number, string[]>();
  for (const card of linked) {
    const list = cardsByNote.get(card.ankiNoteId as number) ?? [];
    list.push(card.id);
    cardsByNote.set(card.ankiNoteId as number, list);
  }
  const allNotes = [...cardsByNote.keys()].sort((a, b) => a - b);
  // A rotating window, so a very large linked deck is covered over several pulls.
  const start = allNotes.length > ANKI_SYNC_PULL_BATCH ? state.pullCursor % allNotes.length : 0;
  const noteIds = [...allNotes.slice(start), ...allNotes.slice(0, start)].slice(0, ANKI_SYNC_PULL_BATCH);
  const linkedIds = new Set(linked.map((card) => card.id));
  if (!noteIds.length) {
    await updateAnkiScheduleMirror(() => ({}));
    await updateAnkiSyncState((s) => ({ ...s, lastPullAt: now }));
    return null;
  }
  const result = await pull({ noteIds, ...(state.boundProfile ? { expectedProfile: state.boundProfile } : {}) });
  if (!result.ok) {
    report.error = result.error;
    return result.errorKind ?? 'api';
  }
  const missingCards: string[] = [];
  await updateAnkiScheduleMirror((mirror) => {
    const next: typeof mirror = {};
    // Keep entries of cards still linked that this window did not read.
    for (const [cardId, entry] of Object.entries(mirror)) if (linkedIds.has(cardId)) next[cardId] = entry;
    for (const entry of result.entries) {
      const cardIds = cardsByNote.get(entry.noteId) ?? [];
      for (const cardId of cardIds) {
        if (entry.mirror) next[cardId] = entry.mirror;
        else {
          delete next[cardId];
          missingCards.push(cardId);
        }
      }
    }
    return next;
  });
  report.pulled = result.entries.filter((entry) => entry.mirror).length;
  const unlinked = unlinkCards(missingCards, now);
  report.unlinked += unlinked.length;
  await updateAnkiSyncState((s) => withUnlinkedCards({
    ...s,
    lastPullAt: now,
    pullCursor: allNotes.length > ANKI_SYNC_PULL_BATCH ? (start + noteIds.length) % allNotes.length : 0,
  }, unlinked));
  return null;
}

async function runSync(options: { force?: boolean; manual?: boolean }): Promise<AnkiSyncRunReport> {
  const report = emptyReport();
  const now = Date.now();
  const api = typeof window !== 'undefined' ? window.api : undefined;
  if (typeof api?.ankiSyncProbe !== 'function') return recordFailure(report, 'unsupported', undefined, now);
  let probe: AnkiSyncProbeResult;
  try {
    probe = await api.ankiSyncProbe();
  } catch (error) {
    return recordFailure(report, 'api', error instanceof Error ? error.message : String(error), now);
  }
  if (!probe.ok) return recordFailure(report, probe.errorKind ?? 'api', probe.error, now);
  let state = await readAnkiSyncState();
  if (probe.profile && !state.boundProfile) {
    state = await updateAnkiSyncState((s) => ({ ...s, boundProfile: probe.profile, seenProfile: probe.profile }));
  } else if (probe.profile !== state.seenProfile) {
    state = await updateAnkiSyncState((s) => ({ ...s, ...(probe.profile ? { seenProfile: probe.profile } : {}) }));
  }
  if (probe.profile && state.boundProfile && probe.profile !== state.boundProfile) {
    return recordFailure(report, 'profile-mismatch', `${state.boundProfile} -> ${probe.profile}`, now);
  }

  return withSyncLock(async () => {
    // 2. Link cards Anki already has (created on another machine).
    const links = await linkCardsToExistingAnkiNotes(loadDeck(), now);
    report.linked = links.linkedIds.length;
    if (links.errorKind && links.errorKind !== 'unsupported') {
      return recordFailure(report, links.errorKind, links.error, now);
    }
    // A manual sync also sends the cards waiting to be added; the queue links first.
    if (options.manual && pendingAnkiCards().length) {
      const drained = await flushAnkiMineQueue();
      report.linked += drained.linked ?? 0;
    }

    // 3. Push answers (Gum owns scheduling).
    if (ankiOwnsScheduling() || !ankiPushReviewsEnabled()) {
      // Rule 1: nothing crosses while Anki is the scheduler or sending is off.
      const waiting = await readAnkiReviewOutbox();
      if (waiting.length) {
        await clearAnkiReviewOutbox();
        bump(report.skipped, 'superseded', waiting.length);
      }
    } else {
      const pushError = await pushQueued(report, state, Boolean(options.force), now);
      if (pushError) return recordFailure(report, pushError, report.error, now);
    }

    // 4. Pull Anki's state for display (Anki owns scheduling).
    if (ankiOwnsScheduling()) {
      const pullError = await pullMirror(report, state, now);
      if (pullError) return recordFailure(report, pullError, report.error, now);
    }

    await updateAnkiSyncState((s) => ({
      ...withoutError(s),
      lastSyncAt: now,
      lastRun: {
        answered: report.answered,
        skipped: report.skipped,
        linked: report.linked,
        pulled: report.pulled,
        unlinked: report.unlinked,
      },
    }));
    return report;
  }, () => ({ ...report, busy: true }));
}

let running: Promise<AnkiSyncRunReport> | null = null;

/**
 * Run one sync now. Concurrent calls share the run in flight. `force` skips the
 * undo grace (the user pressed "Sync now"); `manual` also drains the mining queue.
 */
export function syncAnkiNow(options: { force?: boolean; manual?: boolean } = {}): Promise<AnkiSyncRunReport> {
  if (running) return running;
  running = runSync(options)
    .catch(async (error: unknown) => recordFailure(emptyReport(), 'api', error instanceof Error ? error.message : String(error), Date.now()))
    .finally(() => {
      running = null;
    });
  return running;
}

/**
 * Bind sync to the Anki profile that is open now (after a deliberate profile
 * switch). The mirror described the old collection, so it is dropped.
 */
export async function rebindAnkiSyncProfile(): Promise<AnkiSyncSnapshot> {
  const probe = typeof window.api?.ankiSyncProbe === 'function' ? await window.api.ankiSyncProbe() : null;
  if (!probe?.ok || !probe.profile) return readAnkiSyncState();
  await updateAnkiScheduleMirror(() => ({}));
  return updateAnkiSyncState((s) => ({
    ...withoutError(s),
    boundProfile: probe.profile,
    seenProfile: probe.profile,
    pullCursor: 0,
  }));
}

function withoutError(state: AnkiSyncSnapshot): AnkiSyncSnapshot {
  const next = { ...state };
  delete next.lastError;
  return next;
}

/** Whether a background tick has anything to do. */
export async function ankiSyncHasWork(now = Date.now()): Promise<boolean> {
  // A paused (profile-mismatch) sync is retried like any other: the run probes
  // first, so switching Anki back to the bound profile resumes it by itself.
  const state = await readAnkiSyncState();
  if (ankiPushReviewsEnabled() && !ankiOwnsScheduling() && (await readAnkiReviewOutbox()).length) return true;
  if (ankiOwnsScheduling() && now - (state.lastPullAt ?? 0) >= ANKI_REVIEW_PULL_EVERY_MS) {
    return loadDeck().some((card) => typeof card.ankiNoteId === 'number' && card.ankiNoteId > 0);
  }
  if (now - (state.lastLinkAt ?? 0) >= ANKI_REVIEW_LINK_EVERY_MS) return loadDeck().some(needsAnkiLink);
  return false;
}

/** Mirror counts for the panel: how many linked cards Anki has due and suspended. */
export async function ankiMirrorCounts(): Promise<ReturnType<typeof countAnkiMirrorsDue>> {
  return countAnkiMirrorsDue(Object.values(await readAnkiScheduleMirror()));
}

/**
 * Background sync for this window: on Anki's link coming up and on a timer
 * while there is work. Mounted once, by whichever window runs background jobs.
 */
export function installAnkiReviewSync(): () => void {
  const offs: Array<() => void> = [];
  const tick = async (): Promise<void> => {
    try {
      const link = await window.api?.ankiLinkState?.();
      if (link?.state !== 'connected') return;
      if (await ankiSyncHasWork()) await syncAnkiNow();
    } catch {
      /* the next tick tries again */
    }
  };
  if (typeof window.api?.onAnkiLinkChanged === 'function') {
    offs.push(window.api.onAnkiLinkChanged((status) => {
      if (status.state === 'connected') void tick();
    }));
  }
  const first = window.setTimeout(() => void tick(), 15_000);
  const timer = window.setInterval(() => void tick(), ANKI_REVIEW_SYNC_TICK_MS);
  offs.push(() => window.clearTimeout(first), () => window.clearInterval(timer));
  return () => offs.forEach((off) => off());
}
