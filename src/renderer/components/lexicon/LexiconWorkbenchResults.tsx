import { useEffect, useState } from 'react';
import type { LexiconInterlinearResult } from '../../../shared/lexiconInterlinear';
import { resolveLexiconInput } from '../../../shared/lexiconWorkbench';
import DictionaryResults, { type DictLang } from '../DictionaryResults';
import { useT } from '../../i18n';
import './lexiconWorkbench.css';

interface Props {
  query: string;
  lang: DictLang;
  lookupAttempt: number;
}

export default function LexiconWorkbenchResults({ query, lang, lookupAttempt }: Props) {
  const { t } = useT();
  const resolution = resolveLexiconInput(query);
  const interlinear = resolution.kind === 'sentence' || resolution.kind === 'paragraph' || resolution.kind === 'document';
  const [result, setResult] = useState<LexiconInterlinearResult | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    if (!interlinear) {
      setResult(null);
      setState('idle');
      return;
    }
    let alive = true;
    setState('loading');
    setResult(null);
    void window.api.lookupOfflineInterlinear(query, {
      sourceLangs: [lang],
      glossLangs: ['en'],
    }).then((next) => {
      if (!alive) return;
      setResult(next);
      setState('idle');
    }).catch(() => {
      if (alive) setState('error');
    });
    return () => { alive = false; };
  }, [interlinear, lang, lookupAttempt, query]);

  if (!interlinear) {
    return <DictionaryResults key={lookupAttempt} query={query} variant="page" lang={lang} />;
  }

  return (
    <section className="lexicon-interlinear" aria-label={t('lexicon.workbench.interlinear')}>
      <div className="lexicon-interlinear-meta">
        <span>{t('lexicon.workbench.detected', { kind: t(`lexicon.kind.${resolution.kind}`) })}</span>
        {result?.truncated && <span>{t('lexicon.workbench.truncated')}</span>}
      </div>
      {state === 'loading' && <p className="muted">{t('common.loading')}</p>}
      {state === 'error' && <p role="alert">{t('lexicon.workbench.offlineFailed')}</p>}
      {result && (
        <div className="lexicon-interlinear-flow" lang={lang}>
          {result.parts.map((part) => part.kind === 'separator' ? (
            <span key={`${part.start}-${part.end}`}>{part.text}</span>
          ) : (
            <ruby className={part.match ? 'is-grounded' : undefined} key={`${part.start}-${part.end}`}>
              {part.text}
              <rt>{part.match?.glosses.map((gloss) => gloss.text).join('; ') || part.match?.reading || ''}</rt>
            </ruby>
          ))}
        </div>
      )}
    </section>
  );
}
