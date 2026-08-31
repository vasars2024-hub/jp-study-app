/**
 * Gate 7 — where each Notebook stream went when the section was deleted.
 *
 * `routeParity.ts` answers gate 6 at the granularity of a *store*: one row per
 * enumerator source. That granularity is too coarse for gate 7, because the
 * Notebook was not a store — it was an aggregation of fourteen streams drawn
 * from eleven different places, and "the notebook row is migrated" says nothing
 * about which of those fourteen still has a home. This table is the finer
 * question, and it is deliberately two independent columns:
 *
 * - `source` — the Files enumerator that INDEXES this stream, or `null`. A null
 *   is a real gap in the index and is reported as one; it is not a failure of
 *   gate 7, because the index is not how a user reaches their material.
 * - `route` — the section that still SHOWS this stream without the Files app.
 *   This one may never be null. A stream with no route is a capability the
 *   deletion destroyed, which is the gate-7 FINDING the plan asks for.
 *
 * Splitting them is the whole point. Collapsing to one column would let a
 * stream that is indexed but unreachable, or reachable but unindexed, score the
 * same as one that is both — and those are three different products.
 */
import type { DesktopWinSection } from '../desktop';

/**
 * The Notebook's stream vocabulary, duplicated from
 * `renderer/notebookTimeline.ts` rather than imported: that module is renderer
 * code and this one is shared, and the test re-derives the two lists against
 * each other, so a stream added there without a row here fails.
 */
export type NotebookStreamId =
  | 'saved-words'
  | 'lookups'
  | 'flashcards'
  | 'anki'
  | 'mining'
  | 'known'
  | 'translations'
  | 'plan'
  | 'highlights'
  | 'ocr'
  | 'audio'
  | 'clipboard'
  | 'extension'
  | 'media'
  | 'transcript';

export interface NotebookStreamAbsorption {
  stream: NotebookStreamId;
  /** Files enumerator `source` id that indexes it, or `null` when none does. */
  source: string | null;
  /** The section that still shows it without the Files app. Never null. */
  route: DesktopWinSection;
  /** A file in `route`'s implementation that proves the route, checked by test. */
  module: string;
  /** A string that file must contain. */
  symbol: string;
  note: string;
}

