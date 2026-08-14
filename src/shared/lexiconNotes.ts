// A user's own note on a dictionary entry: the wire shape, and the bounds every
// untrusted caller's input is squeezed through before it reaches SQLite.
//
// Notes are the one thing in the Lexicon Workbench the *user* owns. Everything
// else on an entry is derived from an imported source and is replaced wholesale
// when that source is re-imported; a note has to survive exactly that. So a note
// is keyed on the identity of a **word** — language plus written form plus
// reading — and never on a `headwords.id`, which is an autoincrement row number
// that a re-import reassigns to a different word.
//
// Nothing here touches a database, so the renderer can share the same limits the
// main process enforces instead of guessing at them.

/** Long enough for a real study note; short enough that one row cannot bloat the file. */
export const NOTE_MAX_CHARS = 4_000;
export const NOTE_MAX_TAGS = 12;
export const TAG_MAX_CHARS = 32;
/** A headword, not a passage. Nothing longer can be a word a note hangs off. */
export const NOTE_IDENTITY_MAX_CHARS = 128;

/** The word a note belongs to, in the form the caller has it. */
export interface LexiconNoteIdentity {
  lang: string;
  text: string;
  reading: string;
}

export interface LexiconNote extends LexiconNoteIdentity {
  note: string;
  tags: string[];
  /** Epoch milliseconds of the last write. 0 for a note that has never been written. */
  updatedAt: number;
}

export interface LexiconNoteInput {
  note: string;
  tags: string[];
}

/** One page of the user's notes. `total` counts every match, not the page. */
export interface LexiconNoteListQuery {
  /** Empty means every language, which is what a browse surface opens on. */
  lang: string;
  /** Empty means no text filter. Matched against word, reading, body and tags. */
  filter: string;
  limit: number;
  offset: number;
}

export interface LexiconNoteListResult {
  notes: LexiconNote[];
  /** Matches before paging, so the surface can say how many more there are. */
  total: number;
}

/**
 * Announced on `window` after a note is stored or cleared.
 *
 * The editor and the browse list are two independent components with no common
 * ancestor holding this state, and a list that silently disagrees with the note
 * just saved is worse than no list. Declared here rather than in either component
 * so neither owns the other's contract.
 */
export const LEXICON_NOTES_CHANGED_EVENT = 'lexicon-notes-changed';

/** A page big enough to scroll, small enough that one IPC reply stays cheap. */
export const NOTE_LIST_DEFAULT_LIMIT = 50;
export const NOTE_LIST_MAX_LIMIT = 200;
/** A filter is a word or a tag, never a passage. */
export const NOTE_FILTER_MAX_CHARS = 64;

/**
 * NFKC + case fold.
 *
 * This must stay identical to `normalizeForLookup` in `main/dictionary/dictService.ts`,
 * which is the rule `headwords.norm` is built with. A note keys on the same
 * normalised form the index does, so the note for a word is found by the same
 * string the lookup found the word by. `lexiconNotes.test.ts` pins the two
 * together rather than leaving this comment to be trusted.
 *
 * Katakana is deliberately *not* folded to hiragana here, unlike
 * `neighborWordKey`. A neighbour list must not return ネコ as a neighbour of ねこ
 * because they are the same word; a note is written against the spelling the
 * reader was looking at, and silently merging two spellings' notes would show
 * one of them under the other.
 */
export function normalizeNoteKey(text: string): string {
  return text.normalize('NFKC').trim().toLowerCase();
}

function boundedField(raw: unknown, max: number): string {
  return typeof raw === 'string' ? raw.trim().slice(0, max) : '';
}

/**
 * The identity an untrusted caller supplied, or `null` when it does not name a word.
 *
 * A missing language is not defaulted. Notes are keyed per language, and guessing
 * 'ja' for a caller that forgot to say would file a Chinese note under Japanese.
 */
export function readNoteIdentity(raw: unknown): LexiconNoteIdentity | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const lang = boundedField(record.lang, 16).toLowerCase();
  const text = boundedField(record.text, NOTE_IDENTITY_MAX_CHARS);
  const reading = boundedField(record.reading, NOTE_IDENTITY_MAX_CHARS);
  if (!lang || !text) return null;
  return { lang, text, reading };
}

/** Note body, bounded. CRLF is folded so the same note round-trips byte-identically. */
export function normalizeNoteText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\r\n?/g, '\n').trim().slice(0, NOTE_MAX_CHARS);
}

/**
 * Tags, deduplicated case-insensitively but returned in the casing the user typed —
 * the tag is shown back to them, so "JLPT" must not come back as "jlpt".
 */
export function normalizeNoteTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const tag = item.trim().replace(/\s+/g, ' ').slice(0, TAG_MAX_CHARS);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= NOTE_MAX_TAGS) break;
  }
  return out;
}

/**
 * The page an untrusted caller asked for, clamped.
 *
 * Unlike `readNoteIdentity` this never returns `null`: a browse surface with a
 * malformed query should show the first page of everything, not an error. An
 * absent language is "all languages" here precisely because nothing is being
 * *written* — reading across languages cannot file anything under the wrong one.
 */
export function readNoteListQuery(raw: unknown): LexiconNoteListQuery {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const limit = typeof record.limit === 'number' && Number.isFinite(record.limit)
    ? Math.min(NOTE_LIST_MAX_LIMIT, Math.max(1, Math.floor(record.limit)))
    : NOTE_LIST_DEFAULT_LIMIT;
  const offset = typeof record.offset === 'number' && Number.isFinite(record.offset)
    ? Math.max(0, Math.floor(record.offset))
    : 0;
  return {
    lang: boundedField(record.lang, 16).toLowerCase(),
    filter: boundedField(record.filter, NOTE_FILTER_MAX_CHARS),
    limit,
    offset,
  };
}

export function readNoteInput(raw: unknown): LexiconNoteInput {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return { note: normalizeNoteText(record.note), tags: normalizeNoteTags(record.tags) };
}

/**
 * True when there is nothing left to store.
 *
 * Clearing the text is how a note is deleted — an empty row would otherwise sit
 * in the table forever, and "the note is gone" and "the note is an empty string"
 * would be two states the reader cannot tell apart.
 */
export function noteIsEmpty(input: LexiconNoteInput): boolean {
  return input.note.length === 0 && input.tags.length === 0;
}

/** Tags are stored as one text column; this is the only place that shape is decided. */
export function serializeNoteTags(tags: readonly string[]): string {
  return tags.join('\n');
}

export function parseNoteTags(raw: unknown): string[] {
  return typeof raw === 'string' ? normalizeNoteTags(raw.split('\n')) : [];
}
