/**
 * Blanc's media and flashcards tab surfaces.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OWNERSHIP: this file belongs to the **Media & Cards** work stream.
 * The Library & Arcade stream must not edit it. See BLANC_REFINEMENT_PLAN.md,
 * "Parallel split".
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pillar 0: never mount a Study OS `*View` inside Blanc. `BlancMediaPanel`
 * composes `media/MediaContent.tsx` in Blanc chrome. `AppChrome`, `MenuBar`,
 * and `StatusBar` must never be imported here. New CSS goes in
 * `theme/blanc-media.css`, using the existing Blanc tokens.
 *
 * `BlancFlashcardsPanel` is still a `BlancViewHost` embed — the remaining
 * Pillar 0 violation in this stream.
 */
import {
  MediaEmptyLibrary,
  MediaFolderNav,
  MediaGenerationStatus,
  MediaGrid,
  MediaKindFilter,
  MediaLibraryActions,
  MediaLookupPopup,
  MediaPlayerStage,
  MediaSearchBox,
  MediaTranscriptionControls,
  MediaWatchFolder,
  MediaYoutubeBar,
  useMedia,
} from '../media/MediaContent';
import {
  FlashcardAiMode,
  FlashcardCsvMode,
  FlashcardDeckOverview,
  FlashcardMiningMode,
  FlashcardReviewMode,
  useFlashcards,
} from '../flashcards/FlashcardsContent';

// This panel renders Study OS class names, whose rules live in styles.css.
// Imported here rather than in the boot entry so the 468 KB sheet rides this
// lazy chunk instead of Blanc's boot. See theme/studyos-compat.css.
void import('../../theme/studyos-compat.css');

/**
 * Pillar 0 fix for the `player` / `video` tab bail-out, which mounted
 * `MediaView` (and therefore `AppChrome`) inside `BlancViewHost`.
 *
 * Runs in `'full'` mode so Blanc's single Media tab keeps both the player and
 * the library, matching what the embed used to show. The library grid stays on
 * `VirtualGrid` — see `.blanc-media-grid` in `theme/blanc-media.css` for the
 * bounded height it needs to measure against.
 */
export function BlancMediaPanel() {
  const state = useMedia('full');
  const { items, current, cues, src, subName, genState, generating } = state;

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Source</legend>
        <div className="blanc-command-row">
          <button type="button" onClick={() => void state.openFile()}>
            Open file…
          </button>
          <button type="button" onClick={() => void state.openSubs()} disabled={!src}>
            {subName && genState !== 'done' ? `Subs: ${subName}` : 'Load subtitles…'}
          </button>
          <button
            type="button"
            onClick={() => src && void state.runGeneration(src)}
            disabled={!src || generating}
          >
            Generate subtitles
          </button>
        </div>
        <div className="blanc-status-row">
          <span>{items.length} items</span>
          <span>{current ? current.title : 'Nothing loaded'}</span>
          {cues.length > 0 && <span>{cues.length} subtitle lines</span>}
        </div>
        <MediaWatchFolder state={state} />
      </fieldset>

      <fieldset>
        <legend>Transcription</legend>
        <div className="blanc-command-row">
          <MediaTranscriptionControls state={state} />
        </div>
        <MediaGenerationStatus state={state} />
      </fieldset>

      <fieldset>
        <legend>From YouTube</legend>
        <MediaYoutubeBar state={state} />
      </fieldset>

      {src && (
        <fieldset>
          <legend>Player</legend>
          <MediaPlayerStage state={state} />
        </fieldset>
      )}

      <fieldset>
        <legend>Library</legend>
        {items.length === 0 ? (
          <MediaEmptyLibrary />
        ) : (
          <>
            <MediaSearchBox state={state} />
            <div className="blanc-command-row">
              <MediaKindFilter state={state} />
              <MediaLibraryActions
                onItemsChange={state.setItems}
                onCleared={state.clearPlayback}
              />
            </div>
            <div className="blanc-status-row">
              <span>
                {state.displayedItems.length} shown
                {state.displayedItems.length !== items.length ? ` of ${items.length}` : ''}
              </span>
              {state.selectedFolder && (
                <button type="button" onClick={() => state.setSelectedFolder(null)}>
                  Clear folder filter
                </button>
              )}
            </div>
            <div className={`blanc-media-body ${state.hasFolders ? 'has-folders' : ''}`}>
              {state.hasFolders && !state.searchActive && (
                <div className="blanc-media-folders">
                  <MediaFolderNav state={state} />
                </div>
              )}
              <div className="blanc-media-grid">
                <MediaGrid state={state} />
              </div>
            </div>
          </>
        )}
      </fieldset>

      <MediaLookupPopup state={state} />
    </div>
  );
}

/**
 * Pillar 0 fix for the `flashcards` tab bail-out, which mounted `FlashcardsView`
 * (and therefore `AppChrome`) inside `BlancViewHost`. Composes the shared
 * `flashcards/FlashcardsContent` mode components in Blanc chrome. AI Studio is
 * hidden in Blanc (`hideAiStudio`), matching the old embed.
 *
 * Pillar 7: mining runs through the same `FlashcardMiningMode` (and thus the
 * same `EpubMiningPanel` / `JitenMiningPanel` and `flashcards:openEpubMining`
 * handoff) as Study OS — Blanc mines through the identical path.
 *
 * The mode components are full-screen replacements in Study OS; here they sit
 * inside `.blanc-flashcards-embed`, which gives the review card and deck
 * explorer a bounded, scrolling frame (see `theme/blanc-media.css`).
 */
export function BlancFlashcardsPanel() {
  const state = useFlashcards(true);

  let body: JSX.Element;
  if (state.mode === 'review') body = <FlashcardReviewMode state={state} />;
  else if (state.mode === 'epub-mining') body = <FlashcardMiningMode state={state} />;
  else if (state.mode === 'csv-tool') body = <FlashcardCsvMode state={state} />;
  else if (state.mode === 'ai-studio') body = <FlashcardAiMode state={state} />;
  else body = <FlashcardDeckOverview state={state} />;

  return (
    <div className="blanc-tool-detail">
      <div className="blanc-flashcards-embed">{body}</div>
    </div>
  );
}
