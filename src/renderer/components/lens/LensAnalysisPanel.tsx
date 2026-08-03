import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SentenceAnalysisView, {
  type AnalysisActionHandlers,
  type SentenceAnalysisHandle,
} from '../analysis/SentenceAnalysisView';
import { useT } from '../../i18n';
import { getStudyLang } from '../../studyEnvironment';
import { detectTtsLang, speak, stopSpeaking, ttsAvailable } from '../../tts';
import { useAnalysisActions } from '../../analysisActions';
import { analysisCommandForKey, isTextEntryTarget } from '../../../shared/analysisShortcuts';
import type { SentenceAnalysisResult } from '../../../shared/sentenceAnalysisCore';

/**
 * The Reading Lens' AI panel — what a scan opens when the mode toggle is on
 * AI OCR.
 *
 * The dictionary path is anchored to the word you clicked, because its answer is
 * one line long. An analysis is a page, so this docks to a screen edge instead:
 * anchoring it would either cover the sentence being explained or run off the
 * bottom of the display. It picks the side with more room around the scanned
 * region, so the text on screen stays visible next to its own explanation.
 *
 * The scan itself is not re-run when the sentence changes — the caller passes
 * the text it already OCR'd, and this owns the cloud call, its retry, the
 * keyboard layer, and the Anki / notebook actions.
 */

interface Props {
  /** The sentence to analyze — one OCR line, or the whole scan joined. */
  text: string;
  /** Region the text was read from, in Lens-local DIP; decides the dock side. */
  region: { x: number; y: number; width: number; height: number };
  /** Opens the dictionary for a span the reader clicked inside the analysis. */
  onLookup: (surface: string, context: string) => void;
  onClose: () => void;
}

const PANEL_W = 460;
const MARGIN = 12;

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; result: SentenceAnalysisResult }
  | { kind: 'error'; message: string; needsKey: boolean; needsLocalModel: boolean };

export default function LensAnalysisPanel({ text, region, onLookup, onClose }: Props) {
  const { t, lang: uiLang } = useT();
  const studyLang = getStudyLang();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const viewRef = useRef<SentenceAnalysisHandle>(null);
  // Guards against a stale response landing after the reader moved to another
  // line — the panel stays mounted across sentence changes.
  const reqRef = useRef(0);

  const result = state.kind === 'ready' ? state.result : null;
  const actions = useAnalysisActions({
    lang: studyLang,
    uiLang,
    source: 'lens',
    sourceLabel: t('lens.ai.snapshotSource'),
    result,
  });

  useEffect(() => {
    const id = ++reqRef.current;
    setState({ kind: 'loading' });
    let alive = true;
    void (async () => {
      try {
        const res = await window.api.sentenceAnalyze({ text, lang: studyLang, explainIn: uiLang });
        if (!alive || id !== reqRef.current) return;
        if (res.ok && res.result) setState({ kind: 'ready', result: res.result });
        else {
          setState({
            kind: 'error',
            message: res.error || t('lens.ai.error'),
            needsKey: !!res.needsKey,
            needsLocalModel: !!res.needsLocalModel,
          });
        }
      } catch (err) {
        if (!alive || id !== reqRef.current) return;
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : t('lens.ai.error'),
          needsKey: false,
          needsLocalModel: false,
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [text, studyLang, uiLang, attempt, t]);

  const reanalyze = useCallback(() => setAttempt((n) => n + 1), []);

  // The panel owns the keyboard while it is open. Capture phase, because the
  // Lens overlay also listens for Escape and would close the whole lens when
  // the reader only meant to dismiss this panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTextEntryTarget(e.target)) return;
      const command = analysisCommandForKey(e);
      if (!command) return;
      if (command === 'close') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (command === 'reanalyze') {
        e.preventDefault();
        e.stopPropagation();
        reanalyze();
        return;
      }
      if (viewRef.current?.run(command)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, reanalyze]);

  const viewActions = useMemo<AnalysisActionHandlers>(
    () => ({
      onCopy: actions.copy,
      onMine: actions.mine,
      onSaveSentence: actions.saveSentence,
      onSnapshot: actions.snapshot,
      onReanalyze: reanalyze,
      onSpeak: ttsAvailable()
        ? (value: string) => {
          const ttsLang = detectTtsLang(value, studyLang === 'zh' ? 'zh' : 'ja');
          if (!speak(value, ttsLang)) stopSpeaking();
        }
        : undefined,
      onLookup,
    }),
    [actions.copy, actions.mine, actions.saveSentence, actions.snapshot, reanalyze, studyLang, onLookup],
  );

  // Dock to whichever side of the scanned region has more free space, so the
  // sentence being explained is never underneath its own explanation.
  const vw = window.innerWidth;
  const spaceRight = vw - (region.x + region.width);
  const dockLeft =
    spaceRight >= PANEL_W + MARGIN * 2
      ? region.x + region.width + MARGIN
      : region.x >= PANEL_W + MARGIN * 2
        ? region.x - PANEL_W - MARGIN
        : Math.max(MARGIN, vw - PANEL_W - MARGIN);

  return (
    <div
      className="lens-analysis lens-interactive"
      style={{ left: dockLeft, width: PANEL_W }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="lens-analysis-head">
        <span className="lens-analysis-title">{t('lens.ai.title')}</span>
        {state.kind === 'ready' && (
          <button
            type="button"
            className="lens-analysis-retry"
            onClick={reanalyze}
            title={`${t('lens.ai.reanalyze')} · R`}
          >
            {t('lens.ai.reanalyze')}
          </button>
        )}
        <button
          type="button"
          className="lens-reader-x"
          onClick={onClose}
          aria-label={t('lens.action.close')}
        >
          ×
        </button>
      </div>

      <div className="lens-analysis-body">
        {state.kind === 'loading' && (
          <div className="lens-analysis-loading">
            <div className="lens-analysis-source" lang={studyLang}>
              {text}
            </div>
            <div className="lens-analysis-spinner">{t('lens.ai.analyzing')}</div>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="lens-analysis-error">
            <div className="lens-analysis-source" lang={studyLang}>
              {text}
            </div>
            <p>
              {state.needsKey
                ? t('lens.ai.needsKey')
                : state.needsLocalModel
                  ? t('lens.ai.needsLocalModel')
                  : state.message}
            </p>
            <div className="lens-analysis-error-actions">
              {!state.needsKey && !state.needsLocalModel && (
                <button type="button" onClick={reanalyze}>
                  {t('lens.ai.retry')}
                </button>
              )}
              <button type="button" onClick={onClose}>
                {t('lens.action.close')}
              </button>
            </div>
          </div>
        )}

        {state.kind === 'ready' && (
          <SentenceAnalysisView
            ref={viewRef}
            result={state.result}
            lang={studyLang}
            prefs={actions.prefs}
            actions={viewActions}
            actionState={{
              mine: actions.mineState,
              save: actions.saveState,
              snapshot: actions.snapshotState,
            }}
            showShortcuts
          />
        )}
      </div>
    </div>
  );
}
