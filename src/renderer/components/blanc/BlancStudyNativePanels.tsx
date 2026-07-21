/**
 * Blanc's study-native toolbox panels — small tools built directly on study
 * infrastructure the app has already paid for, rather than parity ports of a
 * Study OS view or generic PowerToys-shaped utilities.
 *
 * See BLANC_REFINEMENT_PLAN.md, "Study-native toolbox modules". Item 1
 * (clipboard auto-lookup) shipped as the Blanc `clipboard` panel; this file is
 * the home for items 2-7.
 *
 * Pillar 0 rule: `blanc-tool-detail` + `fieldset`/`legend`, and never an import
 * of `AppChrome` / `MenuBar` / `StatusBar` (or of any Study OS `*View`, which
 * would drag that chrome in through the import graph).
 *
 * String policy: Blanc's own chrome is deliberately outside the app-wide i18n
 * sweep (BLANC_REFINEMENT_PLAN.md, Pillar 8) — the plan calls for one pass over
 * the whole surface if Blanc ever becomes primary, explicitly not piecemeal. So
 * these strings are plain English, matching every other Blanc panel.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  alignFurigana,
  segmentsToBrackets,
  segmentsToKana,
  segmentsToRuby,
  type FuriganaSegment,
} from '../../../shared/furigana';
import { getTokenizer, tokenizeSync } from '../../tokenizer';
import {
  allCounterReadings,
  readInput,
  type NumberReading,
} from '../../../shared/japaneseNumbers';
import { speak } from '../../tts';
import {
  CONSOLE_CATEGORIES,
  atLeastLevel,
  countByLevel,
  detailToText,
  filterEntries,
  formatEntriesForReport,
  type ConsoleCategory,
  type ConsoleLevel,
} from '../../../shared/blancConsole';
import {
  clearBlancConsole,
  getBlancConsole,
  getBlancConsoleDropped,
  logBlanc,
  newCorrelationId,
  onBlancConsoleChanged,
} from '../../blancConsole';
import {
  PITCH_PATTERN_LABELS,
  isPitchLookup,
  moraPitch,
  pitchPatternName,
  splitMorae,
  type PitchLookup,
} from '../../../shared/pitchAccent';
import {
  dayLabel,
  emptyForecast,
  isDueForecast,
  localBacklog,
  summarizeForecast,
  type DueForecast,
} from '../../../shared/reviewForecast';
import { loadDeck } from '../../flashcardDeck';
import { WK_LEVELS, knowledgeCounts, type WkLevel } from '../../knownWords';
import {
  CLASS_LABELS,
  DRILL_WORDS,
  FORMS,
  checkAnswer,
  conjugate,
  type ConjugationForm,
  type WordClass,
} from '../../../shared/conjugate';
import SubtitleCueLine from '../SubtitleCueLine';
import { useWhisperTranscribe, type TranscribeCue } from '../../useWhisperTranscribe';
import {
  loadWhisperDevice,
  loadWhisperModelTier,
  onWhisperDeviceChanged,
  onWhisperModelChanged,
  type WhisperDevice,
  type WhisperModelTier,
} from '../../whisperSettings';
import { whisperSpec } from '../../../shared/whisperModels';
import { formatBytes } from '../../../shared/assetRegistry';
import { isDownloadedIn, loadDownloaded, onDownloadedChanged } from '../../whisperModelCache';
import { getStudyLang, onStudyLangChanged } from '../../studyEnvironment';

type FuriganaFormat = 'ruby' | 'brackets' | 'kana';

const FORMATS: { id: FuriganaFormat; label: string; hint: string }[] = [
  { id: 'ruby', label: 'Ruby HTML', hint: '<ruby> markup — paste into Anki or a web page.' },
  { id: 'brackets', label: 'Anki brackets', hint: 'Kanji[かんじ] — Anki’s furigana field syntax.' },
  { id: 'kana', label: 'Kana only', hint: 'The whole passage rewritten in kana.' },
];

/**
 * Tokenizing is capped and debounced because it is synchronous once kuromoji is
 * built: a long paste would otherwise block the compositor mid-drag, which
 * CLAUDE.md's performance rule forbids.
 */
const MAX_INPUT = 5000;
const DEBOUNCE_MS = 250;

/**
 * Study-native item 3 — Furigana generator.
 *
 * Composition over the bundled kuromoji tokenizer plus `shared/furigana.ts`; no
 * new dependency and no network. The alignment (annotating only kanji runs, so
 * 食べる becomes 食[た]べる rather than たべる over the whole word) lives in the
 * shared module, which is pure and unit-tested without the 20 MB dictionary.
 */
