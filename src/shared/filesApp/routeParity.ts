/**
 * Gate 6 — the Files app is not a gatekeeper.
 *
 * The plan's load-bearing constraint: "every route that works today keeps
 * working; a capability that becomes Files-app-only is a REGRESSION." That is
 * a claim about the whole application, so it cannot be checked by looking at
 * the Files app alone — it needs one row per capability the Files app offers,
 * each naming where that capability is *still* reachable without it.
 *
 * Three statuses, and the distinction between the first two is the whole point:
 *
 * - `preserved` — the capability existed before and still does elsewhere. The
 *   row names the section and a file+symbol that proves it, and the test
 *   re-derives both rather than restating them.
 * - `new` — the Files app is the FIRST surface for this capability. That is not
 *   a gate-6 failure: nothing was taken away. The `note` says what existed
 *   before, so "new" can never be used to paper over a removal.
 * - `migrated` — deliberately moved INTO the Files app and removed from its old
 *   home. This IS the failure condition in general, and the plan permits it for
 *   exactly one pair (decision 1: memory and statistics leave Settings, gate 8).
 *   `FILES_PERMITTED_MIGRATIONS` is that whitelist and nothing else may join it.
 *
 * As of gate 6 there are ZERO `migrated` rows: gate 8 has not landed, memory and
 * statistics are still in Settings, so no exception is being used yet.
 */
import type { DesktopWinSection } from '../desktop';

export type FilesParityStatus = 'preserved' | 'new' | 'migrated';

export interface FilesParityRow {
  /**
   * What is being checked. Either an enumerator `source` id — the capability
   * "see this store's rows" — or an `action:` id for an interactive control.
   */
  capability: string;
  status: FilesParityStatus;
  /**
   * The section this capability is still reachable in WITHOUT the Files app.
   * Required for `preserved`, and forbidden otherwise: a `new` or `migrated`
   * row that names a section is claiming a route it does not have.
   */
  section: DesktopWinSection | null;
  /** Repo-relative file that proves the route. Empty for non-`preserved`. */
  module: string;
  /** A string that file must contain. Empty for non-`preserved`. */
  symbol: string;
  /** One line. For `new`, what existed before instead. */
  note: string;
}

/**
 * The only capabilities allowed to leave their old home for the Files app.
 * Plan decision 1. Adding to this list is a product decision, not a repair.
 */
export const FILES_PERMITTED_MIGRATIONS: readonly string[] = ['memory', 'statistics'];

/**
 * Every i18n key that labels an interactive control in `FilesApp.tsx`.
 *
 * Kept here rather than inferred so that adding a control without recording its
 * route fails the test instead of passing silently. Column headers and tree
 * nodes are built from template keys and are navigation, not actions — the
 * capability they expose is covered by the per-source rows below.
 */
export const FILES_APP_CONTROL_KEYS: readonly string[] = [
  'filesApp.search.label',
  'filesApp.search.placeholder',
  'filesApp.sort.label',
  'filesApp.sort.asc',
  'filesApp.sort.desc',
  'filesApp.action.refresh',
  'filesApp.action.refreshing',
  'filesApp.action.retry',
  'filesApp.action.reveal',
  'filesApp.action.mine',
  'filesApp.action.mining',
  'filesApp.action.undoMine',
  'filesApp.entry.scoped',
];

