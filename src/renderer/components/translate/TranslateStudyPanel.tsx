/**
 * The study half of Translate: what DeepL shows (sentence-by-sentence
 * alignment, a literal/natural alternative) joined to what Migaku and Yomitan
 * add (every word clickable into the dictionary, furigana / pinyin / stress on
 * the source, new words marked, the grammar the sentence uses, one-key mining).
 *
 * Shared by Study OS's `TranslateView` (both layouts) and Blanc's panel, so it
 * imports no `AppChrome`/`MenuBar`/`StatusBar` and nothing from `../ui`.
 *
 * The grammar library (~2 MB) is a dynamic import: it is fetched the first time
 * a translation finishes, never when the Translate surface — or Blanc — opens.
 */
import { useEffect, useMemo, useState } from 'react';
import SubtitleCueLine from '../SubtitleCueLine';
import { useT } from '../../i18n';
import { isStudyLang, studyLangFromTag, type StudyLang } from '../../../shared/studyLang';
import type { SentenceAnalysisResult } from '../../../shared/sentenceAnalysisCore';
import type { TranslateSegment } from '../../../shared/translateCore';
import { openGrammarPractice } from '../../extensionBridgeUi';
import { writeLocalStorage } from '../../localStorageWrite';
import type { WordLookupHit } from '../../wordLookup';
import { copyText, type TranslateController } from './TranslateContent';
import '../analysis/sentenceAnalysis.css';
import './translateStudy.css';

type Analyzer = (raw: string, lang: string) => SentenceAnalysisResult | null;

const AID_KEY = 'jp-translate-reading-aid-v1';
const EMPTY_SEGMENTS: TranslateSegment[] = [];

function readAidPref(): boolean {
  try {
    return localStorage.getItem(AID_KEY) !== '0';
  } catch {
    return true;
  }
}

