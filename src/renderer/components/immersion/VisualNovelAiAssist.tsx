/**
 * The visual novel's optional AI actions for one line (docs/AI_AUDIT.md N12):
 *
 * - "Explain": the line with the lines before it and its speaker — what it means
 *   here, why it is phrased that way, the grammar in it (`vnExplain`). Also the
 *   reader window's E key.
 * - "Translate with context": only for a line with no translation (`vnTranslate`).
 *   The answer is shown labelled AI and is saved to the line only when the
 *   learner presses "Use this translation".
 *
 * The non-AI path is untouched: Translate (the app's translator), Analyze and the
 * dictionary stay where they were. Lazy-loaded; the whole panel is
 * `data-ai-entry`, so nothing here shows while "Use AI features" is off.
 */
import { useEffect, useRef } from 'react';
import type { ContextTranslateResult, LineExplainResult } from '../../../shared/aiImmerseLine';
import { studyLangOfText } from '../../../shared/studyLang';
import type { VisualNovelTextCapture } from '../../../shared/visualNovel';
import { useAiReadiness } from '../../aiSetupClient';
import { useT } from '../../i18n';
import { getStudyLang } from '../../studyEnvironment';
import { vnAiContextFor, vnTranslateWithContext } from '../../vnAiTranslate';
import { AiSetupPrompt } from '../ai/AiSetupPrompt';
import { AiImmerseBadge, AiImmerseStatus, useAiImmerseRequest } from '../ai/aiImmerseRequest';

export interface VisualNovelAiAssistProps {
  line: VisualNovelTextCapture;
  /** The novel's lines in reading order, for context. */
  captures: readonly VisualNovelTextCapture[];
  /** Bumped by the reader's E key: explain the line now. */
  explainSignal?: number;
  /** Saves an accepted AI translation onto the line; the translate action is absent without it. */
  onUseTranslation?: (translation: string) => void;
  compact?: boolean;
}

export default function VisualNovelAiAssist({
  line,
  captures,
  explainSignal = 0,
  onUseTranslation,
  compact = false,
}: VisualNovelAiAssistProps) {
  const { t, lang: uiLang } = useT();
  const ai = useAiReadiness();
  const explain = useAiImmerseRequest<LineExplainResult>();
  const translate = useAiImmerseRequest<ContextTranslateResult>();
  const studyLang = studyLangOfText(line.japanese, getStudyLang());
  const aiReady = ai.loaded && ai.enabled && ai.ready;

  // A different line: anything asked about the previous one is dropped.
  useEffect(() => {
    explain.reset();
    translate.reset();
  }, [line.id]);

  const runExplain = (refresh = false): void => {
    if (!line.japanese.trim()) return;
    void explain.run((requestId) => window.api.aiImmerseExplainLine({
      requestId,
      surface: 'vn',
      text: line.japanese,
      target: '',
      context: vnAiContextFor(line, captures, 3),
      speaker: line.speaker ?? '',
      studyLang,
      answerLang: uiLang,
      ...(refresh ? { refresh: true } : {}),
    }));
  };

  // 0 is "never pressed": a panel mounted BY a press (the reader's E) answers it.
  // A press that lands before readiness is known is answered once it is.
  const lastSignal = useRef(0);
  useEffect(() => {
    if (explainSignal === lastSignal.current || !aiReady) return;
    lastSignal.current = explainSignal;
    runExplain();
  }, [explainSignal, aiReady]);

  const explained = explain.state.status === 'done' ? explain.state.result : null;
  const translated = translate.state.status === 'done' ? translate.state.result : null;
  const needsTranslation = !line.translation?.trim() && Boolean(onUseTranslation);

  if (!ai.loaded || !ai.enabled) return null;

  return (
    <section
      className={`ai-immerse${compact ? ' is-inline' : ''}`}
      data-ai-entry
      data-vn-ai-assist=""
      aria-label={t('aiImmerse.vn.title')}
    >
      {!aiReady ? (
        <AiSetupPrompt compact reasonKey="aiImmerse.notReady" />
      ) : (
        <div className="ai-immerse-actions">
          {explain.state.status !== 'running' && (
            <button
              type="button"
              className="btn small ai-immerse-btn"
              data-vn-ai-action="explain"
              aria-keyshortcuts={compact ? 'E' : undefined}
              title={compact ? t('aiImmerse.vn.explainKey', { key: 'E' }) : undefined}
              onClick={() => runExplain(Boolean(explained))}
            >
              {t(explained ? 'aiImmerse.askAgain' : 'aiImmerse.vn.explain')}
            </button>
          )}
          {needsTranslation && translate.state.status !== 'running' && (
            <button
              type="button"
              className="btn small ai-immerse-btn"
              data-vn-ai-action="translate"
              onClick={() => void translate.run((requestId) => vnTranslateWithContext(line, captures, requestId))}
            >
              {t('aiImmerse.vn.translate')}
            </button>
          )}
        </div>
      )}

      <AiImmerseStatus state={explain.state} onCancel={explain.cancel} />
      {explained && (
        <div className="ai-immerse-answer" data-vn-ai-answer="explain">
          <AiImmerseBadge />
          <p lang={uiLang}><strong>{t('aiImmerse.translation')}</strong> {explained.translation}</p>
          <p lang={uiLang}>{explained.explanation}</p>
          {explained.grammar.length > 0 && (
            <ul className="ai-immerse-list">
              {explained.grammar.map((entry, index) => (
                <li key={`${entry.pattern}-${index}`}>
                  <span lang={studyLang}>{entry.pattern}</span>{' — '}<span lang={uiLang}>{entry.note}</span>
                </li>
              ))}
            </ul>
          )}
          {explain.state.status === 'done' && explain.state.cached && (
            <p className="muted ai-immerse-meta">{t('aiImmerse.cached')}</p>
          )}
        </div>
      )}

      <AiImmerseStatus state={translate.state} onCancel={translate.cancel} busyKey="aiImmerse.vn.translateBusy" />
      {translated && needsTranslation && (
        <div className="ai-immerse-answer" data-vn-ai-answer="translate">
          <AiImmerseBadge />
          <p>{translated.translation}</p>
          <div className="ai-immerse-actions">
            <button
              type="button"
              className="btn small primary ai-immerse-btn"
              onClick={() => onUseTranslation?.(translated.translation)}
            >
              {t('aiImmerse.vn.useTranslation')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
