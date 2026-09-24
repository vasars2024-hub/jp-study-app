import SentenceAnalysisView from '../renderer/components/analysis/SentenceAnalysisView';
import { useAnalysisActions } from '../renderer/analysisActions';
import { useT } from '../renderer/i18n';
import type { CueAnalysisState } from './useCueAnalysis';
import { openAiSettings } from '../renderer/aiSetupClient';

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
}

export default function VideoCoreGrammarPanel({
  state,
  lang,
  selectedIndex,
  onSelectedIndexChange,
  onLookup,
  onAnalyzeNow,
}: Props) {
  const { t, lang: uiLang } = useT();
  const result = state.kind === 'ready' ? state.result : null;
  const actions = useAnalysisActions({
    lang,
    uiLang,
    source: 'app',
    sourceLabel: t('mediaWorkspace.study.grammarSource'),
    result,
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
