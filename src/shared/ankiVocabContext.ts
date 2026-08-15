// The vocabulary facts the Deck Workbench Browser needs before it can filter on
// them — ANKI_DECK_WORKBENCH_PLAN.md Phase 4 ("frequency rules, known-word
// exclusion") and its gates 3 and 4.
//
// This module is the *data* half of that slice, deliberately landed on its own:
// `freq:` and `known:` predicates that have no context to read can only ever
// refuse, so the context has to exist first. Nothing here filters anything. It
// answers three questions about one note and stops:
//
//   1. which of its fields holds the word, and what that word is;
//   2. what rank an installed frequency corpus gives that word;
//   3. whether the word is known — locally, in Anki, or in disagreement.
//
// Three rules the rest of Phase 4 is built on:
//
// **Absent is a third answer, never a default.** A note whose word no corpus
// ranks has `rank: null`, which is not "rank infinity" and not "rare". An empty
// `freq_corpora` and a genuinely obscure word are different claims, and
// `lexiconFrequency.ts` already refuses to conflate them; so does this.
//
// **A source with no data does not vote.** `local` and `anki` are each
// `boolean | null`. Precedence decides a *disagreement* between two sources that
// both spoke — it does not silently promote one source's silence into a "no".
//
// **The word is extracted, not guessed at length.** A field holding a whole
// sentence is not a headword; past `MAX_FREQUENCY_QUERY_CHARS` the term is
// `null` rather than a lookup that can only miss.

import type { AnkiDraftCard, AnkiDraftNote, AnkiDraftNoteType } from './ankiDraft';
import { MAX_FREQUENCY_QUERY_CHARS } from './lexiconFrequency';

// ----- which field holds the word -----------------------------------------------

/**
 * Field names that mean "the word this note teaches", best first.
 *
 * Matched case-insensitively and exactly, not as substrings: `Word Audio` and
 * `Expression Furigana` are companions to the word, not the word, and a
 * substring rule would pick whichever the note type happened to list first.
 * `Front` is last on purpose — on a reverse-only or sentence deck it holds the
 * meaning, so it is the fallback rather than the first guess.
 */
export const VOCAB_FIELD_CANDIDATES: readonly string[] = [
  'expression',
  'word',
  'vocabulary',
  'vocab',
  'term',
  'headword',
  'kanji',
  '単語',
  '語彙',
  '表現',
  'target',
  'front',
];

/**
 * The field of a note type the word is read from, or `null` when none of the
 * candidates is present — which is an honest "this note type does not declare a
 * word", not a reason to fall back to field 0. Falling back would rank the
 * *meaning* of every sentence deck in the collection.
 */
export function resolveVocabField(fieldNames: readonly string[]): string | null {
  const byLower = new Map<string, string>();
  for (const name of fieldNames) {
    const key = name.trim().toLowerCase();
    if (key && !byLower.has(key)) byLower.set(key, name);
  }
  for (const candidate of VOCAB_FIELD_CANDIDATES) {
    const hit = byLower.get(candidate);
    if (hit !== undefined) return hit;
  }
  return null;
}

/**
 * The headword inside one field value, or `null` when the value cannot be one.
 *
 * The input is a note's `normalized` text, which `ankiDraft.ts` has already
 * stripped of HTML, furigana and cloze markers — so the only work left is to
 * take the first run of non-space characters (a "食べる to eat" field is a word
 * followed by its gloss) and to refuse anything longer than the frequency
 * probe's own bound.
 */
export function extractVocabTerm(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/u)[0] ?? '';
  // Trailing punctuation a deck author typed around the word, not part of it.
  const term = first.replace(/^[「『（(【[]+/u, '').replace(/[」』）)】\]、,。.!?！？]+$/u, '');
  if (!term) return null;
  return term.length > MAX_FREQUENCY_QUERY_CHARS ? null : term;
}

// ----- known state ---------------------------------------------------------------

/** `renderer/knownWords.ts` level 3 is `Known`; 1 and 2 are still being learned. */
export const DEFAULT_LOCAL_KNOWN_LEVEL = 3;

/**
 * Anki's own line between a card being learned and a card being retained. 21
 * days is what Anki itself calls mature, so a filter that says "known in Anki"
 * means the thing the user's other Anki tools already mean by it.
 */
export const DEFAULT_MATURE_INTERVAL_DAYS = 21;

/** Which source wins when local and Anki disagree about the same word. */
export type VocabKnownPrecedence = 'local' | 'anki' | 'either' | 'both';

export type VocabKnownVerdict = 'known' | 'unknown' | 'no-data';

export interface VocabKnownState {
  /** `null` = this install has no knowledge entry for the word at all. */
  local: boolean | null;
  /** `null` = the note generates no scheduled card, so Anki has no opinion. */
  anki: boolean | null;
}

/** The two sources both spoke and said different things. */
export function isVocabKnownConflict(state: VocabKnownState): boolean {
  return state.local !== null && state.anki !== null && state.local !== state.anki;
}

/**
 * Collapses the two sources into one answer.
 *
 * A source that is `null` has no vote — so `local` precedence over a word with
 * no local entry still answers from Anki rather than reporting "unknown", which
 * would be this module inventing a negative. Only when *both* are silent is the
 * verdict `no-data`, and no `known:` predicate matches that by accident.
 */
export function resolveVocabKnown(
  state: VocabKnownState,
  precedence: VocabKnownPrecedence,
): VocabKnownVerdict {
  const { local, anki } = state;
  if (local === null && anki === null) return 'no-data';
  if (local === null) return anki ? 'known' : 'unknown';
  if (anki === null) return local ? 'known' : 'unknown';
  switch (precedence) {
    case 'local':
      return local ? 'known' : 'unknown';
    case 'anki':
      return anki ? 'known' : 'unknown';
    case 'both':
      return local && anki ? 'known' : 'unknown';
    default:
      return local || anki ? 'known' : 'unknown';
  }
}

