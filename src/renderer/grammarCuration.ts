/**
 * Human review queue for the grammar corpus.
 *
 * Phase 1.5 originally specified this as a duplicate merger — side-by-side
 * compare, merge/split. That backlog is now zero: `grammarTitleKey` collapses
 * every remaining notation variant, and the surviving level disagreements are a
 * systematic source offset that is deliberately preserved on `alternateLevels`
 * rather than resolved. So there is nothing left to merge.
 *
 * What does need a human is the other end: **nothing in this corpus is
 * `verified`**. 706 records carry example sentences imported from Tatoeba and
 * matched by machine (bounded regex + morpheme-boundary agreement). That is
 * good enough to study from — it is not the same as someone having looked.
 * This module is what turns "a machine matched it" into "a person checked it",
 * and it is equally able to record the opposite verdict.
 *
 * Design rules carried over from the rest of the corpus work:
 *
 *  - **A verdict is data about a record, never an edit to it.** The generated
 *    `tatoebaExamples.ts` stays untouched and regenerable; decisions live in
 *    user storage and are applied over the top. Re-running the import cannot
 *    silently discard someone's review.
 *  - **Rejection removes the examples rather than downgrading a flag**, so the
 *    record falls back to `missing` through the same `verificationFor` path
 *    everything else uses. There is no second notion of study-readiness.
 *  - **Undo is real.** Bulk approval over hundreds of records is only safe if
 *    it is reversible.
 */

import type { NormalizedGrammarPoint } from './data/grammar/normalize';
import { IDB_KEYS, mirrorToIdb } from './storage/storage';

export type CurationVerdict = 'approved' | 'rejected';

export interface CurationEntry {
  /** Verdict on this record's *imported* examples. Authored ones are never judged. */
  examples: CurationVerdict;
  reviewedAt: number;
}

export type CurationState = Readonly<Record<string, CurationEntry>>;

export const CURATION_LS_KEY = 'jp-grammarx-curation-v1';
/** How many prior states undo can walk back through. */
export const MAX_HISTORY = 50;

