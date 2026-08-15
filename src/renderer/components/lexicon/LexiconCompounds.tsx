import { useEffect, useRef, useState } from 'react';
import { splitCompoundText, type LexiconCompound } from '../../../shared/lexiconCompounds';
import { useT } from '../../i18n';
import './lexiconCompounds.css';

type State = 'idle' | 'running' | 'done' | 'error';

interface Props {
  /** The exact word that was looked up. */
  query: string;
  /** Source language of the lookup, so a Han query is not searched in both. */
  lang: string;
  /**
   * Run a fresh lookup for one of these words, when the host owns a search box.
   * Omitted by hosts that do not — the same seam `LexiconXrefs` uses, and the
   * same rule: no callback, no control.
   */
  onLookup?: (text: string) => void;
}

/**
 * Words in the installed dictionaries whose written form contains this one.
 *
 * Opt-in, like the semantic neighbours below it and for the same reason: the
 * lookup itself is instant, and this scans a whole language partition of the
 * headword index — tens of milliseconds that a reader who did not ask to widen
 * the lookup should not pay. Every row is a headword the dictionary really
 * carries, with the queried word marked inside it, so nothing here claims a word
 * was *formed* from another one; it claims only what can be read off the row.
 */
export default function LexiconCompounds({ query, lang, onLookup }: Props) {
  const { t } = useT();
  const [state, setState] = useState<State>('idle');
  const [compounds, setCompounds] = useState<LexiconCompound[]>([]);
  const run = useRef(0);

  // A new word invalidates the previous word's compounds. Bumping the run id also
  // discards a reply still in flight, so a slow scan for the old query can never
  // land under the new one.
  useEffect(() => {
    run.current += 1;
    setState('idle');
    setCompounds([]);
  }, [query, lang]);

  async function search(): Promise<void> {
    if (state === 'running') return;
    const attempt = ++run.current;
    setState('running');
    setCompounds([]);
    try {
      const result = await window.api.dictCompounds(query, { sourceLangs: [lang] });
      if (attempt !== run.current) return;
      setCompounds(result.compounds);
      setState('done');
    } catch {
      if (attempt === run.current) setState('error');
    }
  }

  return (
    <details className="lexicon-compounds">
      <summary>{t('lexicon.compounds.title')}</summary>
      <p className="muted lexicon-compounds-note">{t('lexicon.compounds.note')}</p>
      <button
        className="lexicon-compounds-run"
        disabled={state === 'running'}
        onClick={() => void search()}
        type="button"
      >
        {t(state === 'running' ? 'lexicon.compounds.running' : 'lexicon.compounds.action')}
      </button>
      {state === 'error' && (
        <p className="lexicon-compounds-error" role="alert">{t('lexicon.compounds.failed')}</p>
      )}
      {state === 'done' && compounds.length === 0 && (
        <p className="muted lexicon-compounds-empty">{t('lexicon.compounds.empty', { query })}</p>
      )}
      {compounds.length > 0 && (
        <ul className="lexicon-compounds-list">
          {compounds.map((compound) => (
            <li key={`${compound.lang}-${compound.text}-${compound.reading}`}>
              {/* Every row here came out of the headword table, so unlike an
                  xref target there is no "resolved" question to ask: if the
                  host can run a lookup, the word can be looked up. */}
              {onLookup ? (
                <button
                  className="lexicon-compounds-word lexicon-compounds-link"
                  lang={compound.lang}
                  onClick={() => onLookup(compound.text)}
                  title={t('lexicon.lookup.word', { word: compound.text })}
                  type="button"
                >
                  {splitCompoundText(compound.text, query).map((part, index) => (
                    part.match
                      ? <mark key={index}>{part.text}</mark>
                      : <span key={index}>{part.text}</span>
                  ))}
                </button>
              ) : (
                <span className="lexicon-compounds-word" lang={compound.lang}>
                  {splitCompoundText(compound.text, query).map((part, index) => (
                    part.match
                      ? <mark key={index}>{part.text}</mark>
                      : <span key={index}>{part.text}</span>
                  ))}
                </span>
              )}
              {compound.reading && compound.reading !== compound.text && (
                <span className="lexicon-compounds-reading" lang={compound.lang}>
                  {compound.reading}
                </span>
              )}
              {compound.gloss && (
                <span className="lexicon-compounds-gloss">{compound.gloss}</span>
              )}
              <span className="muted lexicon-compounds-source">{compound.dictTitle}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
