import { useEffect, useRef, useState } from 'react';
import type { LexiconCollocation } from '../../../shared/lexiconCollocations';
import { useT } from '../../i18n';
import './lexiconCollocations.css';

type State = 'idle' | 'running' | 'done' | 'error';

interface Props {
  /** The exact word that was looked up. */
  query: string;
  /** Source language of the lookup, so a Han query is not searched in both. */
  lang: string;
  /**
   * Run a fresh lookup for the *other* word in a phrase, when the host owns a
   * search box. Same seam as the sibling panels, same rule: no callback, no
   * control.
   */
  onLookup?: (text: string) => void;
}

/**
 * Phrases where the looked-up word is joined to another word by a particle.
 *
 * Opt-in like its siblings, and for the same reason: it scans a language
 * partition of the headword index, which a reader who did not ask to widen the
 * lookup should not pay for.
 *
 * Only the *partner* is a link. The head is the word already on screen, so a
 * control that re-runs the search the reader is looking at would be a control
 * that does nothing — the one case the repo's own rule about dead controls is
 * about. The particle is never a link because it is not a headword.
 */
export default function LexiconCollocations({ query, lang, onLookup }: Props) {
  const { t } = useT();
  const [state, setState] = useState<State>('idle');
  const [collocations, setCollocations] = useState<LexiconCollocation[]>([]);
  const run = useRef(0);

  // A new word invalidates the previous word's phrases. Bumping the run id also
  // discards a reply still in flight, so a slow scan for the old query can never
  // land under the new one.
  useEffect(() => {
    run.current += 1;
    setState('idle');
    setCollocations([]);
  }, [query, lang]);

  async function search(): Promise<void> {
    if (state === 'running') return;
    const attempt = ++run.current;
    setState('running');
    setCollocations([]);
    try {
      const result = await window.api.dictCollocations(query, { sourceLangs: [lang] });
      if (attempt !== run.current) return;
      setCollocations(result.collocations);
      setState('done');
    } catch {
      if (attempt === run.current) setState('error');
    }
  }

  function renderPhrase(item: LexiconCollocation) {
    const head = (
      <span className="lexicon-collocations-head" key="head">{item.head}</span>
    );
    const particle = (
      <span className="lexicon-collocations-particle" key="particle">{item.particle}</span>
    );
    const partner = onLookup ? (
      <button
        className="lexicon-collocations-link"
        key="partner"
        lang={item.lang}
        onClick={() => onLookup(item.partner)}
        title={t('lexicon.lookup.word', { word: item.partner })}
        type="button"
      >
        {item.partner}
      </button>
    ) : (
      <span key="partner">{item.partner}</span>
    );
    return item.order === 'head-first'
      ? [head, particle, partner]
      : [partner, particle, head];
  }

  return (
    <details className="lexicon-collocations">
      <summary>{t('lexicon.collocations.title')}</summary>
      <p className="muted lexicon-collocations-note">{t('lexicon.collocations.note')}</p>
      <button
        className="lexicon-collocations-run"
        disabled={state === 'running'}
        onClick={() => void search()}
        type="button"
      >
        {t(state === 'running' ? 'lexicon.collocations.running' : 'lexicon.collocations.action')}
      </button>
      {state === 'error' && (
        <p className="lexicon-collocations-error" role="alert">
          {t('lexicon.collocations.failed')}
        </p>
      )}
      {state === 'done' && collocations.length === 0 && (
        <p className="muted lexicon-collocations-empty">
          {t('lexicon.collocations.empty', { query })}
        </p>
      )}
      {collocations.length > 0 && (
        <ul className="lexicon-collocations-list">
          {collocations.map((item) => (
            <li key={`${item.lang}-${item.pattern}-${item.partner}`}>
              <span className="lexicon-collocations-phrase" lang={item.lang}>
                {renderPhrase(item)}
              </span>
              {/* An attestation tally, never a corpus frequency — the label says
                  "entries", which is what was counted. */}
              {/* The partner is the one word in the row the reader has not
                  looked up, so a row without its definition asks them to run a
                  second search to find out what the phrase means. Absent only
                  when the dictionaries carry the partner without a definition
                  in a language on this install. */}
              {item.partnerGloss && (
                <span className="lexicon-collocations-gloss">{item.partnerGloss}</span>
              )}
              <span className="lexicon-collocations-count">
                {t('lexicon.collocations.attested', { count: String(item.count) })}
              </span>
              <span className="muted lexicon-collocations-source">{item.dictTitle}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
