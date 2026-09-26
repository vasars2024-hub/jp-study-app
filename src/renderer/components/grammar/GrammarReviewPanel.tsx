/**
 * Grammar review: the points the scheduler says are due, one at a time.
 *
 * The tab called "Review" used to be the corpus curation tool (now "Curate"),
 * so there was no way to be shown a grammar point again when it was due. This
 * is that: recall the pattern, reveal it, rate it, and the flashcard scheduler
 * (`grammarSrs.ts`) decides when it comes back. Practice-test answers and
 * recently missed points feed the same schedule, so nothing is double-counted.
 */
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { GRAMMAR, type NormalizedGrammarPoint } from '../../data/grammar';
import { explanationCopiesMeaning, structureCopiesTitle } from '../../data/grammar/hollow';
import { previewSchedule } from '../../../shared/flashcardScheduling';
import type { LocalSrsRating } from '../../../shared/localSrs';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { loadSchedulingConfig } from '../../flashcardScheduling';
import {
  dueGrammarIds,
  enrolGrammarPoints,
  loadGrammarSrs,
  nextGrammarDueAt,
  onGrammarSrsChanged,
  reviewGrammarPoint,
  saveGrammarSrs,
  seedMissed,
} from '../../grammarSrs';
import { loadCollections, onGrammarCollectionsChanged } from '../../grammarCollections';
import { loadSessionHistory, recentlyMissed } from '../../grammarSessionHistory';
import { applyGrade, loadFamiliarity, saveFamiliarity, type AnswerGrade } from '../../grammarFamiliarity';
import { appendReviewLog } from '../../reviewLog';
import { useT } from '../../i18n';
import { contentLangOf } from '../../studyEnvironment';
import { Button } from '../ui';

const RATINGS: Array<{ rating: LocalSrsRating; key: string; grade: AnswerGrade }> = [
  { rating: 'again', key: 'grammar.review.again', grade: 'hard' },
  { rating: 'hard', key: 'grammar.review.hard', grade: 'okay' },
  { rating: 'good', key: 'grammar.review.good', grade: 'good' },
  { rating: 'easy', key: 'grammar.review.easy', grade: 'good' },
];

