import { useMemo } from 'react';
import SentenceAnalysisView from '../renderer/components/analysis/SentenceAnalysisView';
import { useAnalysisActions, type AnalysisMineProvenance } from '../renderer/analysisActions';
import { useT } from '../renderer/i18n';
import type { CueAnalysisState, OfflineAiStatus } from './useCueAnalysis';
import { openAiSettings } from '../renderer/aiSetupClient';
import type { VideoCoreMiningSource } from '../shared/videoCoreMining';

/**
 * What the player knows about the line under analysis. `source` is the same object the
 * mining panel gets (`miningSource`); the cue times are PLAYBACK seconds — subtitle
 * delay already applied (`cuePlaybackStartSec` / `cuePlaybackEndSec`) — because they are
 * what "Play in video" seeks to.
 */
export interface VideoCoreGrammarMineContext {
  source: VideoCoreMiningSource | null;
  cueStartSec?: number;
  cueEndSec?: number;
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * The player mining panel's provenance (`videoCoreStudyInput`), for a span mined from the
 * grammar panel: a `subtitle` card under the show's deck id, the file as its URL, and the
 * line's place in it — so the card can go back to the scene like any other player mine.
 * Null when the player has no source (nothing to attribute the card to), which leaves the
 * panel mining exactly as before.
 */
export function grammarMineProvenance(
  context: VideoCoreGrammarMineContext | null | undefined,
  sentence: string | undefined,
): AnalysisMineProvenance | null {
  const origin = context?.source;
  if (!origin) return null;
  const title = [origin.mediaTitle, origin.episodeNumber != null ? `#${origin.episodeNumber}` : '']
    .filter(Boolean)
    .join(' ');
  const sourceId = origin.mediaId != null
    ? `media-${origin.mediaId}`
    : origin.localFilePath || origin.playbackId;
  const start = context?.cueStartSec;
  const end = context?.cueEndSec;
  return {
    source: 'subtitle',
    sourceId,
    ...(title ? { sourceTitle: title } : {}),
    ...(origin.localFilePath || origin.streamPath
      ? { sourceUrl: origin.localFilePath || origin.streamPath }
      : {}),
    folder: 'Media',
    ...(finite(start) && start >= 0
      ? {
          sourceRef: {
            mediaId: sourceId,
            ...(origin.episodeNumber != null ? { episode: origin.episodeNumber } : {}),
            cueStartSec: start,
            ...(finite(end) && end > start ? { cueEndSec: end } : {}),
            ...(sentence?.trim() ? { sentence: sentence.trim() } : {}),
            returnTarget: { section: 'video' as const, positionSec: start },
          },
        }
      : {}),
  };
}

/**
 * The explanation half of grammar highlight.
 *
 * The colour-coded sentence itself is drawn on the subtitle overlay, over the
 * video, so this panel deliberately does not own the analysis — it renders
 * whatever the overlay's `useCueAnalysis` currently holds, and its selection is
 * controlled, so clicking a word on the subtitle and clicking the same word here
 * are one act rather than two independent ones.
 */

interface Props {
  state: CueAnalysisState;
  /** Study language of the line. */
  lang: string;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  /** Opens the dictionary for a span — the analysis as a way *into* the dictionary. */
  onLookup: (surface: string, context: string) => void;
  /** Analyze the current line without waiting for a pause. */
  onAnalyzeNow: () => void;
  /**
   * The playing file and line. Optional: without it a mined span is an `analysis` card
   * with no way back to the video, which is what a detached window without a source
   * still gets.
   */
  mineContext?: VideoCoreGrammarMineContext | null;
}

export default function VideoCoreGrammarPanel({
  state,
  lang,
  selectedIndex,
  onSelectedIndexChange,
  onLookup,
  onAnalyzeNow,
  mineContext,
}: Props) {
  const { t, lang: uiLang } = useT();
  const result = state.kind === 'ready' ? state.result : null;
  const sentence = result?.sentence;
  const contextStart = mineContext?.cueStartSec;
  const contextEnd = mineContext?.cueEndSec;
  // Keyed on the values, not the objects: the overlay rebuilds its mining source and
  // would build `mineContext` inline, and a new provenance every render would rebuild
  // the mine callbacks every render.
  const sourceKey = mineContext?.source ? JSON.stringify(mineContext.source) : '';
  const mineProvenance = useMemo(
    () => grammarMineProvenance(
      {
        source: sourceKey ? JSON.parse(sourceKey) as VideoCoreMiningSource : null,
        cueStartSec: contextStart,
        cueEndSec: contextEnd,
      },
      sentence,
    ),
    [sourceKey, contextStart, contextEnd, sentence],
  );
  const actions = useAnalysisActions({
    lang,
    uiLang,
    source: 'app',
    sourceLabel: t('mediaWorkspace.study.grammarSource'),
    result,
    mineProvenance,
  });

  return (
    <aside
      className="study-grammar-panel"
      aria-label={t('mediaWorkspace.study.grammarHighlight')}
      data-grammar-state={state.kind}
    >
      {state.kind === 'idle' && (
        <div className="study-grammar-status">
          <p>{t('mediaWorkspace.study.grammarIdle')}</p>
          <button type="button" onClick={onAnalyzeNow}>
            {t('mediaWorkspace.study.grammarAnalyzeNow')}
          </button>
        </div>
      )}

      {state.kind === 'loading' && (
        <p className="study-grammar-status" role="status" aria-live="polite">
          {t('mediaWorkspace.study.grammarLoading')}
        </p>
      )}

      {state.kind === 'error' && (
        <div className="study-grammar-status study-grammar-error" role="alert">
          <p>
            {state.needsKey
              ? t('mediaWorkspace.study.grammarNeedsKey')
              : state.needsLocalModel
                ? t('mediaWorkspace.study.grammarNeedsLocalModel')
                : state.message}
          </p>
          {/* A missing key or model is not fixed by trying again, so the retry
              is only offered for failures that could plausibly be transient. */}
          {!state.needsKey && !state.needsLocalModel && (
            <button type="button" onClick={onAnalyzeNow}>
              {t('mediaWorkspace.study.grammarRetry')}
            </button>
          )}
          {(state.needsKey || state.needsLocalModel) && (
            <button type="button" onClick={() => openAiSettings()}>
              {t('settings.ai.setup.action')}
            </button>
          )}
        </div>
      )}

      {state.kind === 'ready' && state.offline && (
        <OfflineNote status={state.offline} onAnalyzeNow={onAnalyzeNow} />
      )}

      {state.kind === 'ready' && (
        <SentenceAnalysisView
          result={state.result}
          lang={lang}
          prefs={actions.prefs}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={onSelectedIndexChange}
          actionState={{
            mine: actions.mineState,
            save: actions.saveState,
            snapshot: actions.snapshotState,
          }}
          actions={{
            onCopy: actions.copy,
            onMine: actions.mine,
            onSaveSentence: actions.saveSentence,
            onSnapshot: actions.snapshot,
            onLookup,
            onReanalyze: onAnalyzeNow,
          }}
        />
      )}
    </aside>
  );
}

/**
 * Above an offline highlight: where it came from, and what the AI half is doing. The
 * library's matches are real but thin, so the way to the full explanation stays one click
 * away — the explain button when the AI is set up, the AI settings when it is not.
 */
function OfflineNote({
  status,
  onAnalyzeNow,
}: {
  status: OfflineAiStatus;
  onAnalyzeNow: () => void;
}) {
  const { t } = useT();
  return (
    <div className="study-grammar-status" data-grammar-offline={status.ai}>
      <p>{t('mediaWorkspace.study.grammarOffline')}</p>
      {status.ai === 'idle' && (
        <button type="button" onClick={onAnalyzeNow}>
          {t('mediaWorkspace.study.grammarAnalyzeNow')}
        </button>
      )}
      {status.ai === 'loading' && (
        <p role="status" aria-live="polite">{t('mediaWorkspace.study.grammarLoading')}</p>
      )}
      {(status.ai === 'needsKey' || status.ai === 'needsLocalModel') && (
        <>
          <p>
            {status.ai === 'needsKey'
              ? t('mediaWorkspace.study.grammarOfflineNeedsKey')
              : t('mediaWorkspace.study.grammarOfflineNeedsLocalModel')}
          </p>
          <button type="button" onClick={() => openAiSettings()}>
            {t('settings.ai.setup.action')}
          </button>
        </>
      )}
      {status.ai === 'error' && (
        <>
          <p role="alert">{status.message}</p>
          <button type="button" onClick={onAnalyzeNow}>
            {t('mediaWorkspace.study.grammarRetry')}
          </button>
        </>
      )}
    </div>
  );
}
