/**
 * "Explain in context" (docs/AI_AUDIT.md N5) for the popup dictionary: which of
 * the word's senses the sentence it was looked up in uses, and why, with that
 * sense highlighted in a compact numbered list.
 *
 * Nothing runs until it is asked for. Answers are cached in main by word,
 * sentence, senses, UI language and model, so the same lookup in the same
 * sentence is answered from disk the next time. Without a model (AI not ready,
 * cloud not allowed, a failed or invalid reply) the list still renders, with
 * the first sense marked as the most common one — dictionary order, labelled as
 * the heuristic it is.
 *
 * Lazy-loaded by `DictionaryResults` (which is in Blanc's startup graph) and a
 * `data-ai-entry`, so it is not offered while "Use AI features" is off.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  contextExplainFallback,
  contextSenseLines,
  type ContextExplainResult,
} from '../../../shared/aiContextExplain';
import type { ExplainSenseLike } from '../../../shared/lexiconExplainView';
import { useAiReadiness } from '../../aiSetupClient';
import { useT } from '../../i18n';
import { AiStudyStatus, AiSuggestionBadge, useAiStudyRequest } from '../ai/aiStudyRequest';

export interface AiContextExplainProps {
  word: string;
  reading: string;
  /** The dictionary's language (the word's), not the UI's. */
  lang: string;
  sentence: string;
  senses: readonly ExplainSenseLike[];
  /** BCP-47 tag for the word and sentence. */
  contentLang?: string;
}

export default function AiContextExplain({ word, reading, lang, sentence, senses, contentLang }: AiContextExplainProps) {
  const { t, lang: uiLang } = useT();
  const ai = useAiReadiness();
  const [open, setOpen] = useState(false);
  const request = useAiStudyRequest<ContextExplainResult>();
  const lines = useMemo(() => contextSenseLines(senses), [senses]);

  // A new word or sentence is a new question.
  useEffect(() => {
    request.reset();
    setOpen(false);
  }, [word, sentence]);

  if (!ai.loaded || !ai.enabled || lines.length === 0 || !sentence.trim()) return null;

  const ask = (refresh = false): void => {
    void request.run((requestId) => window.api.aiStudyContextExplain({
      requestId,
      word,
      reading,
      lang,
      sentence,
      senses: lines,
      answerLang: uiLang,
      ...(refresh ? { refresh: true } : {}),
    }));
  };

  if (!open) {
    return (
      <div className="ai-study is-collapsed" data-ai-entry>
        <button
          type="button"
          className="btn small ai-study-btn lq-hit"
          aria-expanded={false}
          onClick={() => {
            setOpen(true);
            ask();
          }}
        >
          {t('aiStudy.context.button')}
        </button>
      </div>
    );
  }

  const result = request.state.status === 'done' ? request.state.result : null;
  const failed = request.state.status === 'failed';
  const fallback = failed ? contextExplainFallback(lines) : null;
  const fitIndex = result ? result.senseIndex : fallback ? fallback.senseIndex : -2;

  return (
    <section className="ai-study ai-context-explain" data-ai-entry aria-label={t('aiStudy.context.title')}>
      <div className="ai-study-head">
        <h4>{t('aiStudy.context.title')}</h4>
        <button
          type="button"
          className="btn small ai-study-btn lq-hit"
          aria-label={t('aiStudy.close')}
          title={t('aiStudy.close')}
          onClick={() => {
            request.reset();
            setOpen(false);
          }}
        >
          ×
        </button>
      </div>
      <p className="muted ai-study-note" lang={contentLang}>{sentence}</p>
      <AiStudyStatus state={request.state} onCancel={request.cancel} busyKey="aiStudy.context.busy" />
      <ol className="ai-study-notes">
        {lines.map((line, index) => (
          <li
            key={`${index}-${line}`}
            className={`ai-study-sense${index === fitIndex ? ' is-fit' : ''}`}
            aria-current={index === fitIndex ? 'true' : undefined}
          >
            {line}
            {index === fitIndex && (
              <span className="ai-study-sense-tag">
                {result ? t('aiStudy.context.fits') : t('aiStudy.context.mostCommon')}
              </span>
            )}
          </li>
        ))}
      </ol>
      {result && (
        <div className="ai-study-answer" lang={uiLang}>
          <AiSuggestionBadge />
          {result.senseIndex < 0 && <p>{t('aiStudy.context.noneFits')}</p>}
          <p>{result.explanation}</p>
          <p className="muted ai-study-meta">
            {t(`aiStudy.context.confidence.${result.confidence}`)}
            {request.state.status === 'done' && request.state.cached ? ` · ${t('aiStudy.cached')}` : ''}
          </p>
        </div>
      )}
      {fallback && <p className="muted ai-study-meta">{t('aiStudy.context.fallbackNote')}</p>}
      {request.state.status !== 'running' && (
        <div className="ai-study-actions">
          <button type="button" className="btn small ai-study-btn lq-hit" onClick={() => ask(Boolean(result))}>
            {t(result ? 'aiStudy.askAgain' : 'aiStudy.retry')}
          </button>
        </div>
      )}
    </section>
  );
}
