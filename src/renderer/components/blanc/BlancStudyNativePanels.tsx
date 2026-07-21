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
