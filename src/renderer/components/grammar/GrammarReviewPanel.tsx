/**
 * Grammar review: the points the scheduler says are due, one at a time.
 *
 * The tab called "Review" used to be the corpus curation tool (now "Curate"),
 * so there was no way to be shown a grammar point again when it was due. This
 * is that: answer the prompt, reveal, rate Again/Hard/Good/Easy, and the
 * flashcard scheduler (`grammarSrs.ts`) decides when it comes back. Practice-test
 * answers and recently missed points feed the same schedule, so nothing is
 * double-counted.
 *
 * gram2: the prompt is no longer always "here is the title, recall it". It is
 * built from the point's own examples (`grammarReviewPrompt.ts`) — recognition
 * for a new or just-failed point, a cloze with the pattern blanked out once it has
 * been learned, production from the translation once it is mature — and a cloze
 * can be typed and checked before rating. Below the card: progress per JLPT/HSK
 * level, with a way to start the next few new points of a level.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
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
import {
  applyGrade,
  loadFamiliarity,
  onFamiliarityChanged,
  saveFamiliarity,
  type AnswerGrade,
} from '../../grammarFamiliarity';
import { grammarLevelProgress } from '../../grammarProgress';
import { checkClozeAnswer, grammarReviewPrompt, type GrammarCloze } from '../../grammarReviewPrompt';
import { appendReviewLog } from '../../reviewLog';
import { useT } from '../../i18n';
import { contentLangOf, getStudyLang, onStudyLangChanged } from '../../studyEnvironment';
import { Button } from '../ui';
import { srsIntervalLabel } from '../../srsIntervalLabel';
import './grammarReview2.css';

const RATINGS: Array<{ rating: LocalSrsRating; key: string; grade: AnswerGrade }> = [
  { rating: 'again', key: 'grammar.review.again', grade: 'hard' },
  { rating: 'hard', key: 'grammar.review.hard', grade: 'okay' },
  { rating: 'good', key: 'grammar.review.good', grade: 'good' },
  { rating: 'easy', key: 'grammar.review.easy', grade: 'good' },
];

/** New points a "learn next" click puts into the schedule. */
const LEARN_BATCH = 5;

/** The example with its pattern blanked (front) or marked (back). */
function ClozeSentence({ cloze, revealed, lang }: { cloze: GrammarCloze; revealed: boolean; lang: string }) {
  return (
    <span className="gx-review-cloze" lang={contentLangOf(lang)}>
      {cloze.segments.map((segment, i) =>
        !segment.blank ? (
          <span key={i}>{segment.text}</span>
        ) : revealed ? (
          <mark key={i}>{segment.text}</mark>
        ) : (
          <span key={i} className="gx-review-blank" aria-hidden="true">
            {'＿'.repeat(Math.max(2, Math.min(6, [...segment.text].length)))}
          </span>
        ),
      )}
    </span>
  );
}

