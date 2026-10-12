/**
 * The optional AI parts of first-run setup (docs/AI_AUDIT.md N25, N26).
 *
 * - `FirstRunAiRow`: an "AI (optional)" row in the downloads step, reusing the
 *   same install control and readiness Settings > AI uses. Nothing is turned on
 *   here; the cloud stays off until a feature is allowed in Settings > AI.
 * - `PlacementQuiz` (default export, lazy): ~8 mixed-level items written by the
 *   AI with an answer key, graded HERE against that key; the suggested level
 *   comes from a fixed rule. The learner applies it or keeps their own choice.
 *   Without AI: paste a text you read comfortably and the app's own level
 *   estimate (`estimateLevelFromText`) suggests a level. Words answered right
 *   can be marked known — only on request, and through `setInferredLevel`, so a
 *   level the learner set by hand is never changed.
 */
import { useState } from 'react';
import {
  gradePlacementQuiz,
  placementBandFromExamLevel,
  PLACEMENT_LEVELS,
  type PlacementGrade,
  type PlacementQuizResult,
} from '../../../shared/aiOnboarding';
import { LANG_TAGS } from '../../../shared/i18n/core';
import type { StudyLang } from '../../../shared/studyLang';
import { openAiSettings, useAiReadiness } from '../../aiSetupClient';
import { LEVEL_BANDS, type LevelBand } from '../../firstRunSetup';
import { useT } from '../../i18n';
import { AiModelInstallControl } from '../ai/AiModelInstall';
import { AiStudyStatus, AiSuggestionBadge, useAiStudyRequest } from '../ai/aiStudyRequest';
import '../ai/aiTutor.css';

export function FirstRunAiRow() {
  const { t } = useT();
  const ai = useAiReadiness();
  const status = !ai.loaded
    ? t('aiTutor.onboarding.checking')
    : !ai.enabled
      ? t('aiTutor.onboarding.off')
      : ai.ready
        ? t(ai.engine === 'cloud' ? 'aiTutor.onboarding.readyCloud' : 'aiTutor.onboarding.readyLocal')
        : t('aiTutor.onboarding.notReady');
  return (
    <li className="frs-dl-row frs-ai-row" data-download="ai">
      <div className="frs-dl-main">
        <span className="frs-dl-label">{t('aiTutor.onboarding.label')}</span>
        <span className="frs-dl-name">{t('aiTutor.onboarding.name')}</span>
        <span className="frs-dl-desc">{t('aiTutor.onboarding.desc')}</span>
        <span className="frs-dl-status" aria-live="polite">{status}</span>
        {ai.loaded && ai.enabled && <AiModelInstallControl />}
      </div>
      <div className="frs-dl-actions">
        <button type="button" className="btn" onClick={() => openAiSettings('ai-provider')}>
          {t('aiStudy.openSettings')}
        </button>
      </div>
    </li>
  );
}

const BAND_LABEL_KEYS: Record<StudyLang, Record<LevelBand, string>> = {
  ja: {
    beginner: 'onb2.level.ja.beginner',
    elementary: 'onb2.level.ja.elementary',
    intermediate: 'onb2.level.ja.intermediate',
    upper: 'onb2.level.ja.upper',
    advanced: 'onb2.level.ja.advanced',
  },
  zh: {
    beginner: 'onb2.level.zh.beginner',
    elementary: 'onb2.level.zh.elementary',
    intermediate: 'onb2.level.zh.intermediate',
    upper: 'onb2.level.zh.upper',
    advanced: 'onb2.level.zh.advanced',
  },
  ru: {
    beginner: 'onb2.level.ru.beginner',
    elementary: 'onb2.level.ru.elementary',
    intermediate: 'onb2.level.ru.intermediate',
    upper: 'onb2.level.ru.upper',
    advanced: 'onb2.level.ru.advanced',
  },
};

function bandOf(index: number): LevelBand {
  return LEVEL_BANDS[Math.max(0, Math.min(LEVEL_BANDS.length - 1, index))];
}