/**
 * Whether Anki considers this note's word retained: every card it generates is
 * past the mature interval.
 *
 * *Every* card, not any: a note whose reverse card is still new is a note the
 * user is still learning, and excluding it as "known" would drop exactly the
 * card they still need. A note with no cards returns `null` — a CSV import that
 * has not been scheduled yet is not evidence of anything.
 */
export function ankiKnownFromCards(
  cards: readonly AnkiDraftCard[],
  matureIntervalDays: number = DEFAULT_MATURE_INTERVAL_DAYS,
): boolean | null {
  if (!cards.length) return null;
  return cards.every(
    (card) =>
      (card.type === 'review' || card.type === 'relearning')
      // Anki's legacy negative interval encodes seconds, which is always
      // shorter than a day and therefore never mature.
      && card.interval >= matureIntervalDays,
  );
}

// ----- the context ----------------------------------------------------------------

export interface VocabNoteFacts {
  noteId: string;
  /** The field the word was read from, or `null` when the note type declares none. */
  field: string | null;
  /** The extracted headword, or `null` when the field is empty or holds prose. */
  term: string | null;
  /** Best rank across installed corpora, or `null` when none ranks the word. */
  rank: number | null;
  known: VocabKnownState;
}

/**
 * Everything a `freq:` / `known:` predicate may read, resolved once per draft
 * rather than once per row: a 100k-note filter re-deriving a note's term on
 * every keystroke is the same quadratic the change-tray preview shipped and had
 * to fix.
 */
export interface VocabContext {
  byNote: ReadonlyMap<string, VocabNoteFacts>;
  /** Distinct terms the draft asked about, in first-note order. */
  terms: readonly string[];
  /** How many of `terms` an installed corpus could rank. Honest empty-state fuel. */
  rankedTermCount: number;
  precedence: VocabKnownPrecedence;
}

export interface VocabContextInput {
  notes: readonly AnkiDraftNote[];
  noteTypes: readonly AnkiDraftNoteType[];
  cards: readonly AnkiDraftCard[];
  /** Term → best rank. A term the caller looked up and found nothing for maps to `null`. */
  ranks?: ReadonlyMap<string, number | null>;
  /** Term → local knowledge level (0–3), from `renderer/knownWords.ts`. */
  localLevels?: ReadonlyMap<string, number>;
  localKnownLevel?: number;
  matureIntervalDays?: number;
  precedence?: VocabKnownPrecedence;
}

/**
 * The terms a draft would need ranked, so a caller can batch one lookup instead
 * of one per note. Deduplicated and in first-note order, which keeps a partial
 * lookup (the first N terms) deterministic rather than arbitrary.
 */
export function collectVocabTerms(
  notes: readonly AnkiDraftNote[],
  noteTypes: readonly AnkiDraftNoteType[],
): string[] {
  const fieldByType = vocabFieldByNoteType(noteTypes);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const note of notes) {
    const field = fieldByType.get(note.noteTypeId);
    if (!field) continue;
    const value = note.fields.find((f) => f.name === field);
    const term = value ? extractVocabTerm(value.normalized) : null;
    if (!term || seen.has(term)) continue;
    seen.add(term);
    out.push(term);
  }
  return out;
}

function vocabFieldByNoteType(noteTypes: readonly AnkiDraftNoteType[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const type of noteTypes) {
    out.set(type.id, resolveVocabField(type.fields.map((f) => f.name)));
  }
  return out;
}

export function buildVocabContext(input: VocabContextInput): VocabContext {
  const {
    notes,
    noteTypes,
    cards,
    ranks,
    localLevels,
    localKnownLevel = DEFAULT_LOCAL_KNOWN_LEVEL,
    matureIntervalDays = DEFAULT_MATURE_INTERVAL_DAYS,
    precedence = 'local',
  } = input;

  const fieldByType = vocabFieldByNoteType(noteTypes);
  const cardsByNote = new Map<string, AnkiDraftCard[]>();
  for (const card of cards) {
    const list = cardsByNote.get(card.noteId);
    if (list) list.push(card);
    else cardsByNote.set(card.noteId, [card]);
  }

  const byNote = new Map<string, VocabNoteFacts>();
  const terms: string[] = [];
  const seen = new Set<string>();
  let rankedTermCount = 0;

  for (const note of notes) {
    const field = fieldByType.get(note.noteTypeId) ?? null;
    const value = field ? note.fields.find((f) => f.name === field) : undefined;
    const term = value ? extractVocabTerm(value.normalized) : null;
    const rank = term && ranks ? ranks.get(term) ?? null : null;
    const level = term && localLevels ? localLevels.get(term) : undefined;
    byNote.set(note.id, {
      noteId: note.id,
      field,
      term,
      rank,
      known: {
        // A word with no knowledge entry is not "not known" — the user has
        // never been asked. Level 0 *is* an answer: it was set and cleared.
        local: level === undefined ? null : level >= localKnownLevel,
        anki: ankiKnownFromCards(cardsByNote.get(note.id) ?? [], matureIntervalDays),
      },
    });
    if (term && !seen.has(term)) {
      seen.add(term);
      terms.push(term);
      if (rank !== null) rankedTermCount += 1;
    }
  }

  return { byNote, terms, rankedTermCount, precedence };
}

/** An empty context is still a context: it exists, and every fact in it is absent. */
export function emptyVocabContext(precedence: VocabKnownPrecedence = 'local'): VocabContext {
  return { byNote: new Map(), terms: [], rankedTermCount: 0, precedence };
}
