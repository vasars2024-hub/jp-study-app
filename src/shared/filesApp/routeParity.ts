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
 *   home. This IS the failure condition in general, and the plan permits it only
 *   for capabilities on `FILES_PERMITTED_MIGRATIONS`.
 *
 * As of gate 8 there are TWO `migrated` rows: `notebook`, and the system panel
 * `panel:system/memory` that plan decision 1 moved out of Settings.
 *
 * **The rule that decides `preserved` vs `migrated`, made explicit at gate 7b:**
 * a route counts as preserved only if it exists in the DEFAULT shell. Blanc is
 * an opt-in alternative shell (`blancMode`, off until the user enables it), so a
 * capability whose only surviving route is a Blanc tool is `migrated`, not
 * `preserved`. Without that rule `notebook` could have been scored `preserved`
 * on Blanc's untouched `notebook` tool and the whole deletion would have gone
 * unrecorded — which is precisely the regression this table exists to catch.
 */
import type { DesktopWinSection } from '../desktop';

export type FilesParityStatus = 'preserved' | 'new' | 'migrated';

export interface FilesParityRow {
  /**
   * What is being checked. Three shapes, and the prefix is what tells them
   * apart:
   *
   * - a bare enumerator `source` id — the capability "see this store's rows".
   *   These are pinned 1:1 against the two enumerator registries, so a bare id
   *   that is not a real `source:` literal fails the test.
   * - `action:<id>` — an interactive control in the Files list.
   * - `panel:<categoryId>` — a whole system panel the Files app hosts at one of
   *   its leaves (gate 8's memory and statistics).
   *
   * The prefixed forms are deliberately NOT enumerator sources, which is why
   * `isEnumeratorCapability` excludes anything carrying a colon: adding them
   * bare would break the 1:1 equality and its own negative control.
   */
  capability: string;
  status: FilesParityStatus;
  /**
   * The section this capability is still reachable in WITHOUT the Files app.
   * Required for `preserved`, and forbidden otherwise: a `new` or `migrated`
   * row that names a section is claiming a route it does not have.
   *
   * `'global'` is for a surface mounted outside the section switch — a desktop
   * widget, or a panel `App.tsx` renders on every screen. It is a STRONGER
   * claim than naming one section, not a weaker one, so the module+symbol are
   * still required; only the `AppSection` case lookup is skipped, because there
   * is no case to look up.
   */
  section: DesktopWinSection | 'global' | null;
  /** Repo-relative file that proves the route. Empty for non-`preserved`. */
  module: string;
  /** A string that file must contain. Empty for non-`preserved`. */
  symbol: string;
  /** One line. For `new`, what existed before instead. */
  note: string;
}

/**
 * The only capabilities allowed to leave their old home for the Files app.
 * Adding to this list is a product decision, not a repair.
 *
 * - `panel:system/memory` — plan decision 1, gate 8: the Settings "Memory" page
 *   is deleted and the Files app is its only home. Recorded with the `panel:`
 *   prefix rather than a bare `memory` because the bare form is reserved for
 *   enumerator sources; see `FilesParityRow.capability`.
 *
 *   Decision 1 names "memory and statistics", but only memory is here, and the
 *   difference is measured rather than assumed: statistics never had a Settings
 *   page. Its home is the top-level `stats` section, which gate 8 did not touch
 *   (`AppSection.tsx` still routes `case 'stats'` to `StatisticsView`), so
 *   `panel:system/statistics` is `preserved` and needs no permission. Listing it
 *   here anyway would license a future removal of the Statistics section that
 *   nobody decided.
 * - `notebook` — gate 7b. Distinct from the pair above in kind, not in degree:
 *   memory and statistics are moved out of a Settings page that still exists,
 *   whereas the Notebook's HOST is deleted. `FILES_APP_PLAN.md` opens with "a
 *   folder application that REPLACES the Notebook section (deleted, its features
 *   absorbed)", so the deletion is the user's instruction and the Files app is
 *   where the material went. The status is still recorded rather than waived:
 *   the row below has to name what survives elsewhere, and gate 7b's evidence
 *   has to show each absorbed feature landing somewhere real.
 */
export const FILES_PERMITTED_MIGRATIONS: readonly string[] = [
  'panel:system/memory',
  'notebook',
];