/** The offline grammar highlighter, loaded on demand for a study language. */
function useLocalGrammar(lang: StudyLang | null): Analyzer | null {
  const [analyzer, setAnalyzer] = useState<Analyzer | null>(null);
  useEffect(() => {
    if (!lang) return;
    let alive = true;
    void import('../../localGrammarAnalysis')
      .then((m) => {
        if (alive) setAnalyzer(() => m.localSentenceAnalysis);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [lang]);
  return lang ? analyzer : null;
}

/** One grammar library point the passage uses, once however often it occurs. */
export interface TranslateGrammarPoint {
  key: string;
  headword: string;
  level: string;
  meaning: string;
}

/** Unique grammar points over the analysed sentences, in reading order. */
export function collectGrammarPoints(results: ReadonlyArray<SentenceAnalysisResult | null>): TranslateGrammarPoint[] {
  const seen = new Set<string>();
  const out: TranslateGrammarPoint[] = [];
  for (const result of results) {
    for (const annotation of result?.annotations ?? []) {
      if (annotation.category !== 'grammar') continue;
      const key = annotation.grammarId ?? annotation.headword ?? annotation.text;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        headword: annotation.headword ?? annotation.text,
        level: annotation.level ?? '',
        meaning: annotation.meaning ?? '',
      });
    }
  }
  return out;
}

function lookup(hit: WordLookupHit): void {
  window.dispatchEvent(new CustomEvent('dict:lookup', {
    detail: { query: hit.query, x: hit.x, y: hit.y, context: hit.context },
  }));
}

/**
 * Natural / literal rendering and the clipboard watcher. Rendered next to the
 * Translate button in every shell, because both change what the next
 * translation does rather than describing the last one.
 */
export function TranslateOptionsBar({ state, className = '' }: { state: TranslateController; className?: string }) {
  const { t } = useT();
  return (
    <div className={`xlate-options ${className}`.trim()}>
      <div className="dict-lang-toggle" role="radiogroup" aria-label={t('xlate.style.label')}>
        {(['natural', 'literal'] as const).map((style) => (
          <button
            key={style}
            type="button"
            role="radio"
            aria-checked={state.style === style}
            className={`gram-level-btn ${state.style === style ? 'active' : ''}`}
            title={t(`xlate.style.${style}Hint`)}
            disabled={state.busy}
            onClick={() => state.setStyle(style)}
          >
            {t(`xlate.style.${style}`)}
          </button>
        ))}
      </div>
      <label className="xlate-watch" title={t('xlate.clipboard.hint')}>
        <input
          type="checkbox"
          checked={state.clipboardWatch}
          onChange={(e) => state.setClipboardWatch(e.target.checked)}
        />
        {t('xlate.clipboard.watch')}
      </label>
      {state.clipboardWatch && (
        <span className="xlate-watch-status muted" role="status">{t('xlate.clipboard.watching')}</span>
      )}
    </div>
  );
}

export default function TranslateStudyPanel({ state }: { state: TranslateController }) {
  const { t } = useT();
  const { source, target } = state;
  // A shell that predates the workbench (or a test double of one) may not carry pairs.
  const segments = state.segments ?? EMPTY_SEGMENTS;
  const studyLang: StudyLang | null = isStudyLang(source) ? source : studyLangFromTag(source);
  const analyze = useLocalGrammar(studyLang);
  const [aid, setAid] = useState(readAidPref);
  const [selected, setSelected] = useState<{ row: number; index: number } | null>(null);

  // A new translation is a new passage: a span selected in the last one does not carry over.
  useEffect(() => setSelected(null), [segments]);

  const analyses = useMemo(
    () => segments.map((segment) => (analyze && studyLang ? analyze(segment.source, studyLang) : null)),
    [segments, analyze, studyLang],
  );
  const grammar = useMemo(() => collectGrammarPoints(analyses), [analyses]);

  if (segments.length === 0) return null;

  const toggleAid = (): void => {
    const next = !aid;
    setAid(next);
    writeLocalStorage(AID_KEY, next ? '1' : '0');
  };

  const onLineClick = (e: React.MouseEvent<HTMLDivElement>, context: string): void => {
    const el = e.target as HTMLElement;
    // A grammar span's click means "explain this span", not "look up a word".
    if (el.closest('.sa-seg')) return;
    const word = el.closest<HTMLElement>('[data-surface]');
    const query = word?.getAttribute('data-surface')?.trim();
    if (!word || !query) return;
    const rect = word.getBoundingClientRect();
    lookup({ query, x: rect.left, y: rect.bottom, top: rect.top, context });
  };

  const aidLabel = t(`xlate.aid.${studyLang ?? 'ja'}`);
  const multi = segments.length > 1;

  return (
    <section className="xlate-study" aria-label={t('xlate.study.label')}>
      <div className="xlate-study-bar" role="toolbar" aria-label={t('xlate.study.actions')}>
        <button type="button" className="btn" onClick={state.copyResult} title={t('xlate.copyHint')}>
          {t('xlate.copyResult')}
        </button>
        <button type="button" className="btn primary" onClick={state.mineResult} title={t('xlate.mineHint')}>
          {multi ? t('xlate.minePassage') : t('xlate.mineSentence')}
        </button>
        {studyLang && (
          <button type="button" className="btn ghost" aria-pressed={aid} onClick={toggleAid}>
            {aidLabel}
          </button>
        )}
        <span className="xlate-study-keys muted">{t('xlate.keysHint')}</span>
      </div>

      {studyLang && <p className="xlate-legend muted">{t('xlate.legend')}</p>}

      <ol className={`xlate-align${multi ? ' is-multi' : ''}`} aria-label={t('xlate.align.label')}>
        {segments.map((segment: TranslateSegment, row) => {
          const analysis = analyses[row];
          const annotations = analysis?.annotations;
          const text = analysis?.sentence ?? segment.source;
          const pick = selected?.row === row ? selected.index : undefined;
          const picked = pick !== undefined ? annotations?.[pick] : undefined;
          const subject = segment.source.replace(/\s+/g, ' ').trim().slice(0, 40);
          return (
            <li key={`${row}-${segment.source}`} className="xlate-pair">
              <div className="xlate-src" onClick={(e) => onLineClick(e, segment.source)}>
                {studyLang ? (
                  <SubtitleCueLine
                    text={text}
                    lang={studyLang}
                    furigana={aid}
                    knownHighlight
                    className="xlate-line"
                    annotations={annotations}
                    selectedAnnotation={pick}
                    onSelectAnnotation={(index) => setSelected(
                      selected?.row === row && selected.index === index ? null : { row, index },
                    )}
                    onWordActivate={lookup}
                  />
                ) : (
                  <p className="xlate-line" lang={source}>{segment.source}</p>
                )}
              </div>
              <p className="xlate-dst" lang={target}>
                {segment.target || <span className="muted">{t('xlate.segment.untranslated')}</span>}
              </p>
              {multi && (
                <div className="xlate-pair-actions">
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={!segment.target}
                    aria-label={`${t('xlate.segment.copy')} — ${subject}`}
                    onClick={() => void copyText(segment.target)}
                  >
                    {t('xlate.segment.copy')}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={!segment.target}
                    aria-label={`${t('xlate.segment.mine')} — ${subject}`}
                    onClick={() => state.mineSegment(segment)}
                  >
                    {t('xlate.segment.mine')}
                  </button>
                </div>
              )}
              {picked && (
                <div className="xlate-grammar-detail" role="note">
                  <strong lang={source}>{picked.headword ?? picked.text}</strong>
                  {picked.level && <span className="xlate-grammar-level">{picked.level}</span>}
                  {picked.meaning && <p>{picked.meaning}</p>}
                  {picked.explanation && <p className="muted">{picked.explanation}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {studyLang && grammar.length > 0 && (
        <div className="xlate-grammar">
          <h3>{t('xlate.grammar.title', { count: grammar.length })}</h3>
          <ul>
            {grammar.map((point) => (
              <li key={point.key}>
                <button
                  type="button"
                  className="xlate-grammar-chip"
                  aria-label={t('xlate.grammar.open', { pattern: point.headword })}
                  title={t('xlate.grammar.open', { pattern: point.headword })}
                  onClick={() => openGrammarPractice({
                    lang: studyLang,
                    ...(point.level ? { level: point.level } : {}),
                    query: point.headword,
                  })}
                >
                  {point.level && <span className="xlate-grammar-level">{point.level}</span>}
                  <span lang={source}>{point.headword}</span>
                  {point.meaning && <span className="muted"> — {point.meaning}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
