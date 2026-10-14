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
import { openAiSettings } from '../../aiSetupClient';
import { aiErrorKey, isAiErrorCode } from '../../../shared/aiErrorCodes';
import { AiStreamDraft, aiStreamPreviewText, subscribeAiStream } from '../ai/aiStream';

let lensAnalyzeCounter = 0;

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
  /** `draft`: the analysis as it streams in (sentence:analyze, docs/AI_AUDIT.md F9). */
  | { kind: 'loading'; draft?: string }
  /** Cancelled: what had streamed in stays, with Re-analyze. */
  | { kind: 'stopped'; draft: string }
  | { kind: 'ready'; result: SentenceAnalysisResult }
  | { kind: 'error'; message: string; needsKey: boolean; needsLocalModel: boolean; aiOff?: boolean };

export default function LensAnalysisPanel({ text, region, onLookup, onClose }: Props) {
  const { t, lang: uiLang } = useT();
  const studyLang = getStudyLang();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const viewRef = useRef<SentenceAnalysisHandle>(null);
  // Guards against a stale response landing after the reader moved to another
  // line — the panel stays mounted across sentence changes.
  const reqRef = useRef(0);
  const activeRequest = useRef<string | null>(null);

  const result = state.kind === 'ready' ? state.result : null;
  const actions = useAnalysisActions({
    lang: studyLang,
    uiLang,
    source: 'lens',
    sourceLabel: t('lens.ai.snapshotSource'),
    result,
  });

  // Set by "Re-analyze" / "Try again" and consumed by the next run, which then
  // bypasses main's cache — without it the button re-served the cached answer.
  const refreshNext = useRef(false);

  useEffect(() => {
    const id = ++reqRef.current;
    const refresh = refreshNext.current;
    refreshNext.current = false;
    setState({ kind: 'loading' });
    let alive = true;
    lensAnalyzeCounter += 1;
    const requestId = `lens-${Date.now().toString(36)}-${lensAnalyzeCounter}`;
    activeRequest.current = requestId;
    const unsubscribe = subscribeAiStream(requestId, (raw) => {
      if (alive && id === reqRef.current) setState({ kind: 'loading', draft: aiStreamPreviewText(raw) });
    });
    void (async () => {
      try {
        const res = await window.api.sentenceAnalyze({
          text,
          lang: studyLang,
          explainIn: uiLang,
          requestId,
          ...(refresh ? { refresh: true } : {}),
        });
        if (!alive || id !== reqRef.current) return;
        activeRequest.current = null;
        if (res.ok && res.result) setState({ kind: 'ready', result: res.result });
        else {
          setState({
            kind: 'error',
            // Main's prose is English; its code is said in the UI language.
            message: isAiErrorCode(res.code) ? t(aiErrorKey(res.code)) : t('lens.ai.error'),
            needsKey: !!res.needsKey,
            needsLocalModel: !!res.needsLocalModel,
            aiOff: !!res.aiOff,
          });
        }
      } catch {
        if (!alive || id !== reqRef.current) return;
        // The bridge itself threw (its message is Electron's English): said as
        // the shared code, in the UI language.
        setState({
          kind: 'error',
          message: t(aiErrorKey('ipc-failed')),
          needsKey: false,
          needsLocalModel: false,
        });
      } finally {
        unsubscribe();
      }
    })();
    return () => {
      alive = false;
      unsubscribe();
      // Another line, or the panel closing: the analysis still running is not wanted.
      if (activeRequest.current === requestId) {
        activeRequest.current = null;
        void window.api.sentenceAnalyzeCancel?.(requestId)?.catch(() => undefined);
      }
    };
  }, [text, studyLang, uiLang, attempt, t]);

  /** Stops the analysis being written; what had arrived stays on screen. */
  const cancel = useCallback(() => {
    const requestId = activeRequest.current;
    if (!requestId) return;
    activeRequest.current = null;
    reqRef.current += 1;
    void window.api.sentenceAnalyzeCancel?.(requestId)?.catch(() => undefined);
    setState((current) => ({ kind: 'stopped', draft: current.kind === 'loading' ? current.draft ?? '' : '' }));
  }, []);

  const reanalyze = useCallback(() => {
    refreshNext.current = true;
    setAttempt((n) => n + 1);
  }, []);

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
            {state.draft && <AiStreamDraft text={state.draft} state="drafting" lang={uiLang} />}
            <div className="lens-analysis-error-actions">
              <button type="button" onClick={cancel}>
                {t('aiStudy.stream.stop')}
              </button>
            </div>
          </div>
        )}

        {state.kind === 'stopped' && (
          <div className="lens-analysis-loading">
            <div className="lens-analysis-source" lang={studyLang}>
              {text}
            </div>
            {state.draft
              ? <AiStreamDraft text={state.draft} state="stopped" lang={uiLang} />
              : <p>{t(aiErrorKey('cancelled'))}</p>}
            <div className="lens-analysis-error-actions">
              <button type="button" onClick={reanalyze}>
                {t('lens.ai.reanalyze')}
              </button>
            </div>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="lens-analysis-error">
            <div className="lens-analysis-source" lang={studyLang}>
              {text}
            </div>
            <p>
              {state.aiOff
                ? t('lens.ai.off')
                : state.needsKey
                  ? t('lens.ai.needsKey')
                  : state.needsLocalModel
                    ? t('lens.ai.needsLocalModel')
                    : state.message}
            </p>
            <div className="lens-analysis-error-actions">
              {!state.needsKey && !state.needsLocalModel && !state.aiOff && (
                <button type="button" onClick={reanalyze}>
                  {t('lens.ai.retry')}
                </button>
              )}
              {(state.needsKey || state.needsLocalModel || state.aiOff) && (
                <button type="button" onClick={() => openAiSettings()}>
                  {t(state.aiOff ? 'settings.ai.setup.open' : 'settings.ai.setup.action')}
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
