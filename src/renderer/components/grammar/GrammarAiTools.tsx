/**
 * The optional AI helpers on a grammar point (`shared/aiGrammarTutor.ts`):
 *
 * - `GrammarExplainAi`     "Explain this pattern" for a point the reference says nothing about
 * - `GrammarExamplesAi`    example sentences; saved, marked generated, only when ticked and approved
 * - `GrammarSightingsAi`   confirm or reject the offline highlighter's sightings (labels only)
 * - `GrammarProductionAi`  write a sentence with the pattern; the AI grades it and SUGGESTS a
 *                          rating, which is applied only when the learner presses it
 *
 * Every one runs on request only and has a deterministic fallback shown when the
 * AI cannot answer. Lazy-loaded by the grammar surfaces (Blanc included) on the
 * first press of its button, so none of this is part of any window's startup.
 * Model text is rendered as React text, never as markup.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  grammarExplainFallback,
  grammarProductionFallback,
  type GrammarAttach,
  type GrammarExamplesResult,
  type GrammarExplainResult,
  type GrammarPointBrief,
  type GrammarProductionResult,
  type GrammarSightingResult,
  type GrammarSuggestedRating,
} from '../../../shared/aiGrammarTutor';
import { tutorTextInStudyLang } from '../../../shared/aiTutorCommon';
import { normalizeStudyLang } from '../../../shared/studyLang';
import type { GrammarExample, GrammarPoint } from '../../data/grammar/types';
import { addUserExamples } from '../../data/grammar/userExamples';
import { findGrammarSightings, type GrammarSighting } from '../../grammarSightings';
import { useAiReadiness } from '../../aiSetupClient';
import { useT } from '../../i18n';
import { contentLangOf } from '../../studyEnvironment';
import { AiStudyStatus, AiSuggestionBadge, useAiStudyRequest } from '../ai/aiStudyRequest';
import '../ai/aiTutor.css';

type PointLike = Pick<GrammarPoint, 'id' | 'title' | 'meaning' | 'structure' | 'explanation' | 'level' | 'lang'> & {
  examples?: readonly GrammarExample[];
};

export function grammarPointBrief(point: PointLike): GrammarPointBrief {
  return {
    id: point.id,
    title: point.title,
    meaning: point.meaning ?? '',
    structure: point.structure ?? '',
    explanation: point.explanation ?? '',
    level: String(point.level ?? ''),
    lang: normalizeStudyLang(point.lang),
  };
}

/** Whether the offline highlighter claims the point in `sentence` (the sightings matcher). */
function offlineMatcherFinds(point: PointLike, sentence: string): boolean {
  try {
    return findGrammarSightings(point, [{ id: 'own', sentence, source: 'deck' }], 1).length > 0;
  } catch {
    return false;
  }
}

const ATTACH_KEYS: Record<GrammarAttach, string> = {
  after: 'aiTutor.explain.attach.after',
  before: 'aiTutor.explain.attach.before',
  frame: 'aiTutor.explain.attach.frame',
  standalone: 'aiTutor.explain.attach.standalone',
};