export const NOTEBOOK_STREAM_ABSORPTION: readonly NotebookStreamAbsorption[] = [
  {
    stream: 'saved-words',
    source: 'saved-words',
    route: 'flashcards',
    module: 'src/renderer/components/flashcards/FlashcardsContent.tsx',
    symbol: 'loadSaved',
    note: 'Indexed as highlights; still listed and carded in Flashcards.',
  },
  {
    stream: 'lookups',
    source: 'lookups',
    route: 'dictionary',
    module: 'src/renderer/widgets/system.tsx',
    symbol: 'loadLookupHistory',
    note: 'Recent Lookups is a desktop widget, so it is reachable from every section.',
  },
  {
    stream: 'flashcards',
    source: 'local-deck',
    route: 'flashcards',
    module: 'src/renderer/components/flashcards/FlashcardsContent.tsx',
    symbol: 'removeBookDeck',
    note: 'One of four views of jp-flashcard-deck; the deck itself is unchanged.',
  },
  {
    stream: 'anki',
    source: 'local-deck',
    route: 'anki',
    module: 'src/renderer/views/AnkiView.tsx',
    symbol: 'AnkiView',
    note: 'Deck cards already synced to Anki. The mirror is browsed in the workbench.',
  },
  {
    stream: 'mining',
    source: 'local-deck',
    route: 'flashcards',
    module: 'src/renderer/components/flashcards/FlashcardsContent.tsx',
    symbol: 'removeBookDeck',
    note: 'The bulk of the timeline. Files files these under outputs/mined (gate 1 decision 1).',
  },
  {
    stream: 'known',
    source: 'known-words',
    route: 'stats',
    module: 'src/renderer/components/stats/StatsContent.tsx',
    symbol: 'knowledgeCounts',
    note: 'Statistics still counts them per level; the dictionary still marks them.',
  },
  {
    stream: 'translations',
    source: 'translations',
    route: 'translate',
    module: 'src/renderer/components/translate/TranslateContent.tsx',
    symbol: 'loadTranslationHistory',
    note: 'The Translate app shows its own history; the Notebook only mirrored it.',
  },
  {
    stream: 'plan',
    source: null,
    route: 'novels',
    module: 'src/renderer/views/NovelsView.tsx',
    symbol: 'NovelsView',
    note:
      'NOT INDEXED. The Jiten "plan to read" store has no Files enumerator — it is the one '
      + 'Notebook stream the index cannot see. Not a gate-7 regression: the stream\'s own href '
      + 'always pointed at Novels, which still owns it, so no route was lost. Recorded as an '
      + 'index gap for a later enumerator rather than closed over.',
  },
  {
    stream: 'highlights',
    source: 'highlights',
    route: 'novels',
    module: 'src/renderer/views/NovelReader.tsx',
    symbol: 'loadAnnotations',
    note: 'Highlights still render and delete inside the book they were made in.',
  },
  {
    stream: 'ocr',
    source: 'library',
    route: 'library',
    module: 'src/renderer/views/LibraryView.tsx',
    symbol: 'LibraryView',
    note:
      'Derived from a library item\'s ocrMeta, so the object indexed is the book, not a '
      + 'separate note. The Library owns both the item and the OCR progress it reports.',
  },
  {
    stream: 'audio',
    source: 'local-deck',
    route: 'flashcards',
    module: 'src/renderer/components/flashcards/FlashcardsContent.tsx',
    symbol: 'removeBookDeck',
    note: 'Deck cards in the audio folder or carrying audioDataUrl. Same store as mining.',
  },
  {
    stream: 'clipboard',
    source: 'clipboard',
    route: 'library',
    module: 'src/renderer/components/ClipboardHistoryPanel.tsx',
    symbol: 'loadClipboardHistory',
    note: 'App.tsx mounts the clipboard panel on every screen, and Blanc mounts it too.',
  },
  {
    stream: 'extension',
    source: 'library',
    route: 'library',
    module: 'src/renderer/views/LibraryView.tsx',
    symbol: 'LibraryView',
    note: 'Derived from a library item\'s inboxMeta — the Reader Inbox row itself is indexed.',
  },
  {
    stream: 'media',
    source: 'media',
    route: 'player',
    module: 'src/renderer/views/MediaCenterView.tsx',
    symbol: 'MediaCenterView',
    note:
      'DEAD VALUE, found while writing this table: `media` is in NotebookStream\'s union but '
      + 'not in NotebookContent\'s STREAM_KEYS, so no view ever asked for it and no aggregator '
      + 'ever emitted one. Rowed anyway rather than skipped — a stream the deletion audit '
      + 'quietly omitted is exactly what this table exists to prevent.',
  },
  {
    stream: 'transcript',
    source: null,
    route: 'reading',
    module: 'src/renderer/views/ReadingCapturesView.tsx',
    symbol: 'LiveCaptionsPanel',
    note:
      'NOT INDEXED, and deliberately: a live-caption script is main-process state behind '
      + 'liveCaptions:scripts, and gate 7b/1 moved the panel that reads AND arms it to the '
      + 'Reading captures surface. Putting the arming control in the Files app instead would '
      + 'have made an existing capability Files-app-only, which gate 6 forbids.',
  },
];

/**
 * Streams the Files index cannot see. Not an error — the caller decides. Gate 7
 * requires this to be *reported*, not to be empty.
 */
export function unindexedNotebookStreams(
  rows: readonly NotebookStreamAbsorption[] = NOTEBOOK_STREAM_ABSORPTION,
): NotebookStreamAbsorption[] {
  return rows.filter((row) => row.source === null);
}
