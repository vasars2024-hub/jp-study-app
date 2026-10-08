/**
 * Blanc's Media tab.
 *
 * Pillar 0: never mount a Study OS `*View` inside Blanc. `BlancMediaPanel`
 * composes `media/MediaContent.tsx` in Blanc chrome. `AppChrome`, `MenuBar`,
 * and `StatusBar` must never be imported here. New CSS goes in
 * `theme/blanc-media.css`, using the existing Blanc tokens.
 *
 * The Cards tab lives in its own module (BlancFlashcardsPanel.tsx), so each tab's
 * lazy chunk carries only its own stack. The Study OS class-name stylesheet the
 * media blocks rely on is loaded by the shell's lazy loader before first render.
 */
import { useState } from 'react';
import { useT } from '../../i18n';
import { getStudyLang } from '../../studyEnvironment';
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

/**
 * Pillar 0 fix for the `player` / `video` tab bail-out, which mounted
 * `MediaView` (and therefore `AppChrome`) inside `BlancViewHost`.
 *
 * Runs in `'full'` mode so Blanc's single Media tab keeps both the player and
 * the library. The player comes first — it is what the tab is for once
 * something is loaded — and the secondary sections (transcription, YouTube)
 * are collapsible so the library is not pushed below the fold. The library grid
 * stays on `VirtualGrid` — see `.blanc-media-grid` in `theme/blanc-media.css`
 * for the bounded height it needs to measure against.
 */
export function BlancMediaPanel() {
  const { t } = useT();
  const state = useMedia('full');
  const { items, current, cues, src, subName, genState, generating } = state;
  const [cardOptions, setCardOptions] = useTranscriptionCardOptions();
  const [queueNote, setQueueNote] = useState('');

  const queueTranscription = async (): Promise<void> => {
    if (!current) return;
    setQueueNote('');
    try {
      // The study language, not a hard-coded Japanese: a Chinese or Russian
      // learner's media is transcribed in the language they are studying.
      const result = await window.api.enqueueTranscription({
        mediaId: current.id,
        lang: getStudyLang(),
        cardOptions,
      });
      setQueueNote(
        result.ok === false
          ? t('blanc.media.queueFailed', { error: result.error ?? '' })
          : t('blanc.media.queued'),
      );
    } catch (error) {
      setQueueNote(t('blanc.media.queueFailed', { error: error instanceof Error ? error.message : String(error) }));
    }
  };

  return (
    <div className="blanc-tool-detail">
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

      <details className="blanc-collapsible">
        <summary>{t('media.transcriptCards.transcription')}</summary>
        <div className="blanc-command-row">
          <MediaTranscriptionControls state={state} />
          <button
            type="button"
            disabled={!current}
            onClick={() => void queueTranscription()}
          >
            {t('media.transcriptCards.queue')}
          </button>
        </div>
        {queueNote && <p className="blanc-note" role="status">{queueNote}</p>}
        <TranscriptionCardOptionsControl value={cardOptions} onChange={setCardOptions} />
        <TranscriptionCardDeckStatus mediaId={current?.id} />
        <MediaGenerationStatus state={state} />
        <MediaJobStrip />
      </details>

      <details className="blanc-collapsible">
        <summary>{t('blanc.media.fromYoutube')}</summary>
        <MediaYoutubeBar state={state} />
      </details>

      <MediaLookupPopup state={state} />
    </div>
  );
}
