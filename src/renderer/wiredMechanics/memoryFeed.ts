/**
 * "The Wired remembers" — what the desktop knows about the operator's recent
 * activity: the last dictionary query, the last captured (mined) word, how many
 * cards are due and which kanji they carry.
 *
 * One shared snapshot for every consumer (wallpaper, boot console), recomputed
 * only when something that changes it is announced — a lookup, a deck change, a
 * review — debounced, plus one slow refresh so cards that come due on their own
 * are noticed. Listeners exist only while something is subscribed.
 */
import { useSyncExternalStore } from 'react';
import { loadLookupHistory, LOOKUP_HISTORY_EVENT } from '../lookupHistory';
import { dueDeckCards, loadDeck, onDeckChanged } from '../flashcardDeck';
import { REVIEW_RECORDED_EVENT } from '../stats';

export interface WiredMemory {
  lastQuery: string | null;
  lastMined: string | null;
  dueCount: number;
  /** Distinct kanji from the due cards' words, in due order (≤ 10). */
  dueKanji: string[];
}

const HAN = /[㐀-䶿一-鿿豈-﫿々]/u;

/** Distinct Han characters from `words`, first-seen order, at most `max`. */
export function collectKanji(words: readonly string[], max = 10): string[] {
  const seen = new Set<string>();
  const outList: string[] = [];
  for (const w of words) {
    for (const ch of w ?? '') {
      if (ch === '々' || !HAN.test(ch) || seen.has(ch)) continue;
      seen.add(ch);
      outList.push(ch);
      if (outList.length >= max) return outList;
    }
  }
  return outList;
}

export function readWiredMemory(now = Date.now()): WiredMemory {
  let lastQuery: string | null = null;
  try {
    const top = loadLookupHistory()[0];
    lastQuery = top ? top.lemma || top.query : null;
  } catch {
    /* no history */
  }
  let lastMined: string | null = null;
  let dueCount = 0;
  let dueKanji: string[] = [];
  try {
    const deck = loadDeck();
    let newest = -Infinity;
    for (const card of deck) {
      if (card.addedAt > newest && card.word) {
        newest = card.addedAt;
        lastMined = card.word;
      }
    }
    const due = dueDeckCards(deck, now);
    dueCount = due.length;
    dueKanji = collectKanji(due.map((c) => c.word || ''));
  } catch {
    /* deck unavailable */
  }
  return { lastQuery, lastMined, dueCount, dueKanji };
}

const EMPTY: WiredMemory = { lastQuery: null, lastMined: null, dueCount: 0, dueKanji: [] };
let snapshotValue: WiredMemory = EMPTY;
let primed = false;
const listeners = new Set<() => void>();
let teardown: (() => void) | null = null;

function same(a: WiredMemory, b: WiredMemory): boolean {
  return (
    a.lastQuery === b.lastQuery &&
    a.lastMined === b.lastMined &&
    a.dueCount === b.dueCount &&
    a.dueKanji.join('') === b.dueKanji.join('')
  );
}

function recompute(): void {
  const next = readWiredMemory();
  if (same(next, snapshotValue)) return;
  snapshotValue = next;
  listeners.forEach((fn) => fn());
}

function start(): () => void {
  let timer: number | null = null;
  const schedule = (): void => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      recompute();
    }, 1200);
  };
  window.addEventListener(LOOKUP_HISTORY_EVENT, schedule);
  window.addEventListener(REVIEW_RECORDED_EVENT, schedule);
  const offDeck = onDeckChanged(schedule);
  // Cards come due with no event at all; ten minutes is plenty for a readout.
  const slow = window.setInterval(() => {
    if (document.visibilityState !== 'hidden') recompute();
  }, 10 * 60_000);
  return () => {
    if (timer !== null) window.clearTimeout(timer);
    window.removeEventListener(LOOKUP_HISTORY_EVENT, schedule);
    window.removeEventListener(REVIEW_RECORDED_EVENT, schedule);
    offDeck();
    window.clearInterval(slow);
  };
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  if (!teardown) {
    teardown = start();
    if (!primed) {
      primed = true;
      // Deferred so mounting the wallpaper never parses the deck in the same
      // frame as the desktop's first paint.
      window.setTimeout(recompute, 0);
    }
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size && teardown) {
      teardown();
      teardown = null;
      primed = false;
    }
  };
}

function getSnapshot(): WiredMemory {
  return snapshotValue;
}

function noopSubscribe(): () => void {
  return () => undefined;
}

function nullSnapshot(): null {
  return null;
}

/** Live memory readout; `null` while disabled (no listeners attached). */
export function useWiredMemory(enabled: boolean): WiredMemory | null {
  const value = useSyncExternalStore(enabled ? subscribe : noopSubscribe, enabled ? getSnapshot : nullSnapshot, nullSnapshot);
  return value;
}

/** One-shot read for surfaces that render once (boot console). */
export function peekWiredMemory(): WiredMemory {
  if (!primed && !listeners.size) return readWiredMemory();
  return snapshotValue;
}