export default function GrammarReviewPanel() {
  const { t, lang } = useT();
  const [srs, setSrs] = useState(() => loadGrammarSrs());
  const [collections, setCollections] = useState(() => loadCollections());
  const [revealed, setRevealed] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const byId = useMemo(() => new Map<string, NormalizedGrammarPoint>(GRAMMAR.map((p) => [p.id, p])), []);
  const known = useMemo(() => new Set(byId.keys()), [byId]);

  // Missed practice answers enter the schedule as due now (once each).
  useEffect(() => {
    const current = loadGrammarSrs();
    const missed = recentlyMissed(loadSessionHistory()).filter((id) => known.has(id));
    const seeded = seedMissed(current, missed, Date.now());
    if (Object.keys(seeded).length !== Object.keys(current).length) saveGrammarSrs(seeded);
    setSrs(seeded);
  }, [known]);

  useEffect(() => onGrammarSrsChanged(() => setSrs(loadGrammarSrs())), []);
  useEffect(() => onGrammarCollectionsChanged(() => setCollections(loadCollections())), []);
  // A relearn step is minutes, not days: re-check what is due once a minute.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const due = useMemo(() => dueGrammarIds(srs, now, known), [srs, now, known]);
  const current = due.length ? byId.get(due[0]) ?? null : null;
  const scheduled = useMemo(() => Object.keys(srs).filter((id) => known.has(id)).length, [srs, known]);
  const nextAt = useMemo(() => nextGrammarDueAt(srs, now), [srs, now]);
  const previews = useMemo(
    () => (current ? previewSchedule(srs[current.id]?.repetitions ? srs[current.id] : undefined, loadSchedulingConfig(), now) : null),
    [current, srs, now],
  );

  const queueIds = useMemo(() => [...collections.queue].filter((id) => known.has(id) && !srs[id]), [collections, known, srs]);
  const favoriteIds = useMemo(() => [...collections.favorites].filter((id) => known.has(id) && !srs[id]), [collections, known, srs]);

  const enrol = useCallback((ids: string[]) => {
    const next = enrolGrammarPoints(loadGrammarSrs(), ids, Date.now());
    saveGrammarSrs(next);
    setSrs(next);
    setNow(Date.now());
  }, []);

  const rate = useCallback(
    (rating: LocalSrsRating, grade: AnswerGrade) => {
      if (!current) return;
      const at = Date.now();
      const next = reviewGrammarPoint(loadGrammarSrs(), current.id, rating, loadSchedulingConfig(), at);
      saveGrammarSrs(next);
      setSrs(next);
      saveFamiliarity(applyGrade(loadFamiliarity(), current.id, grade, at));
      appendReviewLog({ mode: 'grammar', grammarId: current.id, word: current.title, correct: rating !== 'again', at });
      setReviewedCount((n) => n + 1);
      setRevealed(false);
      setNow(at);
    },
    [current],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!current) return;
    if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      setRevealed(true);
      return;
    }
    const index = ['1', '2', '3', '4'].indexOf(e.key);
    if (revealed && index >= 0) {
      e.preventDefault();
      rate(RATINGS[index].rating, RATINGS[index].grade);
    }
  };

  const dayLabel = (days: number) =>
    days < 1 ? t('grammar.review.interval.soon') : t('grammar.review.interval.days', { count: Math.round(days) });

  const locale = LANG_TAGS[lang] ?? 'en';

  return (
    <div className="gx-review" tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="gx-review-summary muted" role="status">
        {t('grammar.review.summary', { due: due.length, scheduled })}
        {reviewedCount > 0 && <> · {t('grammar.review.done', { count: reviewedCount })}</>}
      </div>

      {current ? (
        <article className="gx-review-card">
          <header className="gx-review-head">
            <h2 lang={contentLangOf(current.lang)}>{current.title}</h2>
            <span className={`gram-badge lv-${current.level}`}>{current.level}</span>
          </header>
          {!revealed ? (
            <div className="gx-review-actions">
              <p className="muted">{t('grammar.review.recall')}</p>
              <Button variant="primary" onClick={() => setRevealed(true)} autoFocus>
                {t('grammar.review.show')}
              </Button>
            </div>
          ) : (
            <>
              <p className="gram-gloss">{current.meaning}</p>
              {!structureCopiesTitle(current) && (
                <p className="gram-structure" lang={contentLangOf(current.lang)}>
                  {current.structure}
                </p>
              )}
              {!explanationCopiesMeaning(current) && <p>{current.explanation}</p>}
              {current.examples.length > 0 && (
                <ul className="gram-examples">
                  {current.examples.slice(0, 2).map((ex, i) => (
                    <li key={i}>
                      <span className="gram-ex-jp" lang={contentLangOf(current.lang)}>
                        {ex.jp}
                      </span>
                      <span className="gram-ex-en">{ex.en}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="gx-review-rate" role="group" aria-label={t('grammar.review.rateLabel')}>
                {RATINGS.map(({ rating, key, grade }) => (
                  <Button
                    key={rating}
                    variant={rating === 'good' ? 'primary' : 'default'}
                    onClick={() => rate(rating, grade)}
                  >
                    <span>{t(key)}</span>
                    {previews && <span className="gx-review-interval">{dayLabel(previews[rating])}</span>}
                  </Button>
                ))}
              </div>
            </>
          )}
        </article>
      ) : (
        <div className="gx-review-empty">
          <p>{t('grammar.review.empty')}</p>
          {nextAt !== null && (
            <p className="muted">
              {t('grammar.review.nextDue', {
                when: new Date(nextAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }),
              })}
            </p>
          )}
          <p className="muted">{t('grammar.review.emptyHint')}</p>
          <div className="gx-review-actions">
            <Button
              disabled={queueIds.length === 0}
              title={queueIds.length === 0 ? t('grammar.review.nothingToEnrol') : undefined}
              onClick={() => enrol(queueIds)}
            >
              {t('grammar.review.enrolQueue', { count: queueIds.length })}
            </Button>
            <Button
              disabled={favoriteIds.length === 0}
              title={favoriteIds.length === 0 ? t('grammar.review.nothingToEnrol') : undefined}
              onClick={() => enrol(favoriteIds)}
            >
              {t('grammar.review.enrolFavorites', { count: favoriteIds.length })}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
