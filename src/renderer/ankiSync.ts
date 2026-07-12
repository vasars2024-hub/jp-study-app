// Infer word knowledge from the user's Anki collection (Kalba-style). Card
// intervals become knowledge levels; words the user graded by hand are left
// untouched (handled inside knownWords.bulkSetFromAnki).
import type { IntervalSnapshot } from '../shared/anki';
import { levelForIntervalDays } from '../shared/anki';
import { bulkSetFromAnki, type WkLevel } from './knownWords';
import { getActiveProfile } from './profileState';
import { getTokenizer, tokenizeSync, tokenizerReady } from './tokenizer';

export interface SyncResult {
  ok: boolean;
  error?: string;
  changed?: number;
  scanned?: number;
}

/** Lemma + threshold fold shared by the manual sync and the live push listener. */
async function foldSnapshot(
  snapshot: IntervalSnapshot,
): Promise<{ levels: Record<string, WkLevel>; scanned: number }> {
  const thresholds = getActiveProfile().deckParams.thresholds;

  // Reduce each expression to its lemma so it lines up with reader highlights.
  let ready = tokenizerReady();
  if (!ready) {
    try {
      await getTokenizer();
      ready = true;
    } catch {
      ready = false;
    }
  }

  const levels: Record<string, WkLevel> = {};
  for (const entry of snapshot.entries) {
    const level = levelForIntervalDays(entry.ivlDays, thresholds);
    let key = entry.expression;
    if (ready) {
      const toks = tokenizeSync(entry.expression);
      const content = toks.find((t) => t.content) ?? toks[0];
      if (content?.lemma) key = content.lemma;
    }
    // Keep the highest level if two expressions map to the same lemma.
    if (!levels[key] || level > levels[key]) levels[key] = level;
  }
  return { levels, scanned: snapshot.entries.length };
}

// Reader tints stay live with zero user interaction: every pushed snapshot
// (heartbeat reconnect, periodic 5 min poll, query-union change) folds
// straight into the knowledge store (SERVICES_PATCH.md AC-3).
window.api.onAnkiIntervalsChanged((snapshot) => {
  void foldSnapshot(snapshot).then(({ levels }) => bulkSetFromAnki(levels));
});

export async function syncKnowledgeFromAnki(): Promise<SyncResult> {
  let snapshot: IntervalSnapshot;
  try {
    snapshot = await window.api.ankiGetIntervals({ maxAgeMs: 0 });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const { levels, scanned } = await foldSnapshot(snapshot);
  const changed = bulkSetFromAnki(levels);
  return { ok: true, changed, scanned };
}