export default function GrammarReviewPanel() {
  const { t, lang } = useT();
  const [srs, setSrs] = useState(() => loadGrammarSrs());
  const [collections, setCollections] = useState(() => loadCollections());
  const [familiarity, setFamiliarity] = useState(() => loadFamiliarity());
  const [studyLang, setStudyLangState] = useState(getStudyLang);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState('');
  const [checked, setChecked] = useState<boolean | null>(null);
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
  useEffect(() => onFamiliarityChanged(() => setFamiliarity(loadFamiliarity())), []);
  useEffect(() => onStudyLangChanged(setStudyLangState), []);
  // A relearn step is minutes, not days: re-check what is due once a minute.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const due = useMemo(() => dueGrammarIds(srs, now, known), [srs, now, known]);
  const current = due.length ? byId.get(due[0]) ?? null : null;
  const currentState = current ? srs[current.id] : undefined;
  const scheduled = useMemo(() => Object.keys(srs).filter((id) => known.has(id)).length, [srs, known]);
  const nextAt = useMemo(() => nextGrammarDueAt(srs, now), [srs, now]);
  const previews = useMemo(
    () => (current ? previewSchedule(currentState?.repetitions ? currentState : undefined, loadSchedulingConfig(), now) : null),
    [current, currentState, now],
  );
  // Keyed on the point and its schedule, so the prompt is stable while it is on screen
  // and changes shape as the point matures.
  const prompt = useMemo(
    () => (current ? grammarReviewPrompt(current, currentState) : null),
    [current, currentState],
  );

  const queueIds = useMemo(() => [...collections.queue].filter((id) => known.has(id) && !srs[id]), [collections, known, srs]);
  const favoriteIds = useMemo(() => [...collections.favorites].filter((id) => known.has(id) && !srs[id]), [collections, known, srs]);

  /** Per level of the study language: known/total from familiarity, scheduled/due from the schedule. */
  const levels = useMemo(() => {
    const rows = grammarLevelProgress(GRAMMAR, familiarity, studyLang);
    const extra = new Map(rows.map((row) => [row.level, { scheduled: 0, due: 0, fresh: [] as string[] }]));
    const seen = new Set<string>();
    for (const point of GRAMMAR) {
      if (point.lang !== studyLang || seen.has(point.id)) continue;
      seen.add(point.id);
      const slot = extra.get(point.level);
      if (!slot) continue;
      const state = srs[point.id];
      if (state) {
        slot.scheduled += 1;
        if (state.dueAt <= now) slot.due += 1;
      } else if (slot.fresh.length < LEARN_BATCH) {
        slot.fresh.push(point.id);
      }
    }
    return rows.map((row) => ({ ...row, ...(extra.get(row.level) ?? { scheduled: 0, due: 0, fresh: [] }) }));
  }, [familiarity, studyLang, srs, now]);

  const enrol = useCallback((ids: string[]) => {
    const next = enrolGrammarPoints(loadGrammarSrs(), ids, Date.now());
    saveGrammarSrs(next);
    setSrs(next);
    setNow(Date.now());
  }, []);

  const resetAnswer = (): void => {
    setRevealed(false);
    setTyped('');
    setChecked(null);
  };

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
      setTyped('');
      setChecked(null);
      setNow(at);
    },
    [current],
  );

  const checkTyped = (e: FormEvent): void => {
    e.preventDefault();
    if (!prompt?.cloze || !typed.trim()) return;
    setChecked(checkClozeAnswer(typed, prompt.cloze.answers));
    setRevealed(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!current) return;
    // Typing an answer: digits and Space belong to the field, Enter submits its form.
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
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

  // The same hint Flashcards shows under its grade buttons.
  const dayLabel = (days: number) => srsIntervalLabel(days, t);

  const locale = LANG_TAGS[lang] ?? 'en';
  const kind = prompt?.kind ?? 'recognition';
  const cloze = prompt?.cloze;
  const pointLang = current?.lang ?? 'ja';

  return (
    <div className="gx-review" tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="gx-review-summary muted" role="status">
        {t('grammar.review.summary', { due: due.length, scheduled })}
        {reviewedCount > 0 && <> · {t('grammar.review.done', { count: reviewedCount })}</>}
      </div>

      {current ? (
        <article className="gx-review-card" data-prompt={kind}>
          <header className="gx-review-head">
            {/* A cloze or production prompt must not print the pattern it asks for. */}
            {kind === 'recognition' || revealed ? (
              <h2 lang={contentLangOf(current.lang)}>{current.title}</h2>
            ) : (
              <h2>{t(kind === 'cloze' ? 'gram2.prompt.clozeTitle' : 'gram2.prompt.productionTitle')}</h2>
            )}
            <span className={`gram-badge lv-${current.level}`}>{current.level}</span>
          </header>

          {kind === 'cloze' && cloze && (
            <div className="gx-review-prompt">
              <p className="gx-review-sentence">
                <ClozeSentence cloze={cloze} revealed={revealed} lang={pointLang} />
              </p>
              {cloze.translation && <p className="gram-ex-en muted">{cloze.translation}</p>}
              {!revealed && (
                <form className="gx-review-answer" onSubmit={checkTyped}>
                  <input
                    type="text"
                    value={typed}
                    lang={contentLangOf(pointLang)}
                    aria-label={t('gram2.prompt.answerLabel')}
                    placeholder={t('gram2.prompt.answerPlaceholder')}
                    onChange={(e) => setTyped(e.target.value)}
                  />
                  <Button type="submit" disabled={!typed.trim()}>
                    {t('gram2.prompt.check')}
                  </Button>
                </form>
              )}
            </div>
          )}

          {kind === 'production' && cloze && (
            <div className="gx-review-prompt">
              <p className="gram-gloss">{current.meaning}</p>
              <p className="muted">{t('gram2.prompt.productionHint')}</p>
              <p className="gx-review-sentence">{cloze.translation}</p>
              {revealed && (
                <p className="gx-review-sentence">
                  <ClozeSentence cloze={cloze} revealed lang={pointLang} />
                </p>
              )}
            </div>
          )}

          {!revealed ? (
            <div className="gx-review-actions">
              <p className="muted">
                {kind === 'recognition'
                  ? t('grammar.review.recall')
                  : kind === 'cloze'
                    ? t('gram2.prompt.clozeHint')
                    : t('gram2.prompt.productionReveal')}
              </p>
              <Button variant="primary" onClick={() => setRevealed(true)} autoFocus={kind !== 'cloze'}>
                {t('grammar.review.show')}
              </Button>
            </div>
          ) : (
            <>
              {checked !== null && (
                <p className={`gx-review-verdict ${checked ? 'is-right' : 'is-wrong'}`} role="status">
                  {checked
                    ? t('gram2.prompt.right')
                    : t('gram2.prompt.wrong', { answer: cloze?.answers.join(' … ') ?? '' })}
                </p>
              )}
              {kind !== 'production' && <p className="gram-gloss">{current.meaning}</p>}
              {!structureCopiesTitle(current) && (
                <p className="gram-structure" lang={contentLangOf(current.lang)}>
                  {current.structure}
                </p>
              )}
              {!explanationCopiesMeaning(current) && <p>{current.explanation}</p>}
              {kind === 'recognition' && current.examples.length > 0 && (
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
                    // A checked wrong answer points at Again; otherwise Good is the default.
                    variant={(checked === false ? rating === 'again' : rating === 'good') ? 'primary' : 'default'}
                    onClick={() => rate(rating, grade)}
                  >
                    <span>{t(key)}</span>
                    {previews && <span className="gx-review-interval">{dayLabel(previews[rating])}</span>}
                  </Button>
                ))}
              </div>
              <button type="button" className="gx-review-undo-reveal muted" onClick={resetAnswer}>
                {t('gram2.prompt.hideAgain')}
              </button>
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

      {levels.length > 0 && (
        <section className="gx-review-levels" aria-label={t('gram2.levels.title')}>
          <h3>{t('gram2.levels.title')}</h3>
          <ul>
            {levels.map((row) => {
              const knownPct = row.total ? Math.round((row.known / row.total) * 100) : 0;
              return (
                <li key={row.level} className="gx-review-level">
                  <span className={`gram-badge lv-${row.level}`}>{row.level.replace(/^HSK/, 'HSK ')}</span>
                  <span
                    className="gx-review-level-bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={knownPct}
                    aria-label={t('gram2.levels.knownAria', { level: row.level, known: row.known, total: row.total })}
                  >
                    <span className="gx-review-level-known" style={{ width: `${knownPct}%` }} />
                  </span>
                  <span className="gx-review-level-text muted">
                    {t('gram2.levels.row', { known: row.known, total: row.total, scheduled: row.scheduled, due: row.due })}
                  </span>
                  <Button
                    disabled={row.fresh.length === 0}
                    title={row.fresh.length === 0 ? t('gram2.levels.allStarted') : undefined}
                    onClick={() => enrol(row.fresh)}
                  >
                    {t('gram2.levels.learnNext', { count: row.fresh.length })}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
