/**
 * The Files app — one-click mine (gate 3).
 *
 * `MINING_UNIFICATION_PLAN.md`'s finding, restated so this module's shape is
 * not mistaken for a fifth miner: there are four miners and **two**
 * destinations. Three build `MineNoteRequest` (`shared/anki.ts:37`) and push to
 * AnkiConnect; the epub path builds CSV rows. This module adds **no extractor
 * and no destination** — it is the *surface* the plan asked to unify, and it
 * reuses both halves:
 *
 * - the text comes from readers that already exist (`parseSubtitles`,
 *   `extractEpubSections`, the transcript files `ytPlaylists.ts:770` writes);
 * - the cards land in the app's own deck (`renderer/flashcardDeck.ts`), and the
 *   same draft converts to a `MineNoteRequest` for AnkiConnect unchanged.
 *
 * **Why the local deck is the destination that closes the gate.** Gate 3 says
 * "end to end". AnkiConnect's end is a third-party desktop app that may not be
 * running, and a gate that can only pass while Anki is open is not a gate this
 * app can hold itself to. The local deck is the app's own store, is what the
 * anime-harvest flow already writes into (`bookId: 'harvest:…'`), and undoes
 * exactly (`addDeckCardsTracked` returns the new rows). `buildFilesMineNoteRequest`
 * keeps the AnkiConnect route open from the same draft, so this is one more
 * caller of the shared contract rather than a third destination.
 *
 * **The binding constraint, in code.** Transcript-derived cards must be visibly
 * marked. `textProvenance` is carried from the catalogue row onto every card
 * here — mapped, never inferred, and an unmarkable value is left ABSENT rather
 * than defaulted to a human one. A fabricated trust mark is worse than none.
 *
 * Pure: no `fs`, no `electron`, no `window`. Main reads the bytes, the renderer
 * writes the deck, and both agree here.
 */
import type { MineNoteRequest } from '../anki';
import { hasHan, hasKana } from '../langs';
import type { FilesItem, FilesItemKind, FilesProvenance } from './catalog';

/* ------------------------------------------------------------------ *
 * What can be mined, and what an honest refusal says.
 * ------------------------------------------------------------------ */

/**
 * The kinds this app can read text out of today.
 *
 * A video is NOT here, and that is the plan's point rather than an omission: a
 * video file carries no text, its transcript beside it does, and the transcript
 * is its own row in this index (gate 2). Listing video as mineable and then
 * failing at read time would be the "capability that is present and failing"
 * the plan rules out.
 */
export const FILES_MINEABLE_KINDS: readonly FilesItemKind[] = ['transcript', 'subtitle', 'book'];

const MINEABLE = new Set<FilesItemKind>(FILES_MINEABLE_KINDS);

export type FilesMineability =
  | { mineable: true }
  | { mineable: false; reasonKey: string };

/**
 * Whether one-click mine is offerable for this row, and why not when it is not.
 *
 * Order matters. A broken link is checked before the kind so that a missing
 * transcript file says *the file is gone*, not *this kind has no text* — the
 * two need different fixes and the wrong message sends the user to the wrong
 * one.
 */
export function mineabilityOf(item: FilesItem): FilesMineability {
  if (item.location.store !== 'file') {
    return { mineable: false, reasonKey: 'filesApp.mine.refuse.notFileBacked' };
  }
  if (item.flags.brokenLink) {
    return { mineable: false, reasonKey: 'filesApp.mine.refuse.brokenLink' };
  }
  if (item.kind === 'video' || item.kind === 'audio') {
    // Named rather than generic: the transcript IS in this index, so the
    // refusal can point at the thing that works.
    return { mineable: false, reasonKey: 'filesApp.mine.refuse.mediaHasNoText' };
  }
  if (!MINEABLE.has(item.kind)) {
    return { mineable: false, reasonKey: 'filesApp.mine.refuse.kindHasNoText' };
  }
  return { mineable: true };
}

/* ------------------------------------------------------------------ *
 * Passages — what a reader hands back.
 * ------------------------------------------------------------------ */

/**
 * One readable unit of the source: a subtitle cue, a transcript cue, or a
 * sentence out of an epub section. Timings are present only where the store
 * really has them; an epub sentence has none and does not get a zero.
 */