/** Buckets the queue can be filtered by. Order is the order shown. */
export const ISSUE_TYPES = [
  'imported-unreviewed',
  'no-examples',
  'no-category',
  'reviewed',
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export function hasImportedExamples(p: NormalizedGrammarPoint): boolean {
  return p.examples.some((e) => e.source === 'tatoeba');
}

/**
 * Which queue a record belongs in.
 *
 * `reviewed` wins over everything else: once a person has ruled on a record it
 * should stop reappearing in the work queue, even if it still lacks categories.
 */
export function issueFor(p: NormalizedGrammarPoint, state: CurationState): IssueType | null {
  if (state[p.id]) return 'reviewed';
  if (hasImportedExamples(p)) return 'imported-unreviewed';
  if (!p.examples.length) return 'no-examples';
  if (!p.categories.length) return 'no-category';
  return null;
}

export function curationQueue(
  points: readonly NormalizedGrammarPoint[],
  state: CurationState,
  issue: IssueType,
): NormalizedGrammarPoint[] {
  return points.filter((p) => issueFor(p, state) === issue);
}

export function issueCounts(
  points: readonly NormalizedGrammarPoint[],
  state: CurationState,
): Record<IssueType, number> {
  const out = { 'imported-unreviewed': 0, 'no-examples': 0, 'no-category': 0, reviewed: 0 };
  for (const p of points) {
    const i = issueFor(p, state);
    if (i) out[i] += 1;
  }
  return out;
}

/**
 * Fold recorded verdicts into the corpus.
 *
 * Approving marks the record `verified` — the first thing in this corpus that
 * legitimately carries that value. Rejecting strips the imported sentences,
 * which drops the record back to `missing` by the ordinary rule rather than by
 * a special case.
 */
export function applyCuration(
  points: readonly NormalizedGrammarPoint[],
  state: CurationState,
): NormalizedGrammarPoint[] {
  if (!Object.keys(state).length) return points as NormalizedGrammarPoint[];
  return points.map((p) => {
    const entry = state[p.id];
    if (!entry) return p;

    if (entry.examples === 'approved') {
      if (!hasImportedExamples(p)) return p;
      return { ...p, provenance: { ...p.provenance, verification: 'verified' } };
    }

    const kept = p.examples.filter((e) => e.source !== 'tatoeba');
    if (kept.length === p.examples.length) return p;
    return {
      ...p,
      examples: kept,
      provenance: {
        ...p.provenance,
        verification: kept.length ? p.provenance.verification : 'missing',
      },
    };
  });
}

export function setVerdict(
  state: CurationState,
  ids: readonly string[],
  verdict: CurationVerdict,
  now: number = Date.now(),
): CurationState {
  const next: Record<string, CurationEntry> = { ...state };
  for (const id of ids) next[id] = { examples: verdict, reviewedAt: now };
  return next;
}

export function clearVerdict(state: CurationState, ids: readonly string[]): CurationState {
  const next: Record<string, CurationEntry> = { ...state };
  for (const id of ids) delete next[id];
  return next;
}

/** Undo stack. Kept in memory: a review session is the unit of undo, not a lifetime. */
export function pushHistory(
  history: readonly CurationState[],
  previous: CurationState,
): CurationState[] {
  return [...history, previous].slice(-MAX_HISTORY);
}

export function popHistory(
  history: readonly CurationState[],
): { state: CurationState | null; history: CurationState[] } {
  if (!history.length) return { state: null, history: [] };
  const next = history.slice(0, -1);
  return { state: history[history.length - 1], history: next };
}

// ---- persistence -----------------------------------------------------------

export function parseCurationState(raw: string | null): CurationState {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, CurationEntry> = {};
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue;
      const e = v as Partial<CurationEntry>;
      if (e.examples !== 'approved' && e.examples !== 'rejected') continue;
      out[id] = { examples: e.examples, reviewedAt: Number(e.reviewedAt) || 0 };
    }
    return out;
  } catch {
    return {};
  }
}

export function loadCuration(): CurationState {
  try {
    return parseCurationState(localStorage.getItem(CURATION_LS_KEY));
  } catch {
    return {};
  }
}

export function saveCuration(state: CurationState): void {
  try {
    localStorage.setItem(CURATION_LS_KEY, JSON.stringify(state));
    mirrorToIdb(IDB_KEYS.grammarCuration, state);
  } catch {
    /* storage full or unavailable — the in-memory state still stands */
  }
  // Announced even when the write failed: the in-memory state still changed,
  // and a consumer showing the pre-verdict corpus would be wrong either way.
  emitCurationChanged();
}

// ---- change notification ---------------------------------------------------
//
// Mirrors `grammarFamiliarity.ts`'s notifier deliberately. Both are learner
// state applied over the generated corpus, both are read by Practice and the
// Explorer, and both must reach those screens without a reload.
//
// This did not exist until 2026-08-04, and neither did the consumers. Verdicts
// persisted correctly, `applyCuration` computed the right thing, undo and the
// tests were all in place — and none of it reached the app, because the only
// production call site was the panel that wrote the data (audit F20). Rejecting
// all 706 imported-example records moved Practice's ready set by exactly zero.

const CURATION_EVENT = 'grammar-curation-changed';

function emitCurationChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(CURATION_EVENT));
  } catch {
    /* no window (e.g. a non-DOM test) — nothing to notify */
  }
}

/** Subscribe to curation changes, including from other windows. Returns unsubscribe. */
export function onCurationChanged(cb: () => void): () => void {
  const handler = (): void => cb();
  const storageHandler = (e: Event): void => {
    if ((e as StorageEvent).key === CURATION_LS_KEY) cb();
  };
  window.addEventListener(CURATION_EVENT, handler);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(CURATION_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}
