/**
 * Which Notebook timeline rows are the learner's notes — the part of
 * `userNotes.ts` the boot path needs.
 *
 * `appendNotebookEvent` (renderer/notebookActivity.ts) runs at startup, from the
 * extension bridge and the analysis actions, and must decide synchronously
 * whether an entry is a note (kept in full by the notes store) or an automatic
 * event (the capped activity list). That decision is all it needs; the rest of
 * `userNotes.ts` (normalising, search, history, export/import, Markdown) loads
 * with the notes store. `userNotes.ts` re-exports everything here.
 */

/** The automatic activity timeline's cap. Applies to automatic events only. */
export const ACTIVITY_TIMELINE_CAP = 500;
/** Free-standing notes written in the Notes app. */
export const USER_NOTE_STREAM = 'notes';

/** The shape of a Notebook timeline row, structurally (the renderer type narrows `stream`). */
export interface NoteEntryLike {
  id: string;
  stream: string;
  title: string;
  detail?: string;
  folder?: string;
  ts: number;
  origin?: 'app' | 'extension';
  href?: string;
  meta?: Record<string, string | number | boolean | undefined>;
}

/**
 * Streams only the app itself writes, from an action (a mine, a completed
 * translation, an OCR capture). Everything else in the old timeline is
 * something the learner chose to keep.
 */
const AUTOMATIC_STREAMS: ReadonlySet<string> = new Set([
  'saved-words',
  'lookups',
  'flashcards',
  'anki',
  'mining',
  'known',
  'translations',
  'plan',
  'ocr',
  'audio',
  'clipboard',
  'extension',
  'transcript',
]);

/** The longest detail any automatic writer stores (extension mines cut at 400). */
const AUTOMATIC_DETAIL_MAX = 400;

/**
 * Is this timeline row a note the learner wrote or saved, rather than an
 * automatic event?
 *
 * Deliberately generous: a note kept in the notes store by mistake costs one
 * row in the Notes app; an event mistaken for a note costs nothing; a NOTE
 * mistaken for an event is deleted 500 events later. So anything not provably
 * automatic is a note:
 * - an explicit `meta.userNote`, or a saved translation (`meta.translationId`);
 * - any stream that is not on the automatic list (highlights / analysis
 *   snapshots, media-assistant notes, Notes-app notes, unknown or missing);
 * - a body longer than any automatic writer produces (it was edited by hand).
 */
export function isUserNoteEntry(entry: Partial<NoteEntryLike> | null | undefined): boolean {
  if (!entry) return false;
  const meta = entry.meta;
  if (meta && (meta.userNote === true || typeof meta.translationId === 'string')) return true;
  if (typeof entry.stream !== 'string' || !AUTOMATIC_STREAMS.has(entry.stream)) return true;
  return typeof entry.detail === 'string' && entry.detail.length > AUTOMATIC_DETAIL_MAX;
}
