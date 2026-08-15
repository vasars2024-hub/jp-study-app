import { useEffect, useRef, useState } from 'react';
import type { LexiconNeighbor } from '../../../shared/lexiconNeighbors';
import { useT } from '../../i18n';
import './semanticNeighbors.css';

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
 * Words the database says carry one of this word's own senses.
 *
 * Opt-in for the same reason the personal concordance is: the lookup itself is
 * instant, and several more index probes should be spent only when the reader
 * asks to widen it. Every row states the gloss it shares and the dictionary it
 * came from, so nothing here reads as an AI-suggested relationship.
 */
export default function SemanticNeighbors({ query, lang, onLookup }: Props) {
  const { t } = useT();
  const [state, setState] = useState<State>('idle');
  const [neighbors, setNeighbors] = useState<LexiconNeighbor[]>([]);
  const run = useRef(0);

  // A new word invalidates the previous word's neighbours. Bumping the run id
  // also discards a reply still in flight, so a slow probe for the old query
  // can never land under the new one.
  useEffect(() => {
    run.current += 1;
    setState('idle');
    setNeighbors([]);
  }, [query, lang]);

  async function search(): Promise<void> {
    if (state === 'running') return;
    const attempt = ++run.current;
    setState('running');
    setNeighbors([]);
    try {
      const result = await window.api.dictSemanticNeighbors(query, { sourceLangs: [lang] });
      if (attempt !== run.current) return;
      setNeighbors(result.neighbors);
      setState('done');
    } catch {
      if (attempt === run.current) setState('error');
    }
  }

  return (
    <details className="lexicon-neighbors">
      <summary>{t('lexicon.neighbors.title')}</summary>
      <p className="muted lexicon-neighbors-note">{t('lexicon.neighbors.note')}</p>
      <button
        className="lexicon-neighbors-run"
        disabled={state === 'running'}
        onClick={() => void search()}
        type="button"
      >
        {t(state === 'running' ? 'lexicon.neighbors.running' : 'lexicon.neighbors.action')}
      </button>
      {state === 'error' && (
        <p className="lexicon-neighbors-error" role="alert">{t('lexicon.neighbors.failed')}</p>
      )}
      {state === 'done' && neighbors.length === 0 && (
        <p className="muted lexicon-neighbors-empty">{t('lexicon.neighbors.empty', { query })}</p>
      )}
      {neighbors.length > 0 && (
        <ul className="lexicon-neighbors-list">
          {neighbors.map((neighbor) => (
            <li key={`${neighbor.lang}-${neighbor.text}-${neighbor.reading}`}>
              {/* A neighbour is a headword by construction — the probe found it
                  in the headword table — so the control is offered whenever the
                  host has somewhere to run the lookup. */}
              {onLookup ? (
                <button
                  className="lexicon-neighbors-word lexicon-neighbors-link"
                  lang={neighbor.lang}
                  onClick={() => onLookup(neighbor.text)}
                  title={t('lexicon.lookup.word', { word: neighbor.text })}
                  type="button"
                >
                  {neighbor.text}
                </button>
              ) : (
                <span className="lexicon-neighbors-word" lang={neighbor.lang}>{neighbor.text}</span>
              )}
              {neighbor.reading && neighbor.reading !== neighbor.text && (
                <span className="lexicon-neighbors-reading" lang={neighbor.lang}>
                  {neighbor.reading}
                </span>
              )}
              <span className="lexicon-neighbors-shared">
                {t('lexicon.neighbors.shares', { senses: neighbor.sharedSenses.join(' · ') })}
              </span>
              <span className="muted lexicon-neighbors-source">{neighbor.dictTitle}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
