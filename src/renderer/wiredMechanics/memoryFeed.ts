/**
 * "The Wired remembers" — what the desktop knows about the operator's recent
 * activity: the last dictionary query, the last captured (mined) word, the last
 * line mined from a video, how many cards are due and which kanji they carry.
 *
 * One shared snapshot for every consumer (wallpaper, boot console), recomputed
 * only when something that changes it is announced — a lookup, a deck change, a
 * review — debounced, plus one slow refresh so cards that come due on their own
 * are noticed. Listeners exist only while something is subscribed.
 */
import { useSyncExternalStore } from 'react';
import { loadLookupHistory, LOOKUP_HISTORY_EVENT } from '../lookupHistory';
import { dueDeckCards, loadDeck, onDeckChanged, type DeckFlashcard } from '../flashcardDeck';
import { MEDIA_STUDY_RECORDED_EVENT, REVIEW_RECORDED_EVENT } from '../stats';
import {
  normalizeVideoCoreMiningHistory,
  VIDEO_CORE_MINING_HISTORY_KEY,
  type VideoCoreMiningHistoryEntry,
} from '../../shared/videoCoreMining';

/** The newest line mined from the video player: what was said, where, when. */
export interface WiredMinedLine {
  sentence: string;
  /** Show (and episode) title; null when the source never said. */
  title: string | null;
  at: number;
}

export interface WiredMemory {
  lastQuery: string | null;
  lastMined: string | null;
  /** The newest line mined from a video, from the deck or the player's mining history. */
  lastLine: WiredMinedLine | null;
  dueCount: number;
  /** Distinct kanji from the due cards' words, in due order (≤ 10). */
  dueKanji: string[];
}

function historyTitle(entry: VideoCoreMiningHistoryEntry): string | null {
  const source = entry.provenance.source;
  const title = source.mediaTitle?.trim();
  if (!title) return null;
  return source.episodeNumber != null ? `${title} #${source.episodeNumber}` : title;
}

/**
 * The newest player-mined line across both records of it: local deck cards
 * mined from media (sentence + show title), and the player's Anki mining
 * history (failed and undone mines are not lines the operator kept).
 */
export function latestMinedLine(
  cards: ReadonlyArray<Pick<DeckFlashcard, 'source' | 'sentence' | 'bookTitle' | 'addedAt'>>,
  history: readonly VideoCoreMiningHistoryEntry[],
): WiredMinedLine | null {
  let best: WiredMinedLine | null = null;
  for (const card of cards) {
    const sentence = card.sentence?.trim();
    if (card.source !== 'media' || !sentence || !(card.addedAt > (best?.at ?? -Infinity))) continue;
    best = { sentence, title: card.bookTitle?.trim() || null, at: card.addedAt };
  }
  for (const entry of history) {
    const sentence = entry.sentence.trim();
    if (entry.status !== 'exported' && entry.status !== 'duplicate') continue;
    if (!sentence || !(entry.createdAt > (best?.at ?? -Infinity))) continue;
    best = { sentence, title: historyTitle(entry), at: entry.createdAt };
  }
  return best;
}

function readMiningHistory(): VideoCoreMiningHistoryEntry[] {
  try {
    return normalizeVideoCoreMiningHistory(JSON.parse(localStorage.getItem(VIDEO_CORE_MINING_HISTORY_KEY) ?? '[]'));
  } catch {
    return [];
  }
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
  let lastLine: WiredMinedLine | null = null;
  let dueCount = 0;
  let dueKanji: string[] = [];
  try {
    const deck = loadDeck();
    lastLine = latestMinedLine(deck, readMiningHistory());
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
  return { lastQuery, lastMined, lastLine, dueCount, dueKanji };
}

const EMPTY: WiredMemory = { lastQuery: null, lastMined: null, lastLine: null, dueCount: 0, dueKanji: [] };
let snapshotValue: WiredMemory = EMPTY;
let primed = false;
const listeners = new Set<() => void>();
let teardown: (() => void) | null = null;

function same(a: WiredMemory, b: WiredMemory): boolean {
  return (
    a.lastQuery === b.lastQuery &&
    a.lastMined === b.lastMined &&
    a.lastLine?.sentence === b.lastLine?.sentence &&
    a.lastLine?.at === b.lastLine?.at &&
    a.lastLine?.title === b.lastLine?.title &&
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
  // A line mined in the player lands in its history (and maybe the deck) and is announced
  // through the stats channel; another window's mine arrives as a storage event.
  const onStorage = (event: StorageEvent): void => {
    if (event.key === VIDEO_CORE_MINING_HISTORY_KEY) schedule();
  };
  window.addEventListener(LOOKUP_HISTORY_EVENT, schedule);
  window.addEventListener(REVIEW_RECORDED_EVENT, schedule);
  window.addEventListener(MEDIA_STUDY_RECORDED_EVENT, schedule);
  window.addEventListener('storage', onStorage);
  const offDeck = onDeckChanged(schedule);
  // Cards come due with no event at all; ten minutes is plenty for a readout.
  const slow = window.setInterval(() => {
    if (document.visibilityState !== 'hidden') recompute();
  }, 10 * 60_000);
  return () => {
    if (timer !== null) window.clearTimeout(timer);
    window.removeEventListener(LOOKUP_HISTORY_EVENT, schedule);
    window.removeEventListener(REVIEW_RECORDED_EVENT, schedule);
    window.removeEventListener(MEDIA_STUDY_RECORDED_EVENT, schedule);
    window.removeEventListener('storage', onStorage);
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
