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
import { useEffect } from 'react';
import { useT } from '../../i18n';
import {
  MediaEmptyLibrary,
  MediaFolderNav,
  MediaGenerationStatus,
  MediaGrid,
  MediaKindFilter,
  MediaLibraryActions,
  MediaLookupPopup,
  MediaSearchBox,
  MediaTranscriptionControls,
  MediaWatchFolder,
  MediaYoutubeBar,
  useMedia,
} from '../media/MediaContent';
import MediaJobStrip from '../media/library/MediaJobStrip';
import {
  TranscriptionCardDeckStatus,
  TranscriptionCardOptionsControl,
  useTranscriptionCardOptions,
} from '../media/TranscriptionCardOptions';
import BlancStudyPlayer from './BlancStudyPlayer';
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
  const { t } = useT();
  const state = useMedia('full');
  const { items, current, cues, src, subName, genState, generating } = state;
  const [cardOptions, setCardOptions] = useTranscriptionCardOptions();

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.media.source')}</legend>
        <div className="blanc-command-row">
          <button type="button" onClick={() => void state.openFile()}>
            {t('blanc.media.addFiles')}
          </button>
          <button type="button" onClick={() => void state.openFolder()}>
            {t('blanc.media.addFolder')}
          </button>
          <button type="button" onClick={() => void state.openSubs()} disabled={!src}>
            {subName && genState !== 'done'
              ? t('media.subs.loaded', { name: subName })
              : t('blanc.media.loadSubs')}
          </button>
          <button
            type="button"
            onClick={() => src && void state.runGeneration(src)}
            disabled={!src || generating}
          >
            {t('media.generateSubs')}
          </button>
        </div>
        <div className="blanc-status-row">
          <span>{t('blanc.media.items', { count: items.length })}</span>
          <span>{current ? current.title : t('blanc.media.nothingLoaded')}</span>
          {cues.length > 0 && <span>{t('blanc.media.subtitleLines', { count: cues.length })}</span>}
        </div>
        <MediaWatchFolder state={state} />
      </fieldset>

      <fieldset>
        <legend>{t('media.transcriptCards.transcription')}</legend>
        <div className="blanc-command-row">
          <MediaTranscriptionControls state={state} />
          <button
            type="button"
            disabled={!current}
            onClick={() => current && void window.api.enqueueTranscription({
              mediaId: current.id,
              lang: 'ja',
              cardOptions,
            })}
          >
            {t('media.transcriptCards.queue')}
          </button>
        </div>
        <TranscriptionCardOptionsControl value={cardOptions} onChange={setCardOptions} />
        <TranscriptionCardDeckStatus mediaId={current?.id} />
        <MediaGenerationStatus state={state} />
        <MediaJobStrip />
      </fieldset>

      <fieldset>
        <legend>{t('blanc.media.fromYoutube')}</legend>
        <MediaYoutubeBar state={state} />
      </fieldset>

      {/*
        Slice 15 routed this onto the adopted study player; slice 16 deleted the legacy
        `MediaPlayerStage` it used to render directly, ungated. `BlancStudyPlayer` now has
        no fallback to hand back to — a disabled sidecar means no player here, which is the
        stated cost of the deletion rather than a surprise.

        `current` rather than `src` guards it: the adopted surface needs the item's real
        path and resume position, not the object URL the legacy stage used to play.
      */}
      {src && current && (
        <fieldset>
          <legend>{t('blanc.media.player')}</legend>
          <BlancStudyPlayer item={current} />
        </fieldset>
      )}

      <fieldset>
        <legend>{t('blanc.media.library')}</legend>
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
                {state.displayedItems.length !== items.length
                  ? t('blanc.media.shownOf', { count: state.displayedItems.length, total: items.length })
                  : t('blanc.media.shown', { count: state.displayedItems.length })}
              </span>
              {state.selectedFolder && (
                <button type="button" onClick={() => state.setSelectedFolder(null)}>
                  {t('blanc.media.clearFolderFilter')}
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
export function BlancFlashcardsPanel({
  searchRequest,
}: {
  searchRequest?: { query: string; key: number } | null;
}) {
  const state = useFlashcards(true);
  const { setFolderFilter, setMode, setOverviewTab, setSearch } = state;

  useEffect(() => {
    if (!searchRequest?.query) return;
    setMode('overview');
    setOverviewTab('epub');
    setFolderFilter('all');
    setSearch(searchRequest.query);
  }, [searchRequest, setFolderFilter, setMode, setOverviewTab, setSearch]);

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