export default function PlacementQuiz({ studyLang, onLevel, onClose }: {
  studyLang: StudyLang;
  onLevel: (level: LevelBand) => void;
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const ai = useAiReadiness();
  const request = useAiStudyRequest<PlacementQuizResult>();
  const [picks, setPicks] = useState<Array<number | null>>([]);
  const [grade, setGrade] = useState<PlacementGrade | null>(null);
  const [marked, setMarked] = useState<number | null>(null);
  const [sample, setSample] = useState('');
  const [estimate, setEstimate] = useState<{ band: number | null; label: string } | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [applied, setApplied] = useState<LevelBand | null>(null);

  const quiz = request.state.status === 'done' ? request.state.result : null;
  const contentLang = LANG_TAGS[studyLang];

  const start = (refresh = false): void => {
    setPicks([]);
    setGrade(null);
    setMarked(null);
    void request.run((requestId) => window.api.aiTutorPlacementQuiz({
      requestId,
      studyLang,
      answerLang: lang,
      count: 8,
      ...(refresh ? { refresh: true } : {}),
    }));
  };

  const pick = (item: number, choice: number): void => {
    if (grade) return;
    setPicks((prev) => {
      const next = [...prev];
      next[item] = choice;
      return next;
    });
  };

  const markKnown = async (): Promise<void> => {
    if (!grade?.knownWords.length) return;
    const { setInferredLevel } = await import('../../knownWords');
    let changed = 0;
    for (const word of grade.knownWords) if (setInferredLevel(word, 3) !== null) changed += 1;
    setMarked(changed);
  };

  const estimateFromSample = async (): Promise<void> => {
    const text = sample.trim();
    if (!text) return;
    setEstimating(true);
    try {
      const { estimateLevelFromText } = await import('../../bookLevelEstimate');
      const result = await estimateLevelFromText(text, studyLang);
      setEstimate(result
        ? { band: placementBandFromExamLevel(result.scheme, result.level), label: result.label }
        : { band: null, label: '' });
    } catch {
      setEstimate({ band: null, label: '' });
    } finally {
      setEstimating(false);
    }
  };

  const use = (index: number): void => {
    const band = bandOf(index);
    onLevel(band);
    setApplied(band);
  };

  const answeredAll = quiz ? quiz.items.every((_, i) => typeof picks[i] === 'number') : false;

  return (
    <section className="ai-study ai-tutor frs-placement" aria-label={t('aiTutor.placement.title')}>
      <div className="ai-study-head">
        <h4>{t('aiTutor.placement.title')}</h4>
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
      <p className="muted ai-study-note">{t('aiTutor.placement.about')}</p>

      {ai.loaded && ai.enabled && !quiz && request.state.status !== 'running' && (
        <div className="ai-study-actions" data-ai-entry>
          <button type="button" className="btn small ai-study-btn lq-hit" onClick={() => start()}>
            {t('aiTutor.placement.start')}
          </button>
        </div>
      )}
      <AiStudyStatus state={request.state} onCancel={request.cancel} busyKey="aiTutor.placement.busy" />

      {quiz && (
        <div className="ai-study-answer" lang={lang}>
          <AiSuggestionBadge />
          <ol className="ai-tutor-quiz">
            {quiz.items.map((item, index) => (
              <li key={`${index}-${item.word}`}>
                <fieldset>
                  <legend>
                    <span lang={lang}>{item.prompt}</span>{' '}
                    <span className="muted ai-study-meta">{PLACEMENT_LEVELS[studyLang][item.level]}</span>
                  </legend>
                  {item.choices.map((choice, choiceIndex) => {
                    const state = !grade ? '' : choiceIndex === item.answer ? ' is-right' : picks[index] === choiceIndex ? ' is-wrong' : '';
                    return (
                      <label key={choiceIndex} className={`ai-tutor-choice${state}`}>
                        <input
                          type="radio"
                          name={`frs-placement-${index}`}
                          checked={picks[index] === choiceIndex}
                          disabled={Boolean(grade)}
                          onChange={() => pick(index, choiceIndex)}
                        />
                        <span>{choice}</span>
                      </label>
                    );
                  })}
                </fieldset>
              </li>
            ))}
          </ol>
          {!grade ? (
            <div className="ai-study-actions">
              <button
                type="button"
                className="btn small primary ai-study-btn lq-hit"
                disabled={!answeredAll}
                onClick={() => setGrade(gradePlacementQuiz(quiz.items, picks))}
              >
                {t('aiTutor.placement.grade')}
              </button>
              {!answeredAll && <span className="muted ai-study-meta">{t('aiTutor.placement.answerAll')}</span>}
            </div>
          ) : (
            <div className="ai-study-actions" role="status">
              <span>
                {t('aiTutor.placement.score', { right: grade.right, total: grade.total })}
                {' · '}
                {t('aiTutor.placement.suggests', { level: t(BAND_LABEL_KEYS[studyLang][bandOf(grade.band)]) })}
              </span>
              <button type="button" className="btn small primary ai-study-btn lq-hit" onClick={() => use(grade.band)}>
                {t('aiTutor.placement.use')}
              </button>
              {grade.knownWords.length > 0 && marked === null && (
                <button type="button" className="btn small ai-study-btn lq-hit" onClick={() => void markKnown()}>
                  {t('aiTutor.placement.markKnown', { count: grade.knownWords.length })}
                </button>
              )}
              {marked !== null && <span className="muted">{t('aiTutor.placement.marked', { count: marked })}</span>}
              <button type="button" className="btn small ai-study-btn lq-hit" data-ai-entry onClick={() => start(true)}>
                {t('aiTutor.placement.again')}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="ai-tutor-fallback">
        <p className="ai-study-section-label">{t('aiTutor.placement.sampleTitle')}</p>
        <label className="ai-tutor-field">
          <span>{t('aiTutor.placement.sampleLabel')}</span>
          <textarea rows={3} value={sample} lang={contentLang} onChange={(event) => setSample(event.target.value)} />
        </label>
        <div className="ai-study-actions">
          <button
            type="button"
            className="btn small ai-study-btn lq-hit"
            disabled={!sample.trim() || estimating}
            onClick={() => void estimateFromSample()}
          >
            {estimating ? t('aiTutor.placement.estimating') : t('aiTutor.placement.estimate')}
          </button>
          {estimate && estimate.band !== null && (
            <>
              <span role="status">
                {t('aiTutor.placement.estimated', { label: estimate.label, level: t(BAND_LABEL_KEYS[studyLang][bandOf(estimate.band)]) })}
              </span>
              <button type="button" className="btn small ai-study-btn lq-hit" onClick={() => use(estimate.band as number)}>
                {t('aiTutor.placement.use')}
              </button>
            </>
          )}
          {estimate && estimate.band === null && <span className="muted" role="status">{t('aiTutor.placement.noEstimate')}</span>}
        </div>
      </div>
      {applied && <p className="muted ai-study-note" role="status">{t('aiTutor.placement.applied', { level: t(BAND_LABEL_KEYS[studyLang][applied]) })}</p>}
    </section>
  );
}