export const FILES_ROUTE_PARITY: readonly FilesParityRow[] = [
  /* ------------------------- the twenty stores ------------------------- */
  {
    capability: 'library',
    status: 'preserved',
    section: 'library',
    module: 'src/renderer/views/LibraryView.tsx',
    symbol: 'LibraryView',
    note: 'Books and their covers still open from the Library section.',
  },
  {
    capability: 'media',
    status: 'preserved',
    section: 'player',
    module: 'src/renderer/views/MediaCenterView.tsx',
    symbol: 'MediaCenterView',
    note: 'The media library is the Media Center shell, unchanged.',
  },
  {
    capability: 'transcripts',
    status: 'new',
    section: null,
    module: '',
    symbol: '',
    note:
      'yt-transcripts/<id>.json was WRITE-ONLY before this: ytPlaylists.ts uses transcriptPath '
      + 'to write (yt:markTranscribed) and to existsSync a "transcribed" flag, and never reads the '
      + 'cues back. In-session the same cues are live in MediaContent state and mineable through '
      + 'the player panel; after a restart nothing could reach them. Files is the first reader.',
  },
  {
    capability: 'yt-subs',
    status: 'preserved',
    section: 'video',
    module: 'src/renderer/views/MediaCenterView.tsx',
    symbol: 'MediaCenterView',
    note: 'Cached YouTube captions are still selected and played by the video shell.',
  },
  {
    capability: 'subtitles',
    status: 'preserved',
    section: 'video',
    module: 'src/renderer/views/MediaCenterView.tsx',
    symbol: 'MediaCenterView',
    note: 'Sidecar subtitles still load through the player subtitle picker.',
  },
  {
    capability: 'downloads',
    status: 'preserved',
    section: 'video',
    module: 'src/renderer/views/MediaCenterView.tsx',
    symbol: 'MediaCenterView',
    note: 'downloads/ is written by main/media.ts and browsed from the Media Center.',
  },
  {
    capability: 'decks',
    status: 'preserved',
    section: 'anki',
    module: 'src/renderer/views/AnkiView.tsx',
    symbol: 'AnkiView',
    note: 'Anki decks and .apkg packages still open in the deck workbench.',
  },
  {
    capability: 'drafts',
    status: 'preserved',
    section: 'anki',
    module: 'src/renderer/views/AnkiView.tsx',
    symbol: 'AnkiView',
    note: 'Draft sessions are listed and discarded from the workbench (ankiDraftSessionList).',
  },
  {
    capability: 'exports',
    status: 'preserved',
    section: 'scraper',
    module: 'src/renderer/views/ScraperView.tsx',
    symbol: 'ScraperView',
    note: 'Exports are produced here and main/scraper/exports.ts already reveals them.',
  },
  {
    capability: 'dictionaries',
    status: 'preserved',
    section: 'dictionary',
    module: 'src/renderer/views/DictionaryView.tsx',
    symbol: 'DictionaryView',
    note: 'Installed dictionaries are still managed from the Dictionary section.',
  },
  {
    capability: 'models',
    status: 'preserved',
    section: 'settings',
    module: 'src/renderer/components/settings/settingsRegistry.ts',
    symbol: 'whisper-models',
    note: 'Whisper tiers and translator GGUFs are still downloaded/removed in Settings.',
  },
  {
    capability: 'artwork',
    status: 'preserved',
    section: 'settings',
    module: 'src/main/library.ts',
    symbol: 'wallLibDir',
    note: 'wallpapers/, covers/ and artwork/ are still picked through the wall settings.',
  },
  {
    capability: 'profiles',
    status: 'preserved',
    section: 'settings',
    module: 'src/renderer/components/settings/settingsRegistry.ts',
    symbol: 'profile-rules',
    note: 'profiles.json is still edited from the Settings profile pages.',
  },
  {
    capability: 'workspaces',
    status: 'preserved',
    section: 'agent',
    module: 'src/renderer/components/agent/AgentWorkspaceShell.tsx',
    symbol: 'AgentWorkspaceShell',
    note: 'Agent conversations, archived ones included, still open in the Agent shell.',
  },
  {
    capability: 'scraper-jobs',
    status: 'preserved',
    section: 'scraper',
    module: 'src/renderer/views/ScraperView.tsx',
    symbol: 'ScraperView',
    note: 'Scrape history is still browsed from the Scraper section.',
  },
  {
    capability: 'transcribe-queue',
    status: 'preserved',
    section: 'player',
    module: 'src/renderer/components/media/StudyOrchestratorWorkspace.tsx',
    symbol: 'StudyOrchestratorWorkspace',
    note: 'Queued transcriptions are still driven and cancelled from the orchestrator.',
  },
  {
    capability: 'reading-lens',
    status: 'preserved',
    section: 'reading',
    module: 'src/renderer/views/ReadingWorkspaceView.tsx',
    symbol: 'ReadingWorkspaceView',
    note: 'Reading Lens captures still open from the reading workspace.',
  },
  {
    capability: 'notebook',
    status: 'preserved',
    section: 'notebook',
    module: 'src/renderer/views/NotebookView.tsx',
    symbol: 'NotebookView',
    note:
      'Still the Notebook section as of gate 6. Gate 7 deletes it and absorbs its features; '
      + 'this row is what will have to change to `migrated` then, and the change is the gate.',
  },
  {
    capability: 'local-deck',
    status: 'preserved',
    section: 'flashcards',
    module: 'src/renderer/components/flashcards/FlashcardsContent.tsx',
    symbol: 'removeBookDeck',
    note: 'The local deck is still browsed, foldered and deleted in Flashcards.',
  },
  {
    capability: 'highlights',
    status: 'preserved',
    section: 'novels',
    module: 'src/renderer/views/NovelReader.tsx',
    symbol: 'loadAnnotations',
    note: 'Highlights still render and delete inside the book they were made in.',
  },

  /* --------------------------- the actions ---------------------------- */
  {
    capability: 'action:reveal',
    status: 'new',
    section: null,
    module: '',
    symbol: '',
    note:
      'No per-item "show in folder" existed. shell.showItemInFolder was reachable only after a '
      + 'scraper export (main/scraper/exports.ts), and desktop:launch opens a file the user had '
      + 'already picked in a native dialog. Nothing lost it; the Files app added it.',
  },
  {
    capability: 'action:mine.book',
    status: 'preserved',
    section: 'flashcards',
    module: 'src/renderer/components/flashcards/FlashcardsContent.tsx',
    symbol: 'EpubMiningSimplePanel',
    note: 'Epub mining is unchanged in Flashcards, and in Blanc via BlancShell.',
  },
  {
    capability: 'action:mine.subtitle',
    status: 'preserved',
    section: 'video',
    module: 'src/media/VideoCoreStudyOverlay.tsx',
    symbol: 'VideoCoreMiningPanel',
    note: 'Cue mining from the player overlay is untouched.',
  },
  {
    capability: 'action:mine.transcript',
    status: 'new',
    section: null,
    module: '',
    symbol: '',
    note: 'Same as the transcripts row: no reader existed once the session that made it ended.',
  },
  {
    capability: 'action:undoMine',
    status: 'preserved',
    section: 'flashcards',
    module: 'src/renderer/components/flashcards/FlashcardsContent.tsx',
    symbol: 'removeBookDeck',
    note: 'Removing cards from the local deck was already a Flashcards action.',
  },
  {
    capability: 'action:sort',
    status: 'new',
    section: null,
    module: '',
    symbol: '',
    note: 'List-local ordering of the Files list. Every store keeps its own ordering controls.',
  },
  {
    capability: 'action:search',
    status: 'new',
    section: null,
    module: '',
    symbol: '',
    note: 'Cross-store search. Per-store search (dictionary, library, decks) is unchanged.',
  },
  {
    capability: 'action:scope',
    status: 'new',
    section: null,
    module: '',
    symbol: '',
    note: 'Narrows the Files list. Additive: gate 5 added a menu item, removed no route.',
  },
  {
    capability: 'action:refresh',
    status: 'new',
    section: null,
    module: '',
    symbol: '',
    note: 'Rebuilds the Files index cache. No other surface has an index to rebuild.',
  },
];

/** Rows that would fail gate 6 if any existed outside the permitted whitelist. */
export function filesParityViolations(
  rows: readonly FilesParityRow[] = FILES_ROUTE_PARITY,
): FilesParityRow[] {
  return rows.filter(
    (row) => row.status === 'migrated' && !FILES_PERMITTED_MIGRATIONS.includes(row.capability),
  );
}

export function filesParityRow(capability: string): FilesParityRow | undefined {
  return FILES_ROUTE_PARITY.find((row) => row.capability === capability);
}