/**
 * True for the rows that must line up 1:1 with an enumerator `source` id.
 *
 * Exported so the test and the table cannot drift apart on what counts: the
 * equality it guards is the only thing stopping a store from being enumerated
 * in the Files app with no route recorded for it anywhere.
 */
export function isEnumeratorCapability(capability: string): boolean {
  return !capability.includes(':');
}

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
  'filesApp.action.open',
  'filesApp.action.opening',
  /*
   * Named `action.openCancel` and not `open.chooseCancel` on purpose: the guard
   * over this list scans for `filesApp.(action|sort|search|entry).*`, so a
   * button parked under any other prefix is a control the list cannot account
   * for. The rest of the `filesApp.open.*` family is prose, not controls.
   */
  'filesApp.action.openCancel',
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
    status: 'migrated',
    section: null,
    module: '',
    symbol: '',
    note:
      'Gate 7b deleted the Notebook section (AppSection case, NotebookView.tsx, and every '
      + 'registry entry); shared/desktop.ts aliases the id to `files` so persisted layouts, '
      + '--open=notebook, OS hotkeys and the browser extension all still land somewhere real. '
      + 'What migrated is the AGGREGATED timeline and its lineage chains — Blanc keeps both, '
      + 'from the same NotebookContent components, but Blanc is opt-in so that is not a default '
      + 'route and this is honestly `migrated`. Its streams did not migrate: saved-words, '
      + 'lookups, translations, known-words, clipboard, highlights and local-deck each keep '
      + 'their own preserved row above. Live captions did not migrate either — gate 7b/1 moved '
      + 'LiveCaptionsPanel to ReadingCapturesView, deliberately NOT into the Files app.',
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
  {
    capability: 'saved-words',
    status: 'preserved',
    section: 'flashcards',
    module: 'src/renderer/components/flashcards/FlashcardsContent.tsx',
    symbol: 'loadSaved',
    note: 'Saved words are still listed and turned into cards in Flashcards.',
  },
  {
    capability: 'lookups',
    status: 'preserved',
    section: 'global',
    module: 'src/renderer/widgets/system.tsx',
    symbol: 'loadLookupHistory',
    note: 'Recent Lookups is a desktop widget, reachable from every section, not one.',
  },
  {
    capability: 'translations',
    status: 'preserved',
    section: 'translate',
    module: 'src/renderer/components/translate/TranslateContent.tsx',
    symbol: 'loadTranslationHistory',
    note: 'Translation history is still shown by the Translate app itself.',
  },
  {
    capability: 'known-words',
    status: 'preserved',
    section: 'stats',
    module: 'src/renderer/components/stats/StatsContent.tsx',
    symbol: 'knowledgeCounts',
    note: 'Statistics still counts them per level, and the dictionary still marks them.',
  },
  {
    capability: 'clipboard',
    status: 'preserved',
    section: 'global',
    module: 'src/renderer/components/ClipboardHistoryPanel.tsx',
    symbol: 'loadClipboardHistory',
    note: 'App.tsx mounts the clipboard panel on every screen; Blanc mounts it too.',
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
    capability: 'action:open',
    status: 'new',
    section: null,
    module: '',
    symbol: '',
    note:
      'Gate 10. No route lost anything here: the file router already existed, but only a DROP '
      + 'could reach it (DropRouter.tsx, on a dragenter), so there was no way to ask "which app '
      + 'owns this file" about a file already in the app. The Files app added the question. What '
      + 'it deliberately did NOT add is a second import path — shared/filesApp/openPlan.ts maps a '
      + 'DropTargetId to the section DropRouter itself opens and calls no importer, so opening an '
      + 'indexed row cannot create a duplicate of it.',
  },
  {
    capability: 'action:mine.book',
    status: 'preserved',
    section: 'flashcards',
    module: 'src/renderer/components/flashcards/FlashcardsContent.tsx',
    symbol: 'EpubMiningSimplePanel',
    note:
      'Epub mining is unchanged in Flashcards, and in Blanc via BlancShell. MINING gate 10 '
      + 'added a fourth Mining tab (the catalogue) BESIDE Simple/Advanced/Jiten rather than in '
      + 'place of any of them, which is why this row still re-derives from the same symbol.',
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
    note:
      'Same as the transcripts row: no reader existed once the session that made it ended. Still '
      + 'scored `new` after MINING gate 10 — the gate gave it a SECOND route (Flashcards -> '
      + 'Mining -> Catalogue, which imports the same filesMineChain), so it is no longer '
      + 'Files-app-only, but it did not exist before the Files app and calling it `preserved` '
      + 'would claim a history it does not have.',
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

  /* ------------------------ the system panels ------------------------- */
  {
    capability: 'panel:system/memory',
    status: 'migrated',
    section: null,
    module: '',
    symbol: '',
    note:
      'Plan decision 1, gate 8: the Settings "Memory" page is deleted '
      + '(MemoryPage.tsx removed, `memory` out of SETTINGS_NAV and the page switch) and '
      + 'FilesMemoryPanel at the `system/memory` leaf is its only home. This is the ONE '
      + 'exception the user made to the not-a-gatekeeper rule, and it is recorded as a '
      + 'migration rather than waived. What did NOT go with it: the nine registry entries '
      + 'are kept and carry `movedTo: \'files\'`, so every Settings search term that used '
      + 'to reach these cards — "factory reset" included — still matches and is redirected '
      + 'by SettingsApp.navigate to the Files app at the same card id. Losing a search term '
      + 'would be a capability lost, not moved.',
  },
  {
    capability: 'panel:system/statistics',
    status: 'preserved',
    section: 'stats',
    module: 'src/renderer/views/StatisticsView.tsx',
    symbol: 'StatisticsView',
    note:
      'Decision 1 names statistics alongside memory, but statistics never had a Settings '
      + 'page to lose: its home is the top-level `stats` section, which gate 8 left alone — '
      + "AppSection.tsx still routes `case 'stats'` to StatisticsView, and that view is what "
      + 'this row re-derives. The Files panel is an additional route over the same '
      + 'StatsContent readers (useStats / StatsCards / StatsChart / StatsBooks / StatsShows / '
      + 'WordKnowledge), so nothing migrated and no permission is owed.',
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

/**
 * What the Files app must SAY, per item, about the route that still exists
 * without it.
 *
 * The table above is gate 6's evidence and until now only a test read it, so
 * the anti-gatekeeper promise — "every route that works today keeps working;
 * a capability that becomes Files-app-only is a REGRESSION" — was true in the
 * repository and invisible in the product. A user looking at a row in Files
 * had no way to learn that the same material is one click away in Library, and
 * the two capabilities that genuinely did move had no way to say so either.
 * This is the reader that closes that gap; `FilesApp.tsx`'s inspector renders
 * it beside the item's source.
 *
 * Four outcomes, and the distinctions are the point:
 *
 * - `section` — preserved, reachable in exactly one app. The caller labels it
 *   with `palette.section.<id>`, the same app-name family the Start menu and
 *   the command palette use, so Files cannot invent a twenty-sixth app name.
 * - `global` — preserved, mounted outside the section switch. A STRONGER claim
 *   than naming one section (the row doc says so), so it gets its own arm
 *   rather than being flattened into "reachable somewhere".
 * - `only-here` — `migrated`. Files IS the only home now. Saying nothing here
 *   would be the dishonest arm: an item with no line would read exactly like an
 *   item whose line had not loaded.
 * - `null` — `new`, or a capability the table does not carry. `new` has no
 *   prior route to name, and an unknown capability must not be given one; both
 *   render nothing rather than a claim that cannot be checked.
 *
 * `status: 'preserved'` with a null section is impossible by the table's own
 * invariant (the test pins it), but it is handled as `null` rather than thrown:
 * an inspector is not the place to discover a data defect, and the test is.
 */
export type FilesReachability =
  | { kind: 'section'; section: DesktopWinSection }
  | { kind: 'global' }
  | { kind: 'only-here' };

export function filesReachability(capability: string): FilesReachability | null {
  const row = filesParityRow(capability);
  if (!row) return null;
  if (row.status === 'migrated') return { kind: 'only-here' };
  if (row.status !== 'preserved') return null;
  if (row.section === 'global') return { kind: 'global' };
  if (row.section === null) return null;
  return { kind: 'section', section: row.section };
}
