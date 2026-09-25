import type { NotebookStream } from '../notebookTimeline';

export type NotebookViewId =
  | 'overview'
  | 'library'
  | 'words'
  | 'translations'
  | 'highlights'
  | 'captures';

export const NOTEBOOK_VIEWS: NotebookViewId[] = [
  'overview',
  'library',
  'words',
  'translations',
  'highlights',
  'captures',
];

/**
 * Which streams each named view owns.
 *
 * This is a *partition*: every stream belongs to exactly one view, so no entry
 * is unreachable and none is counted twice. `overview` is deliberately absent —
 * it shows everything rather than owning streams. `notebookViewPartition` in
 * the tests is what actually holds this property; adding a stream without
 * assigning it here fails there rather than silently hiding it in the UI.
 */
export const VIEW_STREAMS: Record<Exclude<NotebookViewId, 'overview'>, NotebookStream[]> = {
  // Things to read, and reading material the app has processed.
  library: ['plan', 'ocr'],
  // Vocabulary in every state: looked up, saved, carded, exported, learned.
  words: ['saved-words', 'lookups', 'flashcards', 'anki', 'mining', 'known'],
  translations: ['translations'],
  highlights: ['highlights'],
  // Everything that arrived from outside the app's own reading flow.
  captures: ['extension', 'audio', 'clipboard', 'media', 'transcript'],
};

/**
 * Every stream, in chip order. A `Record` over the union, so a stream added to
 * `NotebookStream` without a place here fails to compile — the list in
 * `NotebookContent` was a hand-kept copy, and `media` was missing from it (and
 * from `VIEW_STREAMS`) for as long as the media assistant has written notes.
 */
const STREAM_ORDER: Record<NotebookStream, number> = {
  'saved-words': 0,
  lookups: 1,
  flashcards: 2,
  anki: 3,
  mining: 4,
  known: 5,
  translations: 6,
  plan: 7,
  highlights: 8,
  ocr: 9,
  audio: 10,
  clipboard: 11,
  extension: 12,
  media: 13,
  transcript: 14,
};

export const ALL_NOTEBOOK_STREAMS: NotebookStream[] = (Object.keys(STREAM_ORDER) as NotebookStream[]).sort(
  (a, b) => STREAM_ORDER[a] - STREAM_ORDER[b],
);

/** Streams shown by a view; `overview` returns every stream. */
export function streamsForView(view: NotebookViewId, all: NotebookStream[]): NotebookStream[] {
  return view === 'overview' ? all : VIEW_STREAMS[view];
}