export function BlancFuriganaPanel() {
  const [text, setText] = useState('');
  const [format, setFormat] = useState<FuriganaFormat>('ruby');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [debounced, setDebounced] = useState('');
  const [copied, setCopied] = useState(false);

  // Build the tokenizer once, on mount. It is shared app-wide, so this is
  // usually already warm from the readers.
  useEffect(() => {
    let alive = true;
    getTokenizer().then(
      () => alive && setReady(true),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(text), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [text]);

  const segments = useMemo<FuriganaSegment[]>(() => {
    if (!ready || !debounced.trim()) return [];
    const out: FuriganaSegment[] = [];
    for (const token of tokenizeSync(debounced.slice(0, MAX_INPUT))) {
      out.push(...alignFurigana(token.surface, token.reading));
    }
    return out;
  }, [ready, debounced]);

  const output = useMemo(() => {
    if (!segments.length) return '';
    if (format === 'brackets') return segmentsToBrackets(segments);
    if (format === 'kana') return segmentsToKana(segments);
    return segmentsToRuby(segments);
  }, [segments, format]);

  const annotated = useMemo(() => segments.filter((s) => s.reading).length, [segments]);

  const copy = useCallback(() => {
    if (!output) return;
    void navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [output]);

  const truncated = text.length > MAX_INPUT;

  return (
    <div className="blanc-tool-detail blanc-furigana">
      <fieldset>
        <legend>Text</legend>
        <textarea
          className="blanc-furigana-input"
          lang="ja"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste Japanese text to annotate…"
        />
        <div className="blanc-status-row">
          {failed ? (
            <span className="blanc-warning">Tokenizer failed to load — furigana is unavailable.</span>
          ) : !ready ? (
            <span>Loading tokenizer…</span>
          ) : (
            <span>
              {segments.length ? `${annotated} annotated of ${segments.length} runs` : 'Ready'}
            </span>
          )}
          {truncated && (
            <span className="blanc-warning">
              Showing the first {MAX_INPUT.toLocaleString()} characters of {text.length.toLocaleString()}
            </span>
          )}
          {text && (
            <button type="button" onClick={() => setText('')}>
              Clear
            </button>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend>Preview</legend>
        {segments.length ? (
          <p className="blanc-furigana-preview" lang="ja">
            {segments.map((s, i) =>
              s.reading ? (
                <ruby key={i}>
                  {s.text}
                  <rt>{s.reading}</rt>
                </ruby>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
          </p>
        ) : (
          <p className="blanc-note">
            {ready ? 'Nothing to preview yet.' : 'The preview appears once the tokenizer is ready.'}
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend>Output</legend>
        <div className="blanc-segmented">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={format === f.id ? 'active' : ''}
              onClick={() => setFormat(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <textarea className="blanc-furigana-output" readOnly rows={4} value={output} lang="ja" />
        <div className="blanc-status-row">
          <span>{FORMATS.find((f) => f.id === format)?.hint}</span>
          <button type="button" disabled={!output} onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="blanc-note">
          Readings come from the bundled kuromoji dictionary. Irregular readings and names can be
          wrong — where a reading cannot be split against the word&rsquo;s kana, the whole word is
          annotated rather than guessing a per-kanji split.
        </p>
      </fieldset>
    </div>
  );
}

const COUNTER_EXAMPLES = ['1234', '3本', '20歳', '5月5日', '3:45', '8'];

/**
 * Study-native item 5 — counter and number reader.
 *
 * Pure composition over `shared/japaneseNumbers.ts`. The app's existing Counter
 * Quiz is a static prompt game; nothing converted an arbitrary numeral, counter
 * phrase, date, or clock time to kana until now. Speaking uses the shared
 * `speak()` so it picks the same Japanese voice as the rest of the app.
 */
export function BlancCounterPanel() {
  const [text, setText] = useState('');
  const [spoke, setSpoke] = useState('');

  const readings = useMemo<NumberReading[]>(() => readInput(text), [text]);

  // A bare number is the case where "every counter at once" is the useful view.
  const counterTable = useMemo<NumberReading[]>(() => {
    const n = Number(text.trim());
    if (!/^\d+$/.test(text.trim()) || !Number.isSafeInteger(n) || n < 1) return [];
    return allCounterReadings(n);
  }, [text]);

  const say = useCallback((reading: string) => {
    if (speak(reading)) {
      setSpoke(reading);
      setTimeout(() => setSpoke(''), 1200);
    }
  }, []);

  return (
    <div className="blanc-tool-detail blanc-counter">
      <fieldset>
        <legend>Read</legend>
        <div className="blanc-command-row">
          <input
            type="text"
            value={text}
            lang="ja"
            onChange={(e) => setText(e.target.value)}
            placeholder="A number, 3本, 20歳, 5月5日, or 3:45"
          />
          {text && (
            <button type="button" onClick={() => setText('')}>
              Clear
            </button>
          )}
        </div>
        <div className="blanc-status-row">
          <span>Try:</span>
          {COUNTER_EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => setText(ex)}>
              {ex}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Reading</legend>
        {readings.length ? (
          <ul className="blanc-reading-list">
            {readings.map((r) => (
              <li key={`${r.label}-${r.reading}`}>
                <span className="blanc-reading-label">{r.label}</span>
                <span className="blanc-reading-surface" lang="ja">
                  {r.surface}
                </span>
                <span className="blanc-reading-kana" lang="ja">
                  {r.reading}
                </span>
                <button type="button" onClick={() => say(r.reading)}>
                  {spoke === r.reading ? 'Speaking' : 'Hear'}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="blanc-note">
            {text.trim() ? 'No reading for that input.' : 'Type a number or a counted phrase.'}
          </p>
        )}
      </fieldset>

      {counterTable.length > 0 && (
        <fieldset>
          <legend>All counters</legend>
          <ul className="blanc-reading-list">
            {counterTable.map((r) => (
              <li key={r.surface}>
                <span className="blanc-reading-label">{r.label}</span>
                <span className="blanc-reading-surface" lang="ja">
                  {r.surface}
                </span>
                <span className="blanc-reading-kana" lang="ja">
                  {r.reading}
                </span>
                <button type="button" onClick={() => say(r.reading)}>
                  {spoke === r.reading ? 'Speaking' : 'Hear'}
                </button>
              </li>
            ))}
          </ul>
          <p className="blanc-note">
            Counters whose reading at an exact hundred is irregular (100本 → ひゃっぽん) are omitted
            rather than guessed, so a missing row means &ldquo;not certain&rdquo;, not
            &ldquo;impossible&rdquo;.
          </p>
        </fieldset>
      )}
    </div>
  );
}

const ALL_CLASSES: WordClass[] = ['ichidan', 'godan', 'suru', 'kuru', 'i-adj'];

interface Question {
  dict: string;
  reading: string;
  meaning: string;
  wordClass: WordClass;
  form: ConjugationForm;
  answer: string;
}

/** Pick a random question from the enabled classes and forms. */
function nextQuestion(classes: Set<WordClass>, forms: Set<ConjugationForm>): Question | null {
  const pool: Question[] = [];
  for (const w of DRILL_WORDS) {
    if (!classes.has(w.wordClass)) continue;
    for (const spec of FORMS) {
      if (!forms.has(spec.id)) continue;
      const answer = conjugate(w.dict, w.wordClass, spec.id);
      if (!answer) continue;
      pool.push({ ...w, form: spec.id, answer });
    }
  }
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Study-native item 4 — conjugation drill.
 *
 * Open, drill, close. Answers are checked against `shared/conjugate.ts`, which
 * is round-trip tested against `deinflect.ts`, so a "wrong" verdict here is
 * backed by the same engine the dictionary popup uses. Deliberately not the
 * Game Arena: no XP, no session, no streak to protect — just the pattern.
 */
export function BlancConjugationPanel() {
  const [classes, setClasses] = useState<Set<WordClass>>(new Set(ALL_CLASSES));
  const [forms, setForms] = useState<Set<ConjugationForm>>(
    new Set<ConjugationForm>(['polite', 'negative', 'past', 'te']),
  );
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState('');
  const [verdict, setVerdict] = useState<'right' | 'wrong' | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ right: 0, total: 0 });

  const draw = useCallback(() => {
    setQuestion(nextQuestion(classes, forms));
    setAnswer('');
    setVerdict(null);
    setRevealed(false);
  }, [classes, forms]);

  // Draw the first question, and redraw whenever the pool changes so the shown
  // question always matches the current filters.
  useEffect(() => {
    draw();
  }, [draw]);

  const submit = useCallback(() => {
    if (!question || verdict) return;
    const ok = checkAnswer(answer, question.answer);
    setVerdict(ok ? 'right' : 'wrong');
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1 }));
  }, [answer, question, verdict]);

  const toggle = <T,>(set: Set<T>, value: T, apply: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    // Never let the pool go empty — the last enabled item stays on.
    if (next.size) apply(next);
  };

  const formSpec = question && FORMS.find((f) => f.id === question.form);

  return (
    <div className="blanc-tool-detail blanc-conjugation">
      <fieldset>
        <legend>Drill</legend>
        {question ? (
          <>
            <div className="blanc-drill-prompt">
              <span className="blanc-drill-word" lang="ja">{question.dict}</span>
              <span className="blanc-drill-reading" lang="ja">{question.reading}</span>
              <span className="blanc-drill-meaning">{question.meaning}</span>
            </div>
            <div className="blanc-status-row">
              <span>{CLASS_LABELS[question.wordClass]}</span>
              <span className="blanc-drill-target">
                → {formSpec?.label} <span lang="ja">{formSpec?.japanese}</span>
              </span>
            </div>
            <div className="blanc-command-row">
              <input
                type="text"
                lang="ja"
                value={answer}
                autoFocus
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  // One key drives the whole loop: answer, then next.
                  if (verdict) draw();
                  else submit();
                }}
                placeholder="Type the conjugated form"
              />
              {verdict ? (
                <button type="button" onClick={draw}>Next</button>
              ) : (
                <button type="button" disabled={!answer.trim()} onClick={submit}>Check</button>
              )}
            </div>
            {verdict === 'right' && <p className="blanc-drill-right">Correct</p>}
            {verdict === 'wrong' && (
              <p className="blanc-drill-wrong">
                <span lang="ja">{question.answer}</span>
              </p>
            )}
            {!verdict && (
              <div className="blanc-status-row">
                <button type="button" onClick={() => setRevealed(true)}>Show answer</button>
                {revealed && <span className="blanc-drill-revealed" lang="ja">{question.answer}</span>}
                <button type="button" onClick={() => speak(question.reading)}>Hear the word</button>
              </div>
            )}
          </>
        ) : (
          <p className="blanc-note">No questions for the current filters.</p>
        )}
        <div className="blanc-status-row">
          <span>
            {score.total ? `${score.right} / ${score.total} correct` : 'No answers yet'}
          </span>
          {score.total > 0 && (
            <button type="button" onClick={() => setScore({ right: 0, total: 0 })}>Reset score</button>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend>Word classes</legend>
        <div className="blanc-segmented">
          {ALL_CLASSES.map((c) => (
            <button
              key={c}
              type="button"
              className={classes.has(c) ? 'active' : ''}
              onClick={() => toggle(classes, c, setClasses)}
            >
              {CLASS_LABELS[c]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Forms</legend>
        <div className="blanc-segmented blanc-segmented-wrap">
          {FORMS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={forms.has(f.id) ? 'active' : ''}
              onClick={() => toggle(forms, f.id, setForms)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="blanc-note">
          Answers are checked against the same conjugation engine the dictionary uses to look words
          up, so the two can never disagree. い-adjectives skip the verb-only forms automatically.
        </p>
      </fieldset>
    </div>
  );
}

const VERDICT_TEXT: Record<string, string> = {
  clear: 'Nothing scheduled — a clear week.',
  light: 'A light week.',
  steady: 'A steady week.',
  heavy: 'A heavy week — consider spreading it out.',
};

/**
 * Study-native item 7 — review forecast.
 *
 * Read-only. Three views, kept separate because they measure different things
 * and merging them would imply a shared schedule that does not exist:
 *
 *  - Local backlog: not-`known` cards in the Blanc/Study OS deck. A binary flag,
 *    not a due date.
 *  - Knowledge load: the New/Learning/Familiar/Known bands from knownWords.
 *  - Week forecast: real due counts from Anki's scheduler. When Anki is not
 *    connected this section says so — it never derives due dates from interval
 *    lengths, because an interval says how long, not when.
 */
export function BlancForecastPanel() {
  const [forecast, setForecast] = useState<DueForecast | null>(null);
  const [loading, setLoading] = useState(false);

  const backlog = useMemo(() => localBacklog(loadDeck()), []);
  const knowledge = useMemo(() => knowledgeCounts(), []);

  const refresh = useCallback(() => {
    setLoading(true);
    const api = window.api?.ankiDueForecast;
    if (!api) {
      setForecast(emptyForecast('Anki bridge unavailable in this window.'));
      setLoading(false);
      return;
    }
    void api()
      .then((f) =>
        // Never trust the shape: a stubbed or unregistered channel resolves
        // undefined, which would otherwise render as a blank section.
        setForecast(
          isDueForecast(f)
            ? f
            : emptyForecast('The Anki forecast channel returned no data (is this a dev harness?).'),
        ),
      )
      .catch((e: unknown) =>
        setForecast(emptyForecast(e instanceof Error ? e.message : String(e))),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const summary = useMemo(() => (forecast?.ok ? summarizeForecast(forecast) : null), [forecast]);
  const scale = summary?.peakCount || 1;
  const knowledgeTotal = (Object.values(knowledge) as number[]).reduce((a, b) => a + b, 0);

  return (
    <div className="blanc-tool-detail blanc-forecast">
      <fieldset>
        <legend>This week</legend>
        {loading && !forecast && <p className="blanc-note">Asking Anki…</p>}
        {forecast && !forecast.ok && (
          <>
            <p className="blanc-warning">Anki is not answering.</p>
            <p className="blanc-note">{forecast.error}</p>
            <p className="blanc-note">
              A day-by-day forecast needs Anki&rsquo;s scheduler. Interval lengths alone say how long
              a card&rsquo;s gap is, not when it is next due, so no forecast is shown rather than a
              made-up one. The backlog and knowledge views below work regardless.
            </p>
            {/* Retry must live here too: someone who starts Anki after opening
                the panel would otherwise have to close and reopen the tool. */}
            <div className="blanc-status-row">
              <button type="button" disabled={loading} onClick={refresh}>
                {loading ? 'Retrying…' : 'Try again'}
              </button>
            </div>
          </>
        )}
        {forecast?.ok && summary && (
          <>
            <div className="blanc-forecast-chart">
              {forecast.days.map((d) => (
                <div key={d.offsetDays} className="blanc-forecast-col">
                  <span className="blanc-forecast-count">{d.due}</span>
                  <div
                    className={`blanc-forecast-bar${summary.spikeDay === d.offsetDays ? ' spike' : ''}`}
                    style={{ height: `${Math.round((d.due / scale) * 100)}%` }}
                  />
                  <span className="blanc-forecast-day">{dayLabel(d.offsetDays)}</span>
                </div>
              ))}
            </div>
            <div className="blanc-status-row">
              <span>{summary.total} due over {forecast.days.length} days</span>
              <span>{summary.dailyAverage}/day average</span>
              {summary.overdue > 0 && (
                <span className="blanc-warning">{summary.overdue} overdue</span>
              )}
              <button type="button" disabled={loading} onClick={refresh}>
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            <p className="blanc-note">
              {VERDICT_TEXT[summary.verdict]}
              {summary.spikeDay !== null &&
                ` ${dayLabel(summary.spikeDay)} is more than twice the daily average.`}
            </p>
            {typeof forecast.newCards === 'number' && forecast.newCards > 0 && (
              <p className="blanc-note">
                Plus {forecast.newCards.toLocaleString()} new cards not yet started. New cards have
                no scheduled date until you first study them, so they are not in the chart — but
                they are still work waiting.
              </p>
            )}
            <p className="blanc-note">
              Counts come from Anki&rsquo;s own scheduler, excluding suspended cards, and cover
              reviews only. &ldquo;Heavy&rdquo; and &ldquo;steady&rdquo; are rough labels, not a
              recommendation — the numbers above are the real answer.
            </p>
          </>
        )}
      </fieldset>

      <fieldset>
        <legend>Local deck backlog</legend>
        {backlog.total ? (
          <>
            <div className="blanc-status-row">
              <span>{backlog.unknown} not yet known</span>
              <span>{backlog.known} known</span>
              <span>{backlog.total} cards total</span>
            </div>
            <ul className="blanc-reading-list">
              {backlog.groups.slice(0, 12).map((g) => (
                <li key={g.folder || '(unfiled)'}>
                  <span className="blanc-reading-label">{g.folder || 'Unfiled'}</span>
                  <span className="blanc-reading-surface">{g.total} cards</span>
                  <span className="blanc-reading-kana">{g.unknown} to learn</span>
                </li>
              ))}
            </ul>
            {backlog.groups.length > 12 && (
              <p className="blanc-note">
                Showing the 12 folders with the most to learn, of {backlog.groups.length}.
              </p>
            )}
            <p className="blanc-note">
              Local cards carry a known / not-known flag rather than a review schedule, so this is a
              backlog, not a due date.
            </p>
          </>
        ) : (
          <p className="blanc-note">No local deck cards.</p>
        )}
      </fieldset>

      <fieldset>
        <legend>Knowledge load</legend>
        {knowledgeTotal ? (
          <ul className="blanc-reading-list">
            {WK_LEVELS.map((label, i) => (
              <li key={label}>
                <span className="blanc-reading-label">{label}</span>
                <span className="blanc-reading-surface">
                  {knowledge[i as WkLevel] ?? 0} words
                </span>
                <span className="blanc-reading-kana">
                  {Math.round(((knowledge[i as WkLevel] ?? 0) / knowledgeTotal) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="blanc-note">No tracked words yet.</p>
        )}
      </fieldset>
    </div>
  );
}

/**
 * Study-native item 2 — pitch accent lookup.
 *
 * Reads the Kanjium pitch data the app already downloads and mining already
 * uses for `{pitch}`. The contour is drawn here from raw downstep positions
 * (`shared/pitchAccent.ts`) rather than by injecting main's presentation HTML,
 * which would be Study OS markup inside a Blanc panel.
 *
 * The data is an optional download, so "no accent for this word" and "you have
 * no pitch dictionary installed" are reported as different things — the panel
 * points at the asset instead of looking empty.
 */
export function BlancPitchPanel() {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<PitchLookup | null>(null);
  const [error, setError] = useState('');
  const [spoke, setSpoke] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setQuery(term.trim()), 300);
    return () => clearTimeout(id);
  }, [term]);

  useEffect(() => {
    if (!query) {
      setResult(null);
      setError('');
      return;
    }
    let alive = true;
    const api = window.api?.dictPitch;
    if (!api) {
      setError('Dictionary bridge unavailable in this window.');
      return;
    }
    void api(query)
      .then((r) => {
        if (!alive) return;
        // Same shape guard as the forecast: a stubbed channel resolves undefined,
        // which would otherwise render as "no accent data" — a wrong answer.
        if (isPitchLookup(r)) {
          setResult(r);
          setError('');
        } else {
          setResult(null);
          setError('The pitch channel returned no data (is this a dev harness?).');
        }
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setResult(null);
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [query]);

  const say = useCallback((text: string) => {
    if (speak(text)) {
      setSpoke(true);
      setTimeout(() => setSpoke(false), 1200);
    }
  }, []);

  return (
    <div className="blanc-tool-detail blanc-pitch">
      <fieldset>
        <legend>Word</legend>
        <div className="blanc-command-row">
          <input
            type="text"
            lang="ja"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="A word in kanji or kana — 箸, はし, 日本語"
          />
          {term && (
            <button type="button" onClick={() => setTerm('')}>
              Clear
            </button>
          )}
        </div>
        <div className="blanc-status-row">
          {['日本語', '箸', '学校', '卵'].map((ex) => (
            <button key={ex} type="button" lang="ja" onClick={() => setTerm(ex)}>
              {ex}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Accent</legend>
        {error && <p className="blanc-warning">{error}</p>}
        {!error && result && !result.available && (
          <>
            <p className="blanc-warning">No pitch-accent dictionary is installed.</p>
            <p className="blanc-note">
              Pitch data comes from the Kanjium accent dictionary, an optional download. Install it
              from Settings → Models, then come back — nothing here works without it, and an empty
              result would otherwise look like &ldquo;this word has no accent&rdquo;.
            </p>
          </>
        )}
        {!error && result?.available && !result.entries.length && query && (
          <p className="blanc-note">
            No accent data for <span lang="ja">{query}</span>. The dictionary is installed, so this
            word is genuinely absent from it rather than unavailable.
          </p>
        )}
        {!error && !query && <p className="blanc-note">Type a word to see its contour.</p>}
        {!error &&
          result?.entries.map((entry) => (
            <div key={`${entry.reading}-${entry.positions.join(',')}`} className="blanc-pitch-entry">
              {entry.positions.map((downstep) => {
                const morae = splitMorae(entry.reading);
                const highs = moraPitch(entry.reading, downstep);
                const pattern = pitchPatternName(downstep, morae.length);
                return (
                  <div key={downstep} className="blanc-pitch-row">
                    <div className="blanc-pitch-contour" lang="ja" aria-label={`Pitch pattern: ${pattern}`}>
                      {morae.map((m, i) => (
                        <span
                          key={i}
                          className={`blanc-pitch-mora${highs[i] ? ' high' : ' low'}${
                            downstep > 0 && i + 1 === downstep ? ' drop' : ''
                          }`}
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                    <div className="blanc-status-row">
                      <span className="blanc-pitch-name">{PITCH_PATTERN_LABELS[pattern]}</span>
                      <span>{downstep === 0 ? 'no downstep' : `downstep after mora ${downstep}`}</span>
                      <button type="button" onClick={() => say(entry.reading)}>
                        {spoke ? 'Speaking' : 'Hear'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        {!error && result?.entries.length ? (
          <p className="blanc-note">
            A raised mora is high. Tokyo dialect: the drop after the marked mora is what you hear —
            for odaka it lands on the following particle, so the word alone sounds flat.
          </p>
        ) : null}
      </fieldset>
    </div>
  );
}

const CONSOLE_LEVEL_ORDER: ConsoleLevel[] = ['debug', 'info', 'warn', 'error'];

/**
 * Pillar 5 — developer console.
 *
 * The detail surface the notification centre is not: append-only, structured,
 * 2,000 entries rather than 100, filterable by category and level, searchable
 * across the serialised payload, and copyable as plain text for a bug report.
 *
 * Session-only by design (see renderer/blancConsole.ts) — persisting mined words
 * and IPC payloads to disk is not something the log should decide to do.
 */
export function BlancConsolePanel() {
  const [, forceRender] = useState(0);
  const [query, setQuery] = useState('');
  const [minLevel, setMinLevel] = useState<ConsoleLevel>('debug');
  const [category, setCategory] = useState<ConsoleCategory | 'all'>('all');
  const [copied, setCopied] = useState(false);

  useEffect(() => onBlancConsoleChanged(() => forceRender((n) => n + 1)), []);

  const all = getBlancConsole();
  const shown = useMemo(() => {
    const byFilter = filterEntries(all, {
      query,
      categories: category === 'all' ? undefined : [category],
    });
    return byFilter.filter((e) => atLeastLevel(e, minLevel));
  }, [all, query, category, minLevel]);
  const counts = useMemo(() => countByLevel(all), [all]);
  const dropped = getBlancConsoleDropped();

  const copyReport = useCallback(() => {
    void navigator.clipboard.writeText(formatEntriesForReport(shown)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [shown]);

  return (
    <div className="blanc-tool-detail blanc-console">
      <fieldset>
        <legend>Filter</legend>
        <div className="blanc-command-row">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages and payloads…"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')}>Clear</button>
          )}
        </div>
        <div className="blanc-segmented blanc-segmented-wrap">
          <button
            type="button"
            className={category === 'all' ? 'active' : ''}
            onClick={() => setCategory('all')}
          >
            All
          </button>
          {CONSOLE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={category === c ? 'active' : ''}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="blanc-segmented">
          {CONSOLE_LEVEL_ORDER.map((level) => (
            <button
              key={level}
              type="button"
              className={minLevel === level ? 'active' : ''}
              onClick={() => setMinLevel(level)}
            >
              {level}+
            </button>
          ))}
        </div>
        <div className="blanc-status-row">
          <span>{shown.length} of {all.length} entries</span>
          <span>{counts.error} errors · {counts.warn} warnings</span>
          {dropped > 0 && (
            // Honest cap, same contract as toolboxFileSearch's truncation.
            <span className="blanc-warning">{dropped} older entries dropped</span>
          )}
          <button type="button" disabled={!shown.length} onClick={copyReport}>
            {copied ? 'Copied' : 'Copy for report'}
          </button>
          <button type="button" disabled={!all.length} onClick={clearBlancConsole}>
            Clear
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Events</legend>
        {shown.length ? (
          <ol className="blanc-console-list">
            {shown.map((entry) => (
              <li key={entry.id} className={`blanc-console-entry level-${entry.level}`}>
                <span className="blanc-console-time">
                  {new Date(entry.at).toLocaleTimeString()}
                </span>
                <span className={`blanc-console-level level-${entry.level}`}>{entry.level}</span>
                <span className="blanc-console-cat">{entry.category}</span>
                <span className="blanc-console-msg">
                  {entry.message}
                  {entry.correlationId && (
                    <span className="blanc-console-corr">{entry.correlationId}</span>
                  )}
                  {entry.detail !== undefined && (
                    <span className="blanc-console-detail">{detailToText(entry.detail)}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="blanc-note">
            {all.length
              ? 'No entries match the filter.'
              : 'Nothing logged yet this session. Mining, deck writes, toasts, and renderer errors appear here.'}
          </p>
        )}
      </fieldset>
    </div>
  );
}

const WHISPER_TIER_LABELS: Record<WhisperModelTier, string> = {
  'whisper-base': 'Whisper Base',
  'whisper-small': 'Whisper Small',
  'kotoba-whisper': 'Kotoba-Whisper v2',
  'whisper-large-v3-turbo': 'Whisper Large v3 Turbo',
};

/** m:ss for a cue start, so the transcript reads like subtitles. */
function formatCueClock(sec: number): string {
  const total = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Study-native item 6 — Audio transcribe-and-mine.
 *
 * Reuses the media player's Whisper path end to end (the `media:extractAudio`
 * IPC → `whisperWorker` → the shared `whisperModelCache`) through
 * `useWhisperTranscribe`, so there is no second transcription stack and no
 * second downloader. Cues render as `SubtitleCueLine`, which makes every
 * morpheme a click target for the app-wide `GlobalDictionaryOverlay` — that is
 * the mine path, shared verbatim with the readers and the player, and each mined
 * card is already traced by the Pillar 5 console via the toast bus. The
 * transcription lifecycle is logged here too, so a failed extract or a silent
 * model download is visible in the console rather than only on screen.
 *
 * Honest model state: the tier is not gated behind a download — the worker
 * streams it on first use — but the panel says plainly when a tier is not yet
 * cached and points at Settings → Transcription rather than implying it is
 * instant. Model, device, and study language are read from the shared settings,
 * not duplicated here, per the plan's "do not add a second downloader".
 */
export function BlancAudioMinePanel() {
  const transcription = useWhisperTranscribe();
  const [fileName, setFileName] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [lang, setLang] = useState<'ja' | 'zh'>(() => getStudyLang());
  const [tier, setTier] = useState<WhisperModelTier>(() => loadWhisperModelTier(getStudyLang()));
  const [device, setDevice] = useState<WhisperDevice>(() => loadWhisperDevice());
  const [downloaded, setDownloaded] = useState(() => loadDownloaded());
  const [furigana, setFurigana] = useState(true);
  const [pickError, setPickError] = useState('');
  const corrRef = useRef('');

  const { state, cues, device: ranOn, progress, download, error } = transcription;
  const busy = state === 'extracting' || state === 'loading' || state === 'transcribing';

  // Model, device, download record, and study language are all shared settings —
  // reflect changes made elsewhere (Settings → Transcription) rather than
  // snapshotting them at mount.
  useEffect(() => onWhisperModelChanged(setTier), []);
  useEffect(() => onWhisperDeviceChanged(setDevice), []);
  useEffect(() => onDownloadedChanged(setDownloaded), []);
  useEffect(
    () =>
      onStudyLangChanged((next) => {
        // Never retarget an in-flight job; only follow the study language while idle.
        if (busy) return;
        setLang(next);
        setTier(loadWhisperModelTier(next));
      }),
    [busy],
  );

  const spec = whisperSpec(tier);
  const modelReady = isDownloadedIn(downloaded, tier, device);

  const pickFile = useCallback(async () => {
    setPickError('');
    try {
      const r = await window.api.pickMedia();
      if (!r) return; // user cancelled the native dialog
      setFileName(r.item.title || r.item.fileName || 'Selected file');
      setFileUrl(r.url);
      transcription.reset();
      corrRef.current = '';
    } catch (e) {
      setPickError(e instanceof Error ? e.message : String(e));
    }
  }, [transcription]);

  const transcribe = useCallback(() => {
    if (!fileUrl) return;
    corrRef.current = newCorrelationId('audio-mine');
    logBlanc('info', 'import', `Transcribing "${fileName}"`, { model: tier, device, lang }, corrRef.current);
    transcription.run(fileUrl, { tier, device, lang });
  }, [fileUrl, fileName, tier, device, lang, transcription]);

  // Log the terminal states so a silent failure or a finished transcript is
  // visible in the developer console — the same instrumentation contract as
  // EPUB mining, reached here through the shared console rather than main hooks.
  useEffect(() => {
    if (!corrRef.current) return;
    if (state === 'done') {
      logBlanc('info', 'import', `Transcript ready — ${cues.length} lines from "${fileName}"`, { device: ranOn }, corrRef.current);
    } else if (state === 'error') {
      logBlanc('error', 'import', `Transcription failed for "${fileName}"`, { detail: error }, corrRef.current);
    }
    // Intentionally keyed to `state` alone: this fires on transitions, and the
    // other values read here are current at each transition. (The project does
    // not run react-hooks/exhaustive-deps, so there is no directive to add.)
  }, [state]);

  const statusLine = (() => {
    switch (state) {
      case 'extracting':
        return 'Extracting audio…';
      case 'loading':
        return download ? `Downloading ${download.file} — ${download.percent}%` : 'Loading model…';
      case 'transcribing':
        return `Transcribing on ${ranOn === 'webgpu' ? 'GPU' : 'CPU'} — ${Math.round(progress * 100)}%`;
      default:
        return '';
    }
  })();

  return (
    <div className="blanc-tool-detail blanc-audio-mine">
      <fieldset>
        <legend>Source</legend>
        <p className="blanc-note">
          Pick a local audio or video file. It is transcribed on this machine with Whisper —
          nothing is uploaded. Then click any word in a line to look it up and mine it to your deck.
        </p>
        <div className="blanc-command-row">
          <button type="button" onClick={pickFile} disabled={busy}>
            {fileName ? 'Change file' : 'Choose file…'}
          </button>
          {fileName && (
            <span className="blanc-audio-file" lang="ja" title={fileName}>
              {fileName}
            </span>
          )}
        </div>
        {pickError && <p className="blanc-warning">{pickError}</p>}
        <div className="blanc-status-row">
          <span>Language</span>
          {(['ja', 'zh'] as const).map((l) => (
            <button
              key={l}
              type="button"
              className={lang === l ? 'active' : ''}
              aria-pressed={lang === l}
              disabled={busy}
              onClick={() => setLang(l)}
            >
              {l === 'ja' ? 'Japanese' : 'Chinese'}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Model</legend>
        <p className="blanc-note">
          {WHISPER_TIER_LABELS[tier]} ({formatBytes(spec.sizeBytes)}) on{' '}
          {device === 'cpu' ? 'CPU' : 'auto — GPU when available'}. Model and device follow your
          Transcription settings.
        </p>
        {modelReady ? (
          <p className="blanc-note">Downloaded — runs fully offline.</p>
        ) : (
          <p className="blanc-warning">
            Not downloaded yet. The first run streams about {formatBytes(spec.sizeBytes)} — keep this
            window open until it finishes. You can pre-download it in Settings → Transcription.
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend>Transcript</legend>
        <div className="blanc-command-row">
          <button type="button" onClick={transcribe} disabled={!fileUrl || busy}>
            Transcribe
          </button>
          {busy && (
            <button type="button" onClick={transcription.cancel}>
              Stop
            </button>
          )}
          {!busy && (cues.length > 0 || state === 'done' || state === 'error') && (
            <button type="button" onClick={transcription.reset}>
              Clear
            </button>
          )}
          <label className="blanc-checkbox">
            <input type="checkbox" checked={furigana} onChange={(e) => setFurigana(e.target.checked)} />
            Furigana
          </label>
        </div>

        {busy && (
          <div className="blanc-audio-progress">
            <span>{statusLine}</span>
            <progress max={1} value={state === 'transcribing' ? progress : undefined} />
          </div>
        )}
        {state === 'error' && <p className="blanc-warning">{error}</p>}

        {cues.length > 0 ? (
          <>
            <ol className="blanc-audio-cues">
              {cues.map((cue: TranscribeCue, i) => (
                <li key={`${i}-${cue.start}`} className="blanc-audio-cue">
                  <span className="blanc-audio-time">{formatCueClock(cue.start)}</span>
                  <SubtitleCueLine text={cue.text} furigana={furigana} className="blanc-audio-line" />
                </li>
              ))}
            </ol>
            {state === 'done' && (
              <p className="blanc-note">
                {cues.length} lines. Click a word to look it up, then mine it from the popup — mined
                cards appear in the developer console.
              </p>
            )}
          </>
        ) : (
          !busy &&
          state !== 'error' && (
            <p className="blanc-note">
              {fileUrl
                ? 'Press Transcribe to generate lines from this file.'
                : 'Choose a file to get started.'}
            </p>
          )
        )}
      </fieldset>
    </div>
  );
}
