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
 * String policy: every chrome string resolves through `t()` under
 * `blanc.native.*` (src/shared/i18n/blancUi). Study content — sample words,
 * readings, the Japanese form names — stays as-is. Labels that the shared
 * modules (`conjugate`, `pitchAccent`, `japaneseNumbers`, `knownWords`) keep in
 * English are mapped to keys here, by id, and resolved at render.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { LANG_TAGS, type UiLang } from '../../../shared/i18n/core';
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
  isPitchLookup,
  moraPitch,
  pitchPatternName,
  splitMorae,
  type PitchLookup,
  type PitchPattern,
} from '../../../shared/pitchAccent';
import {
  emptyForecast,
  isDueForecast,
  localBacklog,
  summarizeForecast,
  type DueForecast,
} from '../../../shared/reviewForecast';
import { loadDeck } from '../../flashcardDeck';
import { WK_LEVELS, knowledgeCounts, type WkLevel } from '../../knownWords';
import {
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

type TFn = ReturnType<typeof useT>['t'];

type FuriganaFormat = 'ruby' | 'brackets' | 'kana';

/** Catalog keys, resolved with t() at render. */
const FORMATS: { id: FuriganaFormat; labelKey: string; hintKey: string }[] = [
  { id: 'ruby', labelKey: 'blanc.native.furigana.format.ruby', hintKey: 'blanc.native.furigana.hint.ruby' },
  { id: 'brackets', labelKey: 'blanc.native.furigana.format.brackets', hintKey: 'blanc.native.furigana.hint.brackets' },
  { id: 'kana', labelKey: 'blanc.native.furigana.format.kana', hintKey: 'blanc.native.furigana.hint.kana' },
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
  const { t } = useT();
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
        <legend>{t('blanc.native.furigana.legend.text')}</legend>
        <textarea
          className="blanc-furigana-input"
          lang="ja"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('blanc.native.furigana.placeholder')}
        />
        <div className="blanc-status-row">
          {failed ? (
            <span className="blanc-warning">{t('blanc.native.furigana.tokenizerFailed')}</span>
          ) : !ready ? (
            <span>{t('blanc.native.furigana.loadingTokenizer')}</span>
          ) : (
            <span>
              {segments.length
                ? t('blanc.native.furigana.annotated', { annotated, count: segments.length })
                : t('blanc.native.ready')}
            </span>
          )}
          {truncated && (
            <span className="blanc-warning">
              {t('blanc.native.furigana.truncated', { max: MAX_INPUT, count: text.length })}
            </span>
          )}
          {text && (
            <button type="button" onClick={() => setText('')}>
              {t('blanc.native.clear')}
            </button>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.native.furigana.legend.preview')}</legend>
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
            {ready
              ? t('blanc.native.furigana.previewEmpty')
              : t('blanc.native.furigana.previewWaiting')}
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend>{t('blanc.native.furigana.legend.output')}</legend>
        <div className="blanc-segmented">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={format === f.id ? 'active' : ''}
              onClick={() => setFormat(f.id)}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>
        <textarea className="blanc-furigana-output" readOnly rows={4} value={output} lang="ja" />
        <div className="blanc-status-row">
          <span>{t(FORMATS.find((f) => f.id === format)?.hintKey ?? FORMATS[0].hintKey)}</span>
          <button type="button" disabled={!output} onClick={copy}>
            {copied ? t('blanc.native.copied') : t('blanc.native.copy')}
          </button>
        </div>
        <p className="blanc-note">{t('blanc.native.furigana.note')}</p>
      </fieldset>
    </div>
  );
}

const COUNTER_EXAMPLES = ['1234', '3本', '20歳', '5月5日', '3:45', '8'];

/**
 * `shared/japaneseNumbers.ts` labels its readings in English ('Number', 'Date',
 * 'Clock time', or '本 — long thin things'). Map them to keys here — by the fixed
 * kind names and by counter kanji — rather than teaching the pure module about
 * the UI language. An unrecognised label renders as-is.
 */
const READING_KIND_KEYS: Record<string, string> = {
  'Clock time': 'blanc.native.counter.kind.clock',
  Date: 'blanc.native.counter.kind.date',
  Number: 'blanc.native.counter.kind.number',
};

const COUNTER_WHAT_KEYS: Record<string, string> = {
  本: 'blanc.native.counter.what.hon',
  枚: 'blanc.native.counter.what.mai',
  個: 'blanc.native.counter.what.ko',
  匹: 'blanc.native.counter.what.hiki',
  杯: 'blanc.native.counter.what.hai',
  人: 'blanc.native.counter.what.nin',
  歳: 'blanc.native.counter.what.sai',
  階: 'blanc.native.counter.what.floor',
  分: 'blanc.native.counter.what.fun',
  冊: 'blanc.native.counter.what.satsu',
  台: 'blanc.native.counter.what.dai',
  回: 'blanc.native.counter.what.times',
  つ: 'blanc.native.counter.what.tsu',
};

function readingLabel(t: TFn, label: string): string {
  const kind = READING_KIND_KEYS[label];
  if (kind) return t(kind);
  const sep = label.indexOf(' — ');
  if (sep > 0) {
    const counter = label.slice(0, sep);
    const what = COUNTER_WHAT_KEYS[counter];
    if (what) return t('blanc.native.counter.kind.counter', { counter, what: t(what) });
  }
  return label;
}

/**
 * Study-native item 5 — counter and number reader.
 *
 * Pure composition over `shared/japaneseNumbers.ts`. The app's existing Counter
 * Quiz is a static prompt game; nothing converted an arbitrary numeral, counter
 * phrase, date, or clock time to kana until now. Speaking uses the shared
 * `speak()` so it picks the same Japanese voice as the rest of the app.
 */
export function BlancCounterPanel() {
  const { t } = useT();
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
        <legend>{t('blanc.native.counter.legend.read')}</legend>
        <div className="blanc-command-row">
          <input
            type="text"
            value={text}
            lang="ja"
            onChange={(e) => setText(e.target.value)}
            placeholder={t('blanc.native.counter.placeholder')}
          />
          {text && (
            <button type="button" onClick={() => setText('')}>
              {t('blanc.native.clear')}
            </button>
          )}
        </div>
        <div className="blanc-status-row">
          <span>{t('blanc.native.counter.try')}</span>
          {COUNTER_EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => setText(ex)}>
              {ex}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.native.counter.legend.reading')}</legend>
        {readings.length ? (
          <ul className="blanc-reading-list">
            {readings.map((r) => (
              <li key={`${r.label}-${r.reading}`}>
                <span className="blanc-reading-label">{readingLabel(t, r.label)}</span>
                <span className="blanc-reading-surface" lang="ja">
                  {r.surface}
                </span>
                <span className="blanc-reading-kana" lang="ja">
                  {r.reading}
                </span>
                <button type="button" onClick={() => say(r.reading)}>
                  {spoke === r.reading ? t('blanc.native.speaking') : t('blanc.native.hear')}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="blanc-note">
            {text.trim() ? t('blanc.native.counter.noReading') : t('blanc.native.counter.empty')}
          </p>
        )}
      </fieldset>

      {counterTable.length > 0 && (
        <fieldset>
          <legend>{t('blanc.native.counter.legend.all')}</legend>
          <ul className="blanc-reading-list">
            {counterTable.map((r) => (
              <li key={r.surface}>
                <span className="blanc-reading-label">{readingLabel(t, r.label)}</span>
                <span className="blanc-reading-surface" lang="ja">
                  {r.surface}
                </span>
                <span className="blanc-reading-kana" lang="ja">
                  {r.reading}
                </span>
                <button type="button" onClick={() => say(r.reading)}>
                  {spoke === r.reading ? t('blanc.native.speaking') : t('blanc.native.hear')}
                </button>
              </li>
            ))}
          </ul>
          <p className="blanc-note">{t('blanc.native.counter.note')}</p>
        </fieldset>
      )}
    </div>
  );
}

const ALL_CLASSES: WordClass[] = ['ichidan', 'godan', 'suru', 'kuru', 'i-adj'];

/** Keys for `shared/conjugate.ts`'s English CLASS_LABELS / FORMS labels, by id. */
const CLASS_LABEL_KEYS: Record<WordClass, string> = {
  ichidan: 'blanc.native.conj.class.ichidan',
  godan: 'blanc.native.conj.class.godan',
  suru: 'blanc.native.conj.class.suru',
  kuru: 'blanc.native.conj.class.kuru',
  'i-adj': 'blanc.native.conj.class.iAdj',
};

const FORM_LABEL_KEYS: Record<ConjugationForm, string> = {
  polite: 'blanc.native.conj.form.polite',
  negative: 'blanc.native.conj.form.negative',
  politeNegative: 'blanc.native.conj.form.politeNegative',
  past: 'blanc.native.conj.form.past',
  pastNegative: 'blanc.native.conj.form.pastNegative',
  politePast: 'blanc.native.conj.form.politePast',
  te: 'blanc.native.conj.form.te',
  potential: 'blanc.native.conj.form.potential',
  passive: 'blanc.native.conj.form.passive',
  causative: 'blanc.native.conj.form.causative',
  volitional: 'blanc.native.conj.form.volitional',
  imperative: 'blanc.native.conj.form.imperative',
  conditional: 'blanc.native.conj.form.conditional',
};

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
  const { t } = useT();
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
        <legend>{t('blanc.native.conj.legend.drill')}</legend>
        {question ? (
          <>
            <div className="blanc-drill-prompt">
              <span className="blanc-drill-word" lang="ja">{question.dict}</span>
              <span className="blanc-drill-reading" lang="ja">{question.reading}</span>
              <span className="blanc-drill-meaning">{question.meaning}</span>
            </div>
            <div className="blanc-status-row">
              <span>{t(CLASS_LABEL_KEYS[question.wordClass])}</span>
              <span className="blanc-drill-target">
                → {formSpec && t(FORM_LABEL_KEYS[formSpec.id])}{' '}
                <span lang="ja">{formSpec?.japanese}</span>
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
                placeholder={t('blanc.native.conj.placeholder')}
              />
              {verdict ? (
                <button type="button" onClick={draw}>{t('blanc.native.conj.next')}</button>
              ) : (
                <button type="button" disabled={!answer.trim()} onClick={submit}>
                  {t('blanc.native.conj.check')}
                </button>
              )}
            </div>
            {verdict === 'right' && <p className="blanc-drill-right">{t('blanc.native.conj.correct')}</p>}
            {verdict === 'wrong' && (
              <p className="blanc-drill-wrong">
                <span lang="ja">{question.answer}</span>
              </p>
            )}
            {!verdict && (
              <div className="blanc-status-row">
                <button type="button" onClick={() => setRevealed(true)}>
                  {t('blanc.native.conj.showAnswer')}
                </button>
                {revealed && <span className="blanc-drill-revealed" lang="ja">{question.answer}</span>}
                <button type="button" onClick={() => speak(question.reading)}>
                  {t('blanc.native.conj.hearWord')}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="blanc-note">{t('blanc.native.conj.empty')}</p>
        )}
        <div className="blanc-status-row">
          <span>
            {score.total
              ? t('blanc.native.conj.score', { right: score.right, total: score.total })
              : t('blanc.native.conj.noAnswers')}
          </span>
          {score.total > 0 && (
            <button type="button" onClick={() => setScore({ right: 0, total: 0 })}>
              {t('blanc.native.conj.resetScore')}
            </button>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.native.conj.legend.classes')}</legend>
        <div className="blanc-segmented">
          {ALL_CLASSES.map((c) => (
            <button
              key={c}
              type="button"
              className={classes.has(c) ? 'active' : ''}
              onClick={() => toggle(classes, c, setClasses)}
            >
              {t(CLASS_LABEL_KEYS[c])}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.native.conj.legend.forms')}</legend>
        <div className="blanc-segmented blanc-segmented-wrap">
          {FORMS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={forms.has(f.id) ? 'active' : ''}
              onClick={() => toggle(forms, f.id, setForms)}
            >
              {t(FORM_LABEL_KEYS[f.id])}
            </button>
          ))}
        </div>
        <p className="blanc-note">{t('blanc.native.conj.note')}</p>
      </fieldset>
    </div>
  );
}

const VERDICT_KEYS: Record<string, string> = {
  clear: 'blanc.native.forecast.verdict.clear',
  light: 'blanc.native.forecast.verdict.light',
  steady: 'blanc.native.forecast.verdict.steady',
  heavy: 'blanc.native.forecast.verdict.heavy',
};

/** Keys for knownWords' English WK_LEVELS, by index (WkLevel 0–3). */
const WK_LEVEL_KEYS = [
  'blanc.native.forecast.level.new',
  'blanc.native.forecast.level.learning',
  'blanc.native.forecast.level.familiar',
  'blanc.native.forecast.level.known',
];

/**
 * Localised twin of `shared/reviewForecast.ts`'s `dayLabel`, which returns
 * English 'Today'/'Tomorrow' and a host-locale weekday.
 */
function forecastDayLabel(t: TFn, lang: UiLang, offsetDays: number): string {
  if (offsetDays === 0) return t('blanc.native.forecast.today');
  if (offsetDays === 1) return t('blanc.native.forecast.tomorrow');
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString(LANG_TAGS[lang], { weekday: 'short' });
}

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
  const { t, lang } = useT();
  const [forecast, setForecast] = useState<DueForecast | null>(null);
  const [loading, setLoading] = useState(false);

  const backlog = useMemo(() => localBacklog(loadDeck()), []);
  const knowledge = useMemo(() => knowledgeCounts(), []);

  const refresh = useCallback(() => {
    setLoading(true);
    const api = window.api?.ankiDueForecast;
    if (!api) {
      setForecast(emptyForecast(t('blanc.native.forecast.bridgeUnavailable')));
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
            : emptyForecast(t('blanc.native.forecast.noData')),
        ),
      )
      .catch((e: unknown) =>
        setForecast(emptyForecast(e instanceof Error ? e.message : String(e))),
      )
      .finally(() => setLoading(false));
    // `lang`: the messages above are stored translated, so a language switch
    // re-asks rather than leaving a stale-language error on screen.
  }, [lang]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const summary = useMemo(() => (forecast?.ok ? summarizeForecast(forecast) : null), [forecast]);
  const scale = summary?.peakCount || 1;
  const knowledgeTotal = (Object.values(knowledge) as number[]).reduce((a, b) => a + b, 0);

  return (
    <div className="blanc-tool-detail blanc-forecast">
      <fieldset>
        <legend>{t('blanc.native.forecast.legend.week')}</legend>
        {loading && !forecast && <p className="blanc-note">{t('blanc.native.forecast.asking')}</p>}
        {forecast && !forecast.ok && (
          <>
            <p className="blanc-warning">{t('blanc.native.forecast.notAnswering')}</p>
            <p className="blanc-note">{forecast.error}</p>
            <p className="blanc-note">{t('blanc.native.forecast.noForecastNote')}</p>
            {/* Retry must live here too: someone who starts Anki after opening
                the panel would otherwise have to close and reopen the tool. */}
            <div className="blanc-status-row">
              <button type="button" disabled={loading} onClick={refresh}>
                {loading ? t('blanc.native.retrying') : t('common.tryAgain')}
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
                  <span className="blanc-forecast-day">
                    {forecastDayLabel(t, lang, d.offsetDays)}
                  </span>
                </div>
              ))}
            </div>
            <div className="blanc-status-row">
              <span>
                {t('blanc.native.forecast.dueOver', {
                  total: summary.total,
                  count: forecast.days.length,
                })}
              </span>
              <span>{t('blanc.native.forecast.dailyAverage', { average: summary.dailyAverage })}</span>
              {summary.overdue > 0 && (
                <span className="blanc-warning">
                  {t('blanc.native.forecast.overdue', { count: summary.overdue })}
                </span>
              )}
              <button type="button" disabled={loading} onClick={refresh}>
                {loading ? t('blanc.native.refreshing') : t('blanc.native.refresh')}
              </button>
            </div>
            <p className="blanc-note">
              {t(VERDICT_KEYS[summary.verdict])}
              {summary.spikeDay !== null &&
                ` ${t('blanc.native.forecast.spike', {
                  day: forecastDayLabel(t, lang, summary.spikeDay),
                })}`}
            </p>
            {typeof forecast.newCards === 'number' && forecast.newCards > 0 && (
              <p className="blanc-note">
                {t('blanc.native.forecast.newCards', { count: forecast.newCards })}
              </p>
            )}
            <p className="blanc-note">{t('blanc.native.forecast.countsNote')}</p>
          </>
        )}
      </fieldset>

      <fieldset>
        <legend>{t('blanc.native.forecast.legend.backlog')}</legend>
        {backlog.total ? (
          <>
            <div className="blanc-status-row">
              <span>{t('blanc.native.forecast.notKnown', { count: backlog.unknown })}</span>
              <span>{t('blanc.native.forecast.known', { count: backlog.known })}</span>
              <span>{t('blanc.native.forecast.cardsTotal', { count: backlog.total })}</span>
            </div>
            <ul className="blanc-reading-list">
              {backlog.groups.slice(0, 12).map((g) => (
                <li key={g.folder || '(unfiled)'}>
                  <span className="blanc-reading-label">
                    {g.folder || t('blanc.native.forecast.unfiled')}
                  </span>
                  <span className="blanc-reading-surface">
                    {t('blanc.native.forecast.cards', { count: g.total })}
                  </span>
                  <span className="blanc-reading-kana">
                    {t('blanc.native.forecast.toLearn', { count: g.unknown })}
                  </span>
                </li>
              ))}
            </ul>
            {backlog.groups.length > 12 && (
              <p className="blanc-note">
                {t('blanc.native.forecast.foldersMore', { shown: 12, count: backlog.groups.length })}
              </p>
            )}
            <p className="blanc-note">{t('blanc.native.forecast.backlogNote')}</p>
          </>
        ) : (
          <p className="blanc-note">{t('blanc.native.forecast.noLocal')}</p>
        )}
      </fieldset>

      <fieldset>
        <legend>{t('blanc.native.forecast.legend.knowledge')}</legend>
        {knowledgeTotal ? (
          <ul className="blanc-reading-list">
            {WK_LEVELS.map((label, i) => (
              <li key={label}>
                <span className="blanc-reading-label">{t(WK_LEVEL_KEYS[i])}</span>
                <span className="blanc-reading-surface">
                  {t('blanc.native.forecast.words', { count: knowledge[i as WkLevel] ?? 0 })}
                </span>
                <span className="blanc-reading-kana">
                  {Math.round(((knowledge[i as WkLevel] ?? 0) / knowledgeTotal) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="blanc-note">{t('blanc.native.forecast.noWords')}</p>
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
const PITCH_PATTERN_KEYS: Record<PitchPattern, string> = {
  heiban: 'blanc.native.pitch.pattern.heiban',
  atamadaka: 'blanc.native.pitch.pattern.atamadaka',
  nakadaka: 'blanc.native.pitch.pattern.nakadaka',
  odaka: 'blanc.native.pitch.pattern.odaka',
  unknown: 'blanc.native.pitch.pattern.unknown',
};

export function BlancPitchPanel() {
  const { t, lang } = useT();
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
      setError(t('blanc.native.pitch.bridgeUnavailable'));
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
          setError(t('blanc.native.pitch.noData'));
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
    // `lang`: the error text above is stored translated.
  }, [query, lang]);

  const say = useCallback((text: string) => {
    if (speak(text)) {
      setSpoke(true);
      setTimeout(() => setSpoke(false), 1200);
    }
  }, []);

  return (
    <div className="blanc-tool-detail blanc-pitch">
      <fieldset>
        <legend>{t('blanc.native.pitch.legend.word')}</legend>
        <div className="blanc-command-row">
          <input
            type="text"
            lang="ja"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t('blanc.native.pitch.placeholder')}
          />
          {term && (
            <button type="button" onClick={() => setTerm('')}>
              {t('blanc.native.clear')}
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
        <legend>{t('blanc.native.pitch.legend.accent')}</legend>
        {error && <p className="blanc-warning">{error}</p>}
        {!error && result && !result.available && (
          <>
            <p className="blanc-warning">{t('blanc.native.pitch.notInstalled')}</p>
            <p className="blanc-note">{t('blanc.native.pitch.notInstalledNote')}</p>
          </>
        )}
        {!error && result?.available && !result.entries.length && query && (
          <p className="blanc-note">{t('blanc.native.pitch.noAccent', { word: query })}</p>
        )}
        {!error && !query && <p className="blanc-note">{t('blanc.native.pitch.typeWord')}</p>}
        {!error &&
          result?.entries.map((entry) => (
            <div key={`${entry.reading}-${entry.positions.join(',')}`} className="blanc-pitch-entry">
              {entry.positions.map((downstep) => {
                const morae = splitMorae(entry.reading);
                const highs = moraPitch(entry.reading, downstep);
                const pattern = pitchPatternName(downstep, morae.length);
                return (
                  <div key={downstep} className="blanc-pitch-row">
                    <div
                      className="blanc-pitch-contour"
                      lang="ja"
                      aria-label={t('blanc.native.pitch.patternAria', { pattern })}
                    >
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
                      <span className="blanc-pitch-name">{t(PITCH_PATTERN_KEYS[pattern])}</span>
                      <span>
                        {downstep === 0
                          ? t('blanc.native.pitch.noDownstep')
                          : t('blanc.native.pitch.downstepAfter', { mora: downstep })}
                      </span>
                      <button type="button" onClick={() => say(entry.reading)}>
                        {spoke ? t('blanc.native.speaking') : t('blanc.native.hear')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        {!error && result?.entries.length ? (
          <p className="blanc-note">{t('blanc.native.pitch.note')}</p>
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
  const { t, lang } = useT();
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
        <legend>{t('blanc.native.console.legend.filter')}</legend>
        <div className="blanc-command-row">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('blanc.native.console.placeholder')}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')}>{t('blanc.native.clear')}</button>
          )}
        </div>
        {/* Category and level names stay as the raw identifiers: they are what
            each entry row and the copied report show. */}
        <div className="blanc-segmented blanc-segmented-wrap">
          <button
            type="button"
            className={category === 'all' ? 'active' : ''}
            onClick={() => setCategory('all')}
          >
            {t('blanc.native.console.all')}
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
          <span>{t('blanc.native.console.shown', { shown: shown.length, count: all.length })}</span>
          <span>
            {t('blanc.native.console.errors', { count: counts.error })}
            {' · '}
            {t('blanc.native.console.warnings', { count: counts.warn })}
          </span>
          {dropped > 0 && (
            // Honest cap, same contract as toolboxFileSearch's truncation.
            <span className="blanc-warning">
              {t('blanc.native.console.dropped', { count: dropped })}
            </span>
          )}
          <button type="button" disabled={!shown.length} onClick={copyReport}>
            {copied ? t('blanc.native.copied') : t('blanc.native.console.copyReport')}
          </button>
          <button type="button" disabled={!all.length} onClick={clearBlancConsole}>
            {t('blanc.native.clear')}
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.native.console.legend.events')}</legend>
        {shown.length ? (
          <ol className="blanc-console-list">
            {shown.map((entry) => (
              <li key={entry.id} className={`blanc-console-entry level-${entry.level}`}>
                <span className="blanc-console-time">
                  {new Date(entry.at).toLocaleTimeString(LANG_TAGS[lang])}
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
            {all.length ? t('blanc.native.console.noMatch') : t('blanc.native.console.empty')}
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
  // `lang` below is the study (audio) language; the UI language is `uiLang`.
  const { t, lang: uiLang } = useT();
  const transcription = useWhisperTranscribe();
  const [fileName, setFileName] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [lang, setLang] = useState<'ja' | 'zh' | 'ru'>(() => getStudyLang());
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
      setFileName(r.item.title || r.item.fileName || t('blanc.native.audio.selectedFile'));
      setFileUrl(r.url);
      transcription.reset();
      corrRef.current = '';
    } catch (e) {
      setPickError(e instanceof Error ? e.message : String(e));
    }
  }, [transcription, uiLang]);

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
        return t('blanc.native.audio.extracting');
      case 'loading':
        return download
          ? t('blanc.native.audio.downloading', { file: download.file, percent: download.percent })
          : t('blanc.native.audio.loadingModel');
      case 'transcribing':
        return t('blanc.native.audio.transcribing', {
          device: ranOn === 'webgpu' ? 'GPU' : 'CPU',
          percent: Math.round(progress * 100),
        });
      default:
        return '';
    }
  })();

  return (
    <div className="blanc-tool-detail blanc-audio-mine">
      <fieldset>
        <legend>{t('blanc.native.audio.legend.source')}</legend>
        <p className="blanc-note">{t('blanc.native.audio.intro')}</p>
        <div className="blanc-command-row">
          <button type="button" onClick={pickFile} disabled={busy}>
            {fileName ? t('blanc.native.audio.changeFile') : t('blanc.native.audio.chooseFile')}
          </button>
          {fileName && (
            <span className="blanc-audio-file" lang="ja" title={fileName}>
              {fileName}
            </span>
          )}
        </div>
        {pickError && <p className="blanc-warning">{pickError}</p>}
        <div className="blanc-status-row">
          <span>{t('blanc.native.audio.language')}</span>
          {(['ja', 'zh'] as const).map((l) => (
            <button
              key={l}
              type="button"
              className={lang === l ? 'active' : ''}
              aria-pressed={lang === l}
              disabled={busy}
              onClick={() => setLang(l)}
            >
              {t(`blanc.native.audio.lang.${l}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.native.audio.legend.model')}</legend>
        <p className="blanc-note">
          {t('blanc.native.audio.modelLine', {
            model: WHISPER_TIER_LABELS[tier],
            size: formatBytes(spec.sizeBytes),
            device: device === 'cpu' ? t('blanc.native.audio.deviceCpu') : t('blanc.native.audio.deviceAuto'),
          })}
        </p>
        {modelReady ? (
          <p className="blanc-note">{t('blanc.native.audio.downloaded')}</p>
        ) : (
          <p className="blanc-warning">{t('blanc.native.audio.notDownloaded', { size: formatBytes(spec.sizeBytes) })}</p>
        )}
      </fieldset>

      <fieldset>
        <legend>{t('blanc.native.audio.legend.transcript')}</legend>
        <div className="blanc-command-row">
          <button type="button" onClick={transcribe} disabled={!fileUrl || busy}>
            {t('blanc.native.audio.transcribe')}
          </button>
          {busy && (
            <button type="button" onClick={transcription.cancel}>
              {t('blanc.native.audio.stop')}
            </button>
          )}
          {!busy && (cues.length > 0 || state === 'done' || state === 'error') && (
            <button type="button" onClick={transcription.reset}>
              {t('blanc.native.audio.clear')}
            </button>
          )}
          <label className="blanc-checkbox">
            <input type="checkbox" checked={furigana} onChange={(e) => setFurigana(e.target.checked)} />
            {t('blanc.native.audio.furigana')}
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
              <p className="blanc-note">{t('blanc.native.audio.doneNote', { count: cues.length })}</p>
            )}
          </>
        ) : (
          !busy &&
          state !== 'error' && (
            <p className="blanc-note">
              {fileUrl ? t('blanc.native.audio.pressTranscribe') : t('blanc.native.audio.chooseToStart')}
            </p>
          )
        )}
      </fieldset>
    </div>
  );
}