export interface FilesMinePassage {
  /** 1-based position within the source, in reading/playback order. */
  index: number;
  text: string;
  startMs?: number;
  endMs?: number;
  /** Section title or track name, when the reader knows one. */
  context?: string;
}

/** What a reader returns for one item. A refusal names its reason key. */
export type FilesMineSourceResult =
  | {
      ok: true;
      passages: FilesMinePassage[];
      /** Passages found before any Japanese filter or cap — the honest total. */
      readCount: number;
    }
  | { ok: false; reasonKey: string; detail?: string };

/* ------------------------------------------------------------------ *
 * Provenance — mapped, never inferred.
 * ------------------------------------------------------------------ */

/**
 * The deck's own text-provenance vocabulary (`renderer/flashcardDeck.ts`),
 * repeated structurally rather than imported: that module pulls in
 * localStorage, IndexedDB mirroring and companion events at module scope, and
 * `shared/` may not depend on any of it. Same reasoning as
 * `shared/ankiLocalDeck.ts`'s `LocalDeckCardInput`.
 */
export type FilesDeckTextProvenance = 'human-subs' | 'auto-captions' | 'transcript' | 'book-text';

/**
 * Catalogue provenance → deck provenance. The exact inverse of
 * `provenanceForCard` in `renderer/components/filesapp/rendererEnumerators.ts`,
 * so a card mined here and re-read by the index comes back with the value it
 * left with.
 *
 * `app-generated`, `installed` and `unknown` map to **undefined**: the deck
 * field's contract is "absent means not recorded, never human", and inventing
 * `human-subs` for material whose origin nobody knows is precisely the
 * fabricated trust mark the plan forbids.
 */
export function deckProvenanceFor(provenance: FilesProvenance): FilesDeckTextProvenance | undefined {
  switch (provenance) {
    case 'human-subs':
      return 'human-subs';
    case 'auto-captions':
      return 'auto-captions';
    case 'whisper-transcript':
      return 'transcript';
    case 'book-text':
      return 'book-text';
    default:
      return undefined;
  }
}

/** The deck `source` bucket a Files-app mine belongs in. */
export function deckSourceFor(kind: FilesItemKind): 'media' | 'epub' {
  return kind === 'book' ? 'epub' : 'media';
}

/* ------------------------------------------------------------------ *
 * Drafts.
 * ------------------------------------------------------------------ */

/**
 * A card this mine would add, before it is written.
 *
 * Structurally assignable to `Omit<DeckFlashcard, 'id' | 'addedAt'>` — the
 * renderer hands the array straight to `addDeckCardsTracked` without a second
 * mapping step, which is what keeps the shape the tests check and the shape the
 * store receives the same shape.
 */
export interface FilesMineCardDraft {
  word: string;
  reading: string;
  meaning: string;
  sentence: string;
  source: 'media' | 'epub';
  bookId: string;
  bookTitle: string;
  textProvenance?: FilesDeckTextProvenance;
  /** Playback position, kept only where the source really carries one. */
  sceneReference?: string;
}

/**
 * How many cards one click may add. A cap, not a page size: the click is
 * one action with one undo, and an epub can hold tens of thousands of
 * sentences.
 *
 * When it bites, the result says so with both numbers (`added` and
 * `passagesRead`) rather than reporting a quietly truncated success.
 */
export const FILES_MINE_MAX_CARDS = 200;

export interface BuildFilesMineDraftsOptions {
  /** Words already in the deck, folded the way `dedupeKey` folds. */
  existingWords?: ReadonlySet<string>;
  maxCards?: number;
}

export interface FilesMineDraftPlan {
  drafts: FilesMineCardDraft[];
  /** Passages the reader returned. */
  passagesRead: number;
  /** Passages holding no Japanese at all — credits, `[Music]`, blank lines. */
  skippedNotJapanese: number;
  /** Passages whose text is already a card, in this batch or in the deck. */
  skippedDuplicate: number;
  /** Passages dropped because `maxCards` was reached. Non-zero means truncated. */
  skippedOverCap: number;
}

/**
 * The fold two passages are compared under. Whitespace only — NOT the search
 * fold: a search wants 286 to find ＃２８６, but two cards whose text differs by
 * width are two different cards and collapsing them would silently drop one.
 */
