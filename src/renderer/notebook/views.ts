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
  captures: ['extension', 'audio', 'clipboard'],
};

/** Streams shown by a view; `overview` returns every stream. */
export function streamsForView(view: NotebookViewId, all: NotebookStream[]): NotebookStream[] {
  return view === 'overview' ? all : VIEW_STREAMS[view];
}