function CloseButton({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  return (
    <button
      type="button"
      className="btn small ai-study-btn lq-hit"
      aria-label={t('aiStudy.close')}
      title={t('aiStudy.close')}
      onClick={onClose}
    >
      ×
    </button>
  );
}

// ---- (a) explain ---------------------------------------------------------------

export function GrammarExplainAi({ point, onClose }: { point: PointLike; onClose: () => void }) {
  const { t, lang } = useT();
  const ai = useAiReadiness();
  const request = useAiStudyRequest<GrammarExplainResult>();
  const brief = useMemo(() => grammarPointBrief(point), [point]);

  const ask = (refresh = false): void => {
    void request.run((requestId) => window.api.aiTutorGrammarExplain({
      requestId,
      point: brief,
      answerLang: lang,
      ...(refresh ? { refresh: true } : {}),
    }));
  };

  useEffect(() => {
    if (ai.loaded && ai.enabled) ask();
    // One question per point; `ask` closes over the point.
  }, [brief.id, ai.loaded, ai.enabled]);

  const result = request.state.status === 'done' ? request.state.result : null;
  const fallback = request.state.status === 'failed' || (ai.loaded && !ai.enabled) ? grammarExplainFallback(brief) : null;
  const contentLang = contentLangOf(point.lang);

  return (
    <section className="ai-study ai-tutor" aria-label={t('aiTutor.explain.title')}>
      <div className="ai-study-head">
        <h4>{t('aiTutor.explain.title')}</h4>
        <CloseButton onClose={onClose} />
      </div>
      <AiStudyStatus state={request.state} onCancel={request.cancel} busyKey="aiTutor.explain.busy" />
      {result && (
        <div className="ai-study-answer" lang={lang}>
          <AiSuggestionBadge />
          <p>{result.summary}</p>
          <p><span className="ai-study-section-label">{t('aiTutor.explain.formation')}</span> {result.formation}</p>
          {result.usage && <p><span className="ai-study-section-label">{t('aiTutor.explain.usage')}</span> {result.usage}</p>}
          {result.nuance && <p><span className="ai-study-section-label">{t('aiTutor.explain.nuance')}</span> {result.nuance}</p>}
          {result.examples.length > 0 && (
            <ul className="ai-study-list">
              {result.examples.map((example) => (
                <li key={example.text} className="ai-study-item">
                  <span lang={contentLang}>{example.text}</span>
                  {example.translation && <span className="muted">{example.translation}</span>}
                </li>
              ))}
            </ul>
          )}
          {request.state.status === 'done' && request.state.cached && (
            <p className="muted ai-study-meta">{t('aiStudy.cached')}</p>
          )}
        </div>
      )}
      {fallback && (
        <div className="ai-tutor-fallback">
          <p className="ai-study-section-label">{t('aiTutor.fallback')}</p>
          {point.meaning && <p>{t('aiTutor.explain.meaning', { meaning: point.meaning })}</p>}
          <p>
            {t(ATTACH_KEYS[fallback.attach], { parts: fallback.fragments.join(' … ') || point.title })}
          </p>
          <p className="muted ai-study-meta">{t('aiTutor.explain.fallbackHint')}</p>
        </div>
      )}
      {request.state.status !== 'running' && ai.enabled && (
        <div className="ai-study-actions" data-ai-entry>
          <button type="button" className="btn small ai-study-btn lq-hit" onClick={() => ask(Boolean(result))}>
            {t(result ? 'aiStudy.askAgain' : 'aiStudy.retry')}
          </button>
        </div>
      )}
    </section>
  );
}

// ---- (b) generated examples ------------------------------------------------------

export function GrammarExamplesAi({ point, existing, onClose }: {
  point: PointLike;
  /** Examples the point already shows (authored and the learner's own). */
  existing: readonly GrammarExample[];
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const ai = useAiReadiness();
  const request = useAiStudyRequest<GrammarExamplesResult>();
  const brief = useMemo(() => grammarPointBrief(point), [point]);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [savedNote, setSavedNote] = useState('');
  const contentLang = contentLangOf(point.lang);

  const ask = (refresh = false): void => {
    setUnticked(new Set());
    setSavedNote('');
    void request.run((requestId) => window.api.aiTutorGrammarExamples({
      requestId,
      point: brief,
      count: 3,
      avoid: existing.map((example) => example.jp).slice(0, 12),
      answerLang: lang,
      ...(refresh ? { refresh: true } : {}),
    }));
  };

  useEffect(() => {
    if (ai.loaded && ai.enabled) ask();
  }, [brief.id, ai.loaded, ai.enabled]);

  const result = request.state.status === 'done' ? request.state.result : null;
  const chosen = result ? result.sentences.filter((s) => !unticked.has(s.text)) : [];

  const save = (): void => {
    if (!chosen.length) return;
    const added = addUserExamples(
      point.id,
      chosen.map((s) => ({ jp: s.text, en: s.translation, ...(s.reading ? { reading: s.reading } : {}), generated: true })),
      existing,
    );
    setSavedNote(t('aiTutor.examples.saved', { count: added }));
  };

  return (
    <section className="ai-study ai-tutor" aria-label={t('aiTutor.examples.title')}>
      <div className="ai-study-head">
        <h4>{t('aiTutor.examples.title')}</h4>
        <CloseButton onClose={onClose} />
      </div>
      <p className="muted ai-study-note">{t('aiTutor.examples.about')}</p>
      <AiStudyStatus state={request.state} onCancel={request.cancel} busyKey="aiTutor.examples.busy" />
      {result && (
        <div className="ai-study-answer" lang={lang}>
          <AiSuggestionBadge />
          <ul className="ai-study-list">
            {result.sentences.map((sentence) => {
              const ticked = !unticked.has(sentence.text);
              const matched = offlineMatcherFinds(point, sentence.text);
              return (
                <li key={sentence.text} className="ai-study-item">
                  <label className="ai-study-check">
                    <input
                      type="checkbox"
                      checked={ticked}
                      onChange={() => setUnticked((prev) => {
                        const next = new Set(prev);
                        if (next.has(sentence.text)) next.delete(sentence.text);
                        else next.add(sentence.text);
                        return next;
                      })}
                    />
                    <span>
                      <span lang={contentLang}>{sentence.text}</span>
                      {sentence.reading && <span className="muted ai-study-meta" lang={contentLang}> {sentence.reading}</span>}
                    </span>
                  </label>
                  <span className="muted">{sentence.translation}</span>
                  <span className="muted ai-study-meta">
                    {t(matched ? 'aiTutor.examples.matched' : 'aiTutor.examples.unmatched')}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="ai-study-actions">
            <button type="button" className="btn small primary ai-study-btn lq-hit" disabled={!chosen.length} onClick={save}>
              {t('aiTutor.examples.save', { count: chosen.length })}
            </button>
            {savedNote && <span className="muted" role="status">{savedNote}</span>}
          </div>
        </div>
      )}
      {(request.state.status === 'failed' || (ai.loaded && !ai.enabled)) && (
        <p className="muted ai-tutor-fallback">{t('aiTutor.examples.fallback')}</p>
      )}
      {request.state.status !== 'running' && ai.enabled && (
        <div className="ai-study-actions" data-ai-entry>
          <button type="button" className="btn small ai-study-btn lq-hit" onClick={() => ask(true)}>
            {t(result ? 'aiTutor.examples.more' : 'aiStudy.retry')}
          </button>
        </div>
      )}
    </section>
  );
}

// ---- (d) sightings check -----------------------------------------------------------

export interface GrammarSightingVerdictView {
  uses: boolean;
  note: string;
}

export function GrammarSightingsAi({ point, sightings, onVerdicts, onClose }: {
  point: PointLike;
  sightings: readonly GrammarSighting[];
  /** Verdicts by sighting id; an empty map clears them. */
  onVerdicts: (verdicts: Map<string, GrammarSightingVerdictView>) => void;
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const ai = useAiReadiness();
  const request = useAiStudyRequest<GrammarSightingResult>();
  const brief = useMemo(() => grammarPointBrief(point), [point]);
  // Ids the request may carry: positions, never the learner's words or card ids.
  const checked = useMemo(() => sightings.slice(0, 6), [sightings]);

  const ask = (refresh = false): void => {
    void request.run((requestId) => window.api.aiTutorGrammarSightings({
      requestId,
      point: brief,
      sentences: checked.map((sighting, index) => ({ id: `s${index}`, text: sighting.sentence })),
      answerLang: lang,
      ...(refresh ? { refresh: true } : {}),
    }));
  };

  useEffect(() => {
    if (ai.loaded && ai.enabled && checked.length) ask();
  }, [brief.id, ai.loaded, ai.enabled, checked.length]);

  useEffect(() => {
    if (request.state.status !== 'done') {
      onVerdicts(new Map());
      return;
    }
    const map = new Map<string, GrammarSightingVerdictView>();
    for (const verdict of request.state.result.verdicts) {
      const sighting = checked[Number(verdict.id.slice(1))];
      if (sighting) map.set(sighting.id, { uses: verdict.uses, note: verdict.note });
    }
    onVerdicts(map);
  }, [request.state, checked]);

  useEffect(() => () => onVerdicts(new Map()), []);

  const result = request.state.status === 'done' ? request.state.result : null;
  const rejected = result ? result.verdicts.filter((v) => !v.uses).length : 0;

  return (
    <div className="ai-study ai-tutor ai-tutor-inline" role="group" aria-label={t('aiTutor.sightings.title')}>
      <div className="ai-study-head">
        <h4>{t('aiTutor.sightings.title')}</h4>
        <CloseButton onClose={onClose} />
      </div>
      <AiStudyStatus state={request.state} onCancel={request.cancel} busyKey="aiTutor.sightings.busy" />
      {result && (
        <p className="ai-study-note" role="status">
          <AiSuggestionBadge /> {t('aiTutor.sightings.summary', { confirmed: result.verdicts.length - rejected, rejected })}
        </p>
      )}
      {(request.state.status === 'failed' || (ai.loaded && !ai.enabled)) && (
        <p className="muted ai-tutor-fallback">{t('aiTutor.sightings.fallback')}</p>
      )}
      {request.state.status !== 'running' && ai.enabled && checked.length > 0 && (
        <div className="ai-study-actions" data-ai-entry>
          <button type="button" className="btn small ai-study-btn lq-hit" onClick={() => ask(Boolean(result))}>
            {t(result ? 'aiStudy.askAgain' : 'aiStudy.retry')}
          </button>
        </div>
      )}
    </div>
  );
}

// ---- (c) production practice -------------------------------------------------------

export function GrammarProductionAi({ point, ratingLabel, onUseRating }: {
  point: PointLike;
  /** The surface's own name for a suggested rating ("Hard", "Again"…). */
  ratingLabel: (rating: GrammarSuggestedRating) => string;
  /** Applies the rating; only ever called from the learner's own press. */
  onUseRating: (rating: GrammarSuggestedRating) => void;
}) {
  const { t, lang } = useT();
  const ai = useAiReadiness();
  const request = useAiStudyRequest<GrammarProductionResult>();
  const brief = useMemo(() => grammarPointBrief(point), [point]);
  const [sentence, setSentence] = useState('');
  const [offline, setOffline] = useState<{ usesPattern: boolean; suggestedRating: GrammarSuggestedRating } | null>(null);
  const contentLang = contentLangOf(point.lang);

  // A new point is a new exercise.
  useEffect(() => {
    request.reset();
    setSentence('');
    setOffline(null);
  }, [brief.id]);

  const clean = sentence.trim();
  const inStudyLang = clean ? tutorTextInStudyLang(clean, brief.lang) : false;

  const check = (event?: FormEvent): void => {
    event?.preventDefault();
    if (!clean || !inStudyLang) return;
    setOffline(grammarProductionFallback(clean, brief, offlineMatcherFinds(point, clean)));
    if (ai.loaded && ai.enabled) {
      void request.run((requestId) => window.api.aiTutorGrammarProduction({
        requestId,
        point: brief,
        sentence: clean,
        answerLang: lang,
      }));
    }
  };

  const result = request.state.status === 'done' ? request.state.result : null;
  const showOffline = offline && !result && request.state.status !== 'running';
  const suggestion = result?.suggestedRating ?? (showOffline ? offline?.suggestedRating : undefined);

  return (
    <section className="ai-study ai-tutor" aria-label={t('aiTutor.production.title')}>
      <div className="ai-study-head">
        <h4>{t('aiTutor.production.title')}</h4>
      </div>
      <form className="ai-tutor-form" onSubmit={check}>
        <label className="ai-tutor-field">
          <span>{t('aiTutor.production.label', { pattern: point.title })}</span>
          <input
            type="text"
            value={sentence}
            lang={contentLang}
            maxLength={200}
            placeholder={t('aiTutor.production.placeholder')}
            onChange={(event) => {
              setSentence(event.target.value);
              setOffline(null);
              if (request.state.status !== 'running') request.reset();
            }}
          />
        </label>
        <button type="submit" className="btn small ai-study-btn lq-hit" disabled={!inStudyLang || request.state.status === 'running'}>
          {t('aiTutor.production.check')}
        </button>
      </form>
      {clean && !inStudyLang && <p className="muted ai-study-note">{t('aiTutor.production.wrongScript')}</p>}
      <AiStudyStatus state={request.state} onCancel={request.cancel} busyKey="aiTutor.production.busy" />
      {result && (
        <div className="ai-study-answer" lang={lang}>
          <AiSuggestionBadge />
          <ul className="ai-study-notes">
            <li>{t(result.usesPattern ? 'aiTutor.production.uses' : 'aiTutor.production.missing')}</li>
            {result.usesPattern && <li>{t(result.correct ? 'aiTutor.production.correct' : 'aiTutor.production.incorrect')}</li>}
            {result.usesPattern && result.correct && (
              <li>{t(result.natural ? 'aiTutor.production.natural' : 'aiTutor.production.unnatural')}</li>
            )}
          </ul>
          <p>{result.explanation}</p>
          {result.corrected && (
            <p>
              <span className="ai-study-section-label">{t('aiTutor.production.corrected')}</span>{' '}
              <span lang={contentLang}>{result.corrected}</span>
            </p>
          )}
        </div>
      )}
      {showOffline && offline && (
        <div className="ai-tutor-fallback">
          <p className="ai-study-section-label">{t('aiTutor.fallback')}</p>
          <p>{t(offline.usesPattern ? 'aiTutor.production.offlineFound' : 'aiTutor.production.offlineMissing')}</p>
        </div>
      )}
      {suggestion && (
        <div className="ai-study-actions">
          <span className="muted">{t('aiTutor.production.suggested', { rating: ratingLabel(suggestion) })}</span>
          <button type="button" className="btn small primary ai-study-btn lq-hit" onClick={() => onUseRating(suggestion)}>
            {t('aiTutor.production.useRating', { rating: ratingLabel(suggestion) })}
          </button>
        </div>
      )}
    </section>
  );
}
