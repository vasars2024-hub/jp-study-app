/**
 * The Blanc study tools' optional AI (`shared/aiBlancTutor.ts`), loaded only when
 * a tool's AI button is pressed — Blanc is the low-RAM mode, so none of this is
 * in its startup graph.
 *
 * - `BlancMistakeAi`: "Explain my mistake" (conjugation drill, counter reader).
 *   Fallback: where the two answers part.
 * - `BlancSummaryAi`: a memory aid (Kanji Inspector) or a short summary
 *   (Difficulty Analyzer). Fallback: the lines the tool already computed.
 */
import { useEffect } from 'react';
import {
  blancMistakeDiff,
  type BlancMistakeKind,
  type BlancMistakeResult,
  type BlancSummaryKind,
  type BlancSummaryResult,
} from '../../../shared/aiBlancTutor';
import { useAiReadiness } from '../../aiSetupClient';
import { getStudyLang } from '../../studyEnvironment';
import { useT } from '../../i18n';
import { AiStudyStatus, AiSuggestionBadge, useAiStudyRequest } from '../ai/aiStudyRequest';
import '../ai/aiTutor.css';

function Head({ title, onClose }: { title: string; onClose: () => void }) {
  const { t } = useT();
  return (
    <div className="ai-study-head">
      <h4>{title}</h4>
      <button
        type="button"
        className="btn small ai-study-btn lq-hit"
        aria-label={t('aiStudy.close')}
        title={t('aiStudy.close')}
        onClick={onClose}
      >
        ×
      </button>
    </div>
  );
}

export function BlancMistakeAi({ kind, word, reading, meaning, task, expected, typed, onClose }: {
  kind: BlancMistakeKind;
  word: string;
  reading: string;
  meaning: string;
  task: string;
  expected: string;
  typed: string;
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const ai = useAiReadiness();
  const request = useAiStudyRequest<BlancMistakeResult>();

  useEffect(() => {
    if (!ai.loaded || !ai.enabled) return;
    void request.run((requestId) => window.api.aiTutorBlancMistake({
      requestId, kind, word, reading, meaning, task, expected, typed, answerLang: lang,
    }));
  }, [ai.loaded, ai.enabled, kind, word, task, expected, typed]);

  const result = request.state.status === 'done' ? request.state.result : null;
  const showFallback = request.state.status === 'failed' || (ai.loaded && !ai.enabled);
  const diff = blancMistakeDiff(expected, typed);

  return (
    <section className="ai-study ai-tutor blanc-ai" aria-label={t('aiTutor.blanc.mistakeTitle')}>
      <Head title={t('aiTutor.blanc.mistakeTitle')} onClose={onClose} />
      <AiStudyStatus state={request.state} onCancel={request.cancel} busyKey="aiTutor.blanc.mistakeBusy" />
      {result && (
        <div className="ai-study-answer" lang={lang}>
          <AiSuggestionBadge />
          <p>{result.explanation}</p>
          {result.rule && <p><span className="ai-study-section-label">{t('aiTutor.blanc.rule')}</span> {result.rule}</p>}
          {result.tip && <p className="muted">{t('aiStudy.whyWrong.tip', { tip: result.tip })}</p>}
        </div>
      )}
      {showFallback && (
        <div className="ai-tutor-fallback">
          <p className="ai-study-section-label">{t('aiTutor.fallback')}</p>
          <p>
            {diff.shared
              ? t('aiTutor.blanc.diff', {
                shared: diff.shared,
                expected: diff.expectedTail || t('aiTutor.blanc.nothing'),
                typed: diff.typedTail || t('aiTutor.blanc.nothing'),
              })
              : t('aiTutor.blanc.diffStart', { expected, typed })}
          </p>
        </div>
      )}
    </section>
  );
}

export function BlancSummaryAi({ kind, subject, reading, meaning, level, unknownWords, fallbackLines, onClose }: {
  kind: BlancSummaryKind;
  subject: string;
  reading: string;
  meaning: string;
  level: string;
  unknownWords: readonly string[];
  /** What the tool already knows, shown when the AI cannot answer. */
  fallbackLines: readonly string[];
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const ai = useAiReadiness();
  const request = useAiStudyRequest<BlancSummaryResult>();
  const title = t(kind === 'kanji' ? 'aiTutor.blanc.kanjiTitle' : 'aiTutor.blanc.textTitle');

  useEffect(() => {
    if (!ai.loaded || !ai.enabled) return;
    void request.run((requestId) => window.api.aiTutorBlancSummary({
      requestId,
      kind,
      subject,
      reading,
      meaning,
      level,
      unknownWords: [...unknownWords],
      studyLang: getStudyLang(),
      answerLang: lang,
    }));
  }, [ai.loaded, ai.enabled, kind, subject]);

  const result = request.state.status === 'done' ? request.state.result : null;
  const showFallback = request.state.status === 'failed' || (ai.loaded && !ai.enabled);

  return (
    <section className="ai-study ai-tutor blanc-ai" aria-label={title}>
      <Head title={title} onClose={onClose} />
      <AiStudyStatus state={request.state} onCancel={request.cancel} busyKey="aiTutor.blanc.summaryBusy" />
      {result && (
        <div className="ai-study-answer" lang={lang}>
          <AiSuggestionBadge />
          <p>{result.headline}</p>
          {result.points.length > 0 && (
            <ul className="ai-study-notes">
              {result.points.map((point) => <li key={point}>{point}</li>)}
            </ul>
          )}
          {request.state.status === 'done' && request.state.cached && (
            <p className="muted ai-study-meta">{t('aiStudy.cached')}</p>
          )}
        </div>
      )}
      {showFallback && fallbackLines.length > 0 && (
        <div className="ai-tutor-fallback">
          <p className="ai-study-section-label">{t('aiTutor.fallback')}</p>
          {fallbackLines.map((line) => <p key={line}>{line}</p>)}
        </div>
      )}
    </section>
  );
}
