/**
 * Per-novel study view (VN 7.5): known-word coverage and a glossary of the
 * novel's most frequent unknown words, lines read per day, and the mining
 * preferences (context lines, screenshot).
 */
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { getLevel, onKnowledgeChanged } from '../../knownWords';
import { getTokenizer } from '../../tokenizer';
import { studyTokens, studyTokensReady } from '../../studyTokens';
import { lookupGlosses } from '../../visualNovelMining';
import { useVn5StudyPrefs } from '../../visualNovelStudy5Prefs';
import type { VisualNovelTextCapture } from '../../../shared/visualNovel';
import {
  vn5Coverage,
  vn5DailyStats,
  vn5ReadingStreak,
  type Vn5ContextLines,
  type Vn5Coverage,
} from '../../../shared/visualNovelStudy5';
import { studyLangFromTag } from '../../../shared/studyLang';
import './vn5.css';

/** The glossary reads at most this many recent lines; a whole long novel would stall the panel. */
export const VN5_COVERAGE_LINE_LIMIT = 3_000;
const DAILY_DAYS = 14;

export default function VisualNovelStudy5Panel({
  captures,
  language,
  active = true,
}: {
  /** The novel's lines, oldest first. */
  captures: readonly VisualNovelTextCapture[];
  language: string;
  /** False while the tab is hidden: a live capture must not re-tokenize the script on every line. */
  active?: boolean;
}) {
  const { t, lang } = useT();
  const [prefs, setPrefs] = useVn5StudyPrefs();
  const [coverage, setCoverage] = useState<Vn5Coverage | null>(null);
  const [glosses, setGlosses] = useState<Map<string, string>>(new Map());
  const [knowledgeStamp, setKnowledgeStamp] = useState(0);
  const studyLang = studyLangFromTag(language) ?? 'ja';

  useEffect(() => onKnowledgeChanged(() => setKnowledgeStamp((n) => n + 1)), []);

  const scope = useMemo(
    () => captures.filter((capture) => capture.kind !== 'system').slice(-VN5_COVERAGE_LINE_LIMIT),
    [captures],
  );

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    const run = async (): Promise<void> => {
      if (!scope.length) {
        setCoverage(null);
        return;
      }
      if (!studyTokensReady(studyLang)) {
        try {
          await getTokenizer();
        } catch {
          return;
        }
      }
      if (cancelled) return;
      const next = vn5Coverage(
        scope.map((capture) => ({ text: capture.japanese, tokens: studyTokens(capture.japanese, studyLang) })),
        getLevel,
      );
      setCoverage(next);
      const found = await lookupGlosses(next.glossary.map((row) => row.lemma));
      if (!cancelled) setGlosses(found);
    };
    // Off the click that opened the tab: tokenizing thousands of lines is not instant.
    const timer = window.setTimeout(() => void run(), 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [scope, studyLang, knowledgeStamp, active]);

  const daily = useMemo(() => vn5DailyStats(captures, Date.now(), DAILY_DAYS), [captures]);
  const streak = vn5ReadingStreak(daily);
  const maxLines = Math.max(1, ...daily.map((day) => day.lines));
  const weekLines = daily.slice(-7).reduce((sum, day) => sum + day.lines, 0);
  const percent = coverage?.knownRatio != null ? Math.round(coverage.knownRatio * 100) : null;
  const dayFormat = useMemo(
    () => new Intl.DateTimeFormat(lang === 'zh' ? 'zh-Hans' : lang, { month: 'short', day: 'numeric' }),
    [lang],
  );

  return (
    <section className="vn5-coverage" aria-label={t('vn5.panel.aria')} data-vn5-study="">
      <div className="visual-novel-reading-head">
        <strong>{t('vn5.panel.coverageHead')}</strong>
        {scope.length >= VN5_COVERAGE_LINE_LIMIT && <span>{t('vn5.panel.recentLines', { count: scope.length })}</span>}
      </div>
      {!scope.length && <p className="muted">{t('vn5.panel.noLines')}</p>}
      {scope.length > 0 && !coverage && <p className="muted" role="status">{t('vn5.panel.measuring')}</p>}
      {coverage && percent != null && (
        <>
          <div
            className="vn5-coverage-meter"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={t('vn5.panel.knownPct', { percent })}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          <p className="vn5-coverage-figures">
            <span>{t('vn5.panel.knownPct', { percent })}</span>
            <span>{t('vn5.panel.uniqueKnown', { known: coverage.uniqueKnown, count: coverage.uniqueWords })}</span>
            <span>{t('vn5.panel.iPlusOneLines', { count: coverage.iPlusOneLines })}</span>
          </p>
          {coverage.glossary.length > 0 && (
            <>
              <strong>{t('vn5.panel.glossaryHead')}</strong>
              <ul className="vn5-glossary" aria-label={t('vn5.panel.glossaryHead')}>
                {coverage.glossary.map((row) => (
                  <li key={row.lemma} data-vn5-gloss={row.lemma}>
                    <span lang={studyLang}>{row.lemma}</span>
                    <span className="vn5-glossary-count">{t('vn5.panel.times', { count: row.count })}</span>
                    <span className="vn5-glossary-gloss" title={row.example}>{glosses.get(row.lemma) ?? ''}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <div className="visual-novel-reading-head">
        <strong>{t('vn5.panel.dailyHead')}</strong>
        <span>{t('vn5.panel.weekLines', { count: weekLines })}</span>
        {streak > 0 && <span>{t('vn5.panel.streak', { count: streak })}</span>}
      </div>
      <ol className="vn5-daily" aria-label={t('vn5.panel.dailyHead')}>
        {daily.map((day) => {
          const label = t('vn5.panel.dayBar', {
            day: dayFormat.format(new Date(`${day.day}T12:00:00`)),
            count: day.lines,
          });
          return (
            <li
              key={day.day}
              className={day.lines === 0 ? 'is-empty' : undefined}
              style={day.lines ? { height: `${Math.max(8, Math.round((day.lines / maxLines) * 100))}%` } : undefined}
              title={label}
              aria-label={label}
            />
          );
        })}
      </ol>

      <fieldset className="vn5-context-setting">
        <legend>{t('vn5.mine.head')}</legend>
        <label>
          {t('vn5.mine.contextLines')}
          <select
            value={prefs.contextLines}
            aria-label={t('vn5.mine.contextLines')}
            onChange={(event) => setPrefs({ contextLines: Number(event.target.value) as Vn5ContextLines })}
          >
            <option value={0}>{t('vn5.mine.contextNone')}</option>
            <option value={1}>{t('vn5.mine.contextCount', { count: 1 })}</option>
            <option value={2}>{t('vn5.mine.contextCount', { count: 2 })}</option>
          </select>
        </label>
        <label>
          {t('vn5.mine.contextAfterLines')}
          <select
            value={prefs.contextAfterLines}
            aria-label={t('vn5.mine.contextAfterLines')}
            data-vn5-pref="context-after"
            onChange={(event) => setPrefs({ contextAfterLines: Number(event.target.value) as Vn5ContextLines })}
          >
            <option value={0}>{t('vn5.mine.contextNone')}</option>
            <option value={1}>{t('vn5.mine.contextAfterCount', { count: 1 })}</option>
            <option value={2}>{t('vn5.mine.contextAfterCount', { count: 2 })}</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={prefs.attachScreenshot}
            onChange={(event) => setPrefs({ attachScreenshot: event.target.checked })}
          />
          {t('vn5.mine.screenshot')}
        </label>
        <small className="muted">{t('vn5.mine.screenshotHint')}</small>
      </fieldset>
    </section>
  );
}