export function dedupeKey(text: string): string {
  return text.replace(/\s+/g, '');
}

/**
 * Fold the deck's existing card text into `existingWords`.
 *
 * Exported so the renderer folds through THIS function rather than repeating
 * the expression: a caller that folded differently would produce an
 * `existingWords` set that never matches, and the failure mode is a silent
 * duplicate rather than an error — `skippedDuplicate` would simply read 0 and
 * look like an honest first mine.
 */
export function existingDeckKeys(texts: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const text of texts) {
    const key = dedupeKey(text.trim());
    if (key) out.add(key);
  }
  return out;
}

/** The deck key every card from one Files item shares, so they group together. */
export function mineBookIdFor(item: FilesItem): string {
  return `files:${item.id}`;
}

function timeLabel(passage: FilesMinePassage): string | undefined {
  if (typeof passage.startMs !== 'number' || !Number.isFinite(passage.startMs)) return undefined;
  const total = Math.max(0, Math.round(passage.startMs / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Turn passages into card drafts, counting every passage that did not become
 * one. A count of 0 with no explanation is the state this plan calls a FINDING,
 * so each drop lands in a named bucket and the four buckets plus `drafts.length`
 * always sum to `passagesRead`.
 *
 * Sentence cards, matching `createVideoCoreMiningDraft` — `term` IS the
 * sentence there too. Nothing here guesses a reading or a meaning: this app has
 * a tokenizer and a dictionary, and putting a machine gloss on a card without
 * saying it is one would repeat exactly the defect the provenance rule exists
 * to prevent.
 */
export function buildFilesMineDrafts(
  item: FilesItem,
  passages: readonly FilesMinePassage[],
  options: BuildFilesMineDraftsOptions = {},
): FilesMineDraftPlan {
  const max = options.maxCards ?? FILES_MINE_MAX_CARDS;
  const seen = new Set<string>(options.existingWords ?? []);
  const bookId = mineBookIdFor(item);
  const textProvenance = deckProvenanceFor(item.provenance);
  const source = deckSourceFor(item.kind);

  const drafts: FilesMineCardDraft[] = [];
  let skippedNotJapanese = 0;
  let skippedDuplicate = 0;
  let skippedOverCap = 0;

  for (const passage of passages) {
    const text = passage.text.trim();
    if (!text || !(hasKana(text) || hasHan(text))) {
      skippedNotJapanese += 1;
      continue;
    }
    const key = dedupeKey(text);
    if (seen.has(key)) {
      skippedDuplicate += 1;
      continue;
    }
    if (drafts.length >= max) {
      skippedOverCap += 1;
      continue;
    }
    seen.add(key);
    const scene = timeLabel(passage);
    drafts.push({
      word: text,
      reading: '',
      meaning: '',
      sentence: text,
      source,
      bookId,
      bookTitle: item.name,
      ...(textProvenance ? { textProvenance } : {}),
      ...(scene ? { sceneReference: scene } : {}),
    });
  }

  return {
    drafts,
    passagesRead: passages.length,
    skippedNotJapanese,
    skippedDuplicate,
    skippedOverCap,
  };
}

/* ------------------------------------------------------------------ *
 * The AnkiConnect route, from the same draft.
 * ------------------------------------------------------------------ */

/**
 * The shared contract, unchanged: this is the fourth caller of
 * `MineNoteRequest`, not a fourth definition of one. `route.source` is
 * `'subtitle'` for cue-derived text and `'epub'` for book text — both are
 * existing `MineSource` values (`profileRules.ts:8`), so a user's mining rules
 * route a Files-app mine exactly as they route the same text mined in place.
 *
 * `extraTags` carries the provenance so the mark survives into Anki, where this
 * app no longer owns the card and cannot re-derive it.
 */
export function buildFilesMineNoteRequest(draft: FilesMineCardDraft): MineNoteRequest {
  const tags = ['files-app', draft.source === 'epub' ? 'files-book' : 'files-media'];
  if (draft.textProvenance) tags.push(`provenance-${draft.textProvenance}`);
  return {
    route: {
      source: draft.source === 'epub' ? 'epub' : 'subtitle',
      cardKind: 'sentence',
      language: 'ja',
    },
    term: draft.word,
    sentence: draft.sentence,
    surface: draft.word,
    extraTags: tags,
  };
}
