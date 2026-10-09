import { useEffect, useRef, useState } from 'react';
import type { LexiconFrequencyResult } from '../../../shared/lexiconFrequency';
import { useT } from '../../i18n';
import './wordFrequency.css';

interface Props {
  /** The headword the lookup resolved, not the raw query string. */
  query: string;
  /** Source language of the lookup, so a Han word is not probed in both. */
  lang: string;
}

const EMPTY: LexiconFrequencyResult = { query: '', entries: [] };

/**
 * How common this word is, according to the frequency corpora the user installed.
 *
 * Runs unasked, like the etymology panel: the read is one indexed equality plus a
 * join on a table of a handful of rows, so there is nothing for a button to
 * protect. And like it, this renders **nothing at all** when no corpus knows the
 * word. That absence is deliberate and load-bearing — a default install has no
 * frequency corpus, and a row reading "unknown" would be indistinguishable from
 * the corpus having *checked* and found the word vanishingly rare.
 *
 * The band is the headline and the rank is the evidence, in that order: "#4,312"
 * means nothing without knowing how long the list is, which the reader does not.
 * Both are the corpus's own numbers; nothing here is estimated or interpolated.
 */
export default function WordFrequency({ query, lang }: Props) {
  const { t, lang: uiLang } = useT();
  const [result, setResult] = useState<LexiconFrequencyResult>(EMPTY);
  const run = useRef(0);

  useEffect(() => {
    const attempt = ++run.current;
    setResult(EMPTY);
    if (!query) return;
    // A preload without the binding cannot answer, and the panel is absent for a
    // word with no frequency anyway — so this is the same rendered state.
    if (typeof window.api?.dictFrequency !== 'function') return;
    void (async () => {
      try {
        const next = await window.api.dictFrequency(query, { sourceLangs: [lang] });
        // A reply for the previous word must never land under the current one.
        if (attempt !== run.current) return;
        // The IPC answers null when no frequency corpus is installed or the
        // dictionary is still being prepared; that is "no panel", not a crash.
        setResult(next && Array.isArray(next.entries) ? next : EMPTY);
      } catch {
        if (attempt === run.current) setResult(EMPTY);
      }
    })();
  }, [query, lang]);

  if (!result.entries.length || !result.band) return null;

  // Grouping separators come from the reader's locale, not from the corpus: a
  // rank is a count, and 4 312 / 4,312 / 4.312 are the same number.
  const number = (value: number): string => value.toLocaleString(uiLang);

  return (
    <div className="lexicon-frequency">
      <p className="lexicon-frequency-band">
        <span className={`lexicon-frequency-badge is-${result.band}`}>
          {t(`lexicon.frequency.band.${result.band}`)}
        </span>
        <span className="muted lexicon-frequency-lead">
          {t('lexicon.frequency.best', { rank: number(result.entries[0].rank) })}
        </span>
      </p>
      <ul className="lexicon-frequency-list">
        {result.entries.map((entry) => (
          <li key={entry.corpusId}>
            <span className="lexicon-frequency-source">{entry.corpusTitle}</span>
            <span className="lexicon-frequency-rank">
              {t('lexicon.frequency.rank', { rank: number(entry.rank) })}
            </span>
            {entry.perMillion !== undefined && (
              <span className="muted lexicon-frequency-permillion">
                {t('lexicon.frequency.perMillion', {
                  // Two decimals: below that every uncommon word reads as 0.00,
                  // which is a different claim from "rare".
                  value: entry.perMillion.toLocaleString(uiLang, { maximumFractionDigits: 2 }),
                })}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
