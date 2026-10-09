/**
 * "Already in your deck / already in Anki" for dictionary entries, before Add.
 *
 * The Add button used to find out only by trying: a word mined last week came back
 * as "Already in Anki" after the click, and nothing on the entry said the local deck
 * held it. Yomitan marks a duplicate before you add it; this is that.
 *
 * Two sources, each honest about what it knows:
 *   - the local deck, read synchronously — a card for this word in this study
 *     language, and whether that card already reached Anki (a note id, an export, or
 *     Anki's own duplicate verdict when it was pushed);
 *   - Anki itself, asked read-only through `canAddNotes` on the active profile's deck
 *     and note type (the same check the browser extension's popup makes), only while
 *     Anki is connected. A failed or unreachable check says nothing rather than "no".
 */
import type { DeckFlashcard } from './flashcardDeck';

export interface EntryPresence {
  /** The local deck holds a card for this word. */
  inDeck: boolean;
  /** Anki holds a note for it — from the deck card's record or a live check. */
  inAnki: boolean;
  /** The deck card is waiting in the queue for Anki to come back. */
  ankiPending: boolean;
}

type PresenceCard = Pick<
  DeckFlashcard,
  'word' | 'studyLang' | 'ankiNoteId' | 'ankiExported' | 'ankiDuplicate' | 'ankiPending'
>;

function normWord(word: string): string {
  return word.normalize('NFKC').trim();
}

/** The language a card belongs to; a card without one is Japanese (see `DeckFlashcard.studyLang`). */
function cardLang(card: PresenceCard): string {
  return card.studyLang || 'ja';
}

/**
 * Presence of each word in the local deck, for one study language. Every asked word
 * gets an entry, so a caller never has to tell "absent" from "not asked".
 */
export function deckPresenceByWord(
  cards: readonly PresenceCard[],
  words: readonly string[],
  lang: string,
): Map<string, EntryPresence> {
  const wanted = new Set(words.map(normWord).filter(Boolean));
  const found = new Map<string, EntryPresence>();
  for (const card of cards) {
    if (cardLang(card) !== lang) continue;
    const word = normWord(card.word ?? '');
    if (!wanted.has(word)) continue;
    const prev = found.get(word) ?? { inDeck: false, inAnki: false, ankiPending: false };
    found.set(word, {
      inDeck: true,
      inAnki: prev.inAnki || Boolean(card.ankiNoteId || card.ankiExported || card.ankiDuplicate),
      ankiPending: prev.ankiPending || Boolean(card.ankiPending),
    });
  }
  const out = new Map<string, EntryPresence>();
  for (const word of words) {
    out.set(word, found.get(normWord(word)) ?? { inDeck: false, inAnki: false, ankiPending: false });
  }
  return out;
}

/** Fold a live Anki duplicate verdict in. Only a `true` verdict changes anything. */
export function withAnkiDuplicates(
  presence: ReadonlyMap<string, EntryPresence>,
  duplicates: Readonly<Record<string, boolean>>,
): Map<string, EntryPresence> {
  const out = new Map<string, EntryPresence>();
  for (const [word, state] of presence) {
    const live = duplicates[word] === true || duplicates[normWord(word)] === true;
    out.set(word, live ? { ...state, inAnki: true } : state);
  }
  return out;
}

const ANKI_CHECK_TTL_MS = 60_000;
const ankiCache = new Map<string, { at: number; duplicates: Record<string, boolean> }>();

/**
 * Ask Anki which of `words` the target deck/note type already holds. Cached per
 * target and word set for a minute, so the popup's re-renders do not each ask.
 * Resolves to an empty record whenever the check cannot be made.
 */
export async function checkAnkiPresence(
  words: readonly string[],
  target: { deckName: string; modelName: string },
  now = Date.now(),
): Promise<Record<string, boolean>> {
  const list = [...new Set(words.map(normWord).filter(Boolean))];
  const api = typeof window !== 'undefined' ? window.api?.ankiCheckDuplicates : undefined;
  if (!list.length || !target.deckName || !target.modelName || typeof api !== 'function') return {};
  const key = `${target.deckName}\u0000${target.modelName}\u0000${list.join('\u0001')}`;
  const hit = ankiCache.get(key);
  if (hit && now - hit.at < ANKI_CHECK_TTL_MS) return hit.duplicates;
  try {
    const reply = await api(list, target);
    if (!reply?.ok) return {};
    ankiCache.set(key, { at: now, duplicates: reply.duplicates ?? {} });
    if (ankiCache.size > 100) {
      const oldest = ankiCache.keys().next().value;
      if (oldest !== undefined) ankiCache.delete(oldest);
    }
    return reply.duplicates ?? {};
  } catch {
    return {};
  }
}

/** Forget every cached Anki verdict — after an Add, whose result changes them. */
export function resetAnkiPresenceCache(): void {
  ankiCache.clear();
}
