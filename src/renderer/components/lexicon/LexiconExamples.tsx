import { useEffect, useRef, useState } from 'react';
import { splitExampleText, type LexiconExampleSentence } from '../../../shared/lexiconExamples';
import { useT } from '../../i18n';
import './lexiconExamples.css';

type State = 'idle' | 'running' | 'done' | 'error';

interface Props {
  /** The exact word that was looked up. */
  query: string;
  /** Source language of the lookup, which is the language of the sentences to search. */
  lang: string;
}

/**
 * Sentences from an installed example corpus that contain this word.
 *
 * Opt-in, like the compounds and neighbours around it: the scan is `instr` over a
 * text column, which no index can help, so a reader who did not ask to widen the
 * lookup should not pay for it.
 *
 * Every row is a sentence the corpus really carries, with the queried word marked
 * inside it and the corpus named — so the surface claims containment and
 * attribution and nothing else. It notably does not claim the sentence is a *good*
 * example: the ordering is shortest-first over a bounded sample, which is a
 * heuristic and is described as one in `selectLexiconExamples`.
 */
export default function LexiconExamples({ query, lang }: Props) {
  const { t } = useT();
  const [state, setState] = useState<State>('idle');
  const [examples, setExamples] = useState<LexiconExampleSentence[]>([]);
  const run = useRef(0);

  // A new word invalidates the previous word's sentences. Bumping the run id also
  // discards a reply still in flight, so a slow scan for the old query can never
  // land under the new one.
  useEffect(() => {
    run.current += 1;
    setState('idle');
    setExamples([]);
  }, [query, lang]);

  async function search(): Promise<void> {
    if (state === 'running') return;
    const attempt = ++run.current;
    setState('running');
    setExamples([]);
    try {
      const result = await window.api.dictExamples(query, { sourceLangs: [lang] });
      if (attempt !== run.current) return;
      setExamples(result.examples);
      setState('done');
    } catch {
      if (attempt === run.current) setState('error');
    }
  }

  return (
    <details className="lexicon-examples">
      <summary>{t('lexicon.examples.title')}</summary>
      <p className="muted lexicon-examples-note">{t('lexicon.examples.note')}</p>
      <button
        className="lexicon-examples-run"
        disabled={state === 'running'}
        onClick={() => void search()}
        type="button"
      >
        {t(state === 'running' ? 'lexicon.examples.running' : 'lexicon.examples.action')}
      </button>
      {state === 'error' && (
        <p className="lexicon-examples-error" role="alert">{t('lexicon.examples.failed')}</p>
      )}
      {/* An empty result has two quite different causes and the reader can act on
          only one of them, so they are not merged into one message. */}
      {state === 'done' && examples.length === 0 && (
        <p className="muted lexicon-examples-empty">{t('lexicon.examples.empty', { query })}</p>
      )}
      {examples.length > 0 && (
        <ul className="lexicon-examples-list">
          {examples.map((example) => (
            <li key={`${example.dictId}-${example.sourceId ?? example.text}`}>
              <p className="lexicon-examples-sentence" lang={example.lang}>
                {splitExampleText(example.text, query).map((part, index) => (
                  part.match
                    ? <mark key={index}>{part.text}</mark>
                    : <span key={index}>{part.text}</span>
                ))}
              </p>
              {example.translations.map((translation, index) => (
                <p
                  className="lexicon-examples-translation"
                  key={`${translation.lang}-${index}`}
                  lang={translation.lang}
                >
                  {translation.text}
                </p>
              ))}
              <p className="muted lexicon-examples-source">
                {example.licence
                  ? t('lexicon.examples.credit', { source: example.dictTitle, licence: example.licence })
                  : example.dictTitle}
              </p>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
