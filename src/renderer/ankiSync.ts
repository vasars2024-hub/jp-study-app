// Infer word knowledge from the user's Anki collection (Kalba-style). Card
// intervals become knowledge levels; words the user graded by hand are left
// untouched (handled inside knownWords.bulkSetFromAnki).
import type { AnkiLinkState, IntervalSnapshot, IntervalSyncOutcome } from '../shared/anki';
import { classifyIntervalSyncOutcome, foldIntervalEntriesByKey } from '../shared/anki';
import { knowledgeKeysFor } from '../shared/knowledgeKey';
import type { StudyLang } from '../shared/studyLang';
import { bulkSetFromAnki, getLevel, type WkLevel } from './knownWords';
import { getActiveProfile } from './profileState';
import { getStudyLang } from './studyEnvironment';
import { knowledgeKeyDeps } from './studyTokens';
import { getTokenizer } from './tokenizer';

export interface SyncResult {
  ok: boolean;
  error?: string;
  changed?: number;
  scanned?: number;
  /**
   * The counts came from the last good snapshot because the forced refresh did not
   * complete. They are real, they are just not new — the caller must say so.
   */
  stale?: boolean;
}

/**
 * Lemma + threshold fold shared by the manual sync and the live push listener.
 *
 * Each expression is keyed by the study language's own rule
 * (`shared/knowledgeKey`): kuromoji for Japanese, ICU words for Chinese and
 * Russian — the sync used to run the Japanese tokenizer whatever the language,
 * so Chinese 学习 synced as 学 and 电脑 as 电. Levels are folded per WORD KEY,
 * so a word is out of rotation only when every card behind it is suspended.
 */
async function foldSnapshot(
  snapshot: IntervalSnapshot,
  lang: StudyLang = getStudyLang(),
): Promise<{ levels: Record<string, WkLevel>; scanned: number }> {
  const thresholds = getActiveProfile().deckParams.thresholds;

  // Japanese needs kuromoji; without it the keys fall back to the spelling.
  if (lang === 'ja') {
    try {
      await getTokenizer();
    } catch {
      /* keyed by spelling below */
    }
  }
  const deps = knowledgeKeyDeps(getLevel);
  const keysByExpression = new Map<string, string[]>();
  const keysOf = (expression: string): string[] => {
    let keys = keysByExpression.get(expression);
    if (!keys) {
      keys = knowledgeKeysFor(expression, lang, deps);
      keysByExpression.set(expression, keys);
    }
    return keys;
  };
  // Unseen (interval 0) and all-suspended words are left out rather than folded
  // as 0: a 0 would erase a level the built-in SRS inferred.
  const levels = foldIntervalEntriesByKey(snapshot.entries, keysOf, thresholds);
  return { levels, scanned: snapshot.entries.length };
}

async function foldIntoKnowledge(snapshot: IntervalSnapshot): Promise<number> {
  const { levels } = await foldSnapshot(snapshot);
  return bulkSetFromAnki(levels);
}

/**
 * A manual sync forces a poll, and `commitSnapshot` pushes the result to this listener
 * BEFORE the `anki:getIntervals` reply reaches the caller. Both then fold the same data,
 * and whichever lands first takes every level change with it — which is how a sync that
 * really wrote 41,535 words announced "0 updated" (L7_REVIEW_LEARNING.md, 2026-08-27).
 * While a manual sync is in flight the push is DEFERRED rather than dropped, so a snapshot
 * newer than the one the sync folded is still applied afterwards.
 */
let manualSyncPending = false;
let deferredPush: IntervalSnapshot | null = null;

// Reader tints stay live with zero user interaction: every pushed snapshot
// (heartbeat reconnect, periodic 5 min poll, query-union change) folds
// straight into the knowledge store (SERVICES_PATCH.md AC-3).
window.api.onAnkiIntervalsChanged((snapshot) => {
  if (manualSyncPending) {
    deferredPush = snapshot;
    return;
  }
  void foldIntoKnowledge(snapshot);
});

/**
 * `anki:getIntervals` never rejects — a failed poll falls back to the cached snapshot —
 * so a manual sync has to establish for itself whether anything was refreshed. Read the
 * link state alongside the snapshot and let the shared classifier decide.
 */
async function readLinkState(): Promise<{ state: AnkiLinkState; error?: string }> {
  try {
    const status = await window.api.ankiLinkState();
    return { state: status.state, error: status.error };
  } catch {
    // The channel itself is unreachable, which is a stronger disconnection than any the
    // heartbeat can report.
    return { state: 'disconnected' };
  }
}

export async function syncKnowledgeFromAnki(): Promise<SyncResult> {
  const requestedAt = Date.now();
  manualSyncPending = true;
  // 0 until this sync actually folds something, so a deferred push always wins the
  // comparison below when the sync bailed out without folding.
  let foldedAt = 0;
  try {
    let snapshot: IntervalSnapshot;
    try {
      snapshot = await window.api.ankiGetIntervals({ maxAgeMs: 0 });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    const link = await readLinkState();
    const outcome: IntervalSyncOutcome = classifyIntervalSyncOutcome({
      requestedAt,
      generatedAt: snapshot.generatedAt,
      state: link.state,
    });
    if (outcome === 'disconnected') return { ok: false, error: link.error };

    const { levels, scanned } = await foldSnapshot(snapshot);
    const changed = bulkSetFromAnki(levels);
    foldedAt = snapshot.generatedAt;
    return { ok: true, changed, scanned, ...(outcome === 'stale' ? { stale: true } : {}) };
  } finally {
    manualSyncPending = false;
    const pending = deferredPush;
    deferredPush = null;
    // Only a snapshot newer than the one this sync folded still has anything to say.
    if (pending && pending.generatedAt > foldedAt) void foldIntoKnowledge(pending);
  }
}
