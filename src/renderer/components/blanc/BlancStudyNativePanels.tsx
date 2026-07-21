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
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  CLASS_LABELS,
  DRILL_WORDS,
  FORMS,
  checkAnswer,
  conjugate,
  type ConjugationForm,
  type WordClass,
} from '../../../shared/conjugate';

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
