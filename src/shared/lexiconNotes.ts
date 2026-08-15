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
  /**
   * The user marked this word to come back to.
   *
   * A star is not a note with a special body: it is a one-click judgement about a
   * word, and it has to be settable without writing prose and readable without
   * parsing any. It rides on the note row because the two are keyed on the same
   * word identity and a second table would only duplicate that key, migration 6's
   * partial index, and the orphan handling that goes with them.
   */
  starred: boolean;
  /** Epoch milliseconds of the last write. 0 for a note that has never been written. */
  updatedAt: number;
}

export interface LexiconNoteInput {
  note: string;
  tags: string[];
  starred: boolean;
}

/** One page of the user's notes. `total` counts every match, not the page. */
export interface LexiconNoteListQuery {
  /** Empty means every language, which is what a browse surface opens on. */
  lang: string;
  /** Empty means no text filter. Matched against word, reading, body and tags. */
  filter: string;
  /**
   * Keep only starred rows. `false` shows starred and unstarred alike rather than
   * "unstarred only" — the star narrows a list, it does not partition it.
   */
  starredOnly: boolean;
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
 * The most rows one export writes.
 *
 * Far above any plausible hand-written archive, and low enough that the file is
 * built in memory without thinking about it. The result reports the match total
 * alongside the written count, so a user who somehow exceeds this is told the
 * export is partial rather than handed a silently short file.
 */
export const NOTE_EXPORT_MAX_ROWS = 5_000;

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
    starredOnly: record.starredOnly === true,
    limit,
    offset,
  };
}

export function readNoteInput(raw: unknown): LexiconNoteInput {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return {
    note: normalizeNoteText(record.note),
    tags: normalizeNoteTags(record.tags),
    // Strictly `=== true`: an absent field must read as "not starred" and never
    // as truthy-by-accident, because this value is written, not merely filtered.
    starred: record.starred === true,
  };
}

/**
 * True when there is nothing left to store.
 *
 * Clearing the text is how a note is deleted — an empty row would otherwise sit
 * in the table forever, and "the note is gone" and "the note is an empty string"
 * would be two states the reader cannot tell apart.
 *
 * A star counts as content. Without that clause, starring a word nobody has
 * written about would store a row and then immediately delete it, and the star
 * would silently fail on exactly the words it is most useful for.
 */
export function noteIsEmpty(input: LexiconNoteInput): boolean {
  return input.note.length === 0 && input.tags.length === 0 && !input.starred;
}

/** Tags are stored as one text column; this is the only place that shape is decided. */
export function serializeNoteTags(tags: readonly string[]): string {
  return tags.join('\n');
}

export function parseNoteTags(raw: unknown): string[] {
  return typeof raw === 'string' ? normalizeNoteTags(raw.split('\n')) : [];
}

/** Which notes to export: the same scope the browse list is showing, unpaged. */
export interface LexiconNoteExportQuery {
  lang: string;
  filter: string;
  starredOnly: boolean;
}

export interface LexiconNoteExportResult {
  ok: boolean;
  /** Where it landed. Absent unless `ok`. */
  path?: string;
  /** Rows written. */
  count: number;
  /** Rows that matched, which exceeds `count` only past `NOTE_EXPORT_MAX_ROWS`. */
  total: number;
  /** `'cancelled'` when the user dismissed the save dialog — not a failure. */
  error?: string;
}

/**
 * The export scope an untrusted caller asked for, clamped exactly like a page.
 *
 * Delegating to `readNoteListQuery` rather than restating the bounds is the
 * point: the export and the list must select the *same* rows, and two copies of
 * the trimming and case-folding rules would eventually disagree about which.
 */
export function readNoteExportQuery(raw: unknown): LexiconNoteExportQuery {
  const { lang, filter, starredOnly } = readNoteListQuery(raw);
  return { lang, filter, starredOnly };
}

const CSV_COLUMNS = ['language', 'word', 'reading', 'note', 'tags', 'starred', 'updated'] as const;

/**
 * One RFC 4180 field.
 *
 * Every field is quoted unconditionally: a note body routinely contains commas
 * and newlines, so the conditional form would quote almost everything anyway and
 * would leave one more rule to get subtly wrong.
 *
 * The leading apostrophe is not cosmetic. A cell whose first character is `=`,
 * `+`, `-` or `@` is a *formula* to every mainstream spreadsheet, so a real note
 * beginning "-> see also" opens as `#NAME?` and a crafted one would run on open.
 * The apostrophe is the standard defence and the spreadsheet hides it, at the
 * cost of that cell differing from the stored note by exactly one character —
 * which is why it is added only to fields that actually start that way.
 */
function csvField(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/**
 * The user's notes as a CSV document.
 *
 * Notes are the only thing in the Lexicon the user authored, so they are the one
 * thing whose loss cannot be undone by re-importing a source. CSV rather than
 * JSON because the neighbouring destinations on this track — a spreadsheet,
 * Flashcards, Anki — all read CSV, and the app already exports mined cards that
 * way.
 *
 * Tags go through `serializeNoteTags`, so the file carries the exact stored
 * shape rather than a second tag serialization invented here. Timestamps are
 * ISO 8601 rather than a localized date: an export outlives the locale that
 * wrote it, and `2026-08-14T…` is unambiguous everywhere `08/14/2026` is not.
 *
 * `starred` is `1`/`0` for the same reason: `yes`/`Да` would make the file's
 * meaning depend on the UI language that happened to be set when it was written.
 */
export function notesToCsv(notes: readonly LexiconNote[]): string {
  const rows = [CSV_COLUMNS.map(csvField).join(',')];
  for (const note of notes) {
    rows.push([
      note.lang,
      note.text,
      note.reading,
      note.note,
      serializeNoteTags(note.tags),
      note.starred ? '1' : '0',
      note.updatedAt > 0 ? new Date(note.updatedAt).toISOString() : '',
    ].map(csvField).join(','));
  }
  // CRLF between records is what RFC 4180 specifies. The LF inside a quoted note
  // body is the note's own and is deliberately left alone.
  return `${rows.join('\r\n')}\r\n`;
}
