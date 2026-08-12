import { useEffect, useState } from 'react';
import type { LexiconInterlinearResult } from '../../../shared/lexiconInterlinear';
import { resolveLexiconInput, type LexiconLensOverride } from '../../../shared/lexiconWorkbench';
import DictionaryResults, { type DictLang } from '../DictionaryResults';
import { useT } from '../../i18n';
import './lexiconWorkbench.css';

interface Props {
  query: string;
  lang: DictLang;
  lookupAttempt: number;
  lens?: LexiconLensOverride;
  glossLang?: DictLang;
}

export default function LexiconWorkbenchResults({
  query,
  lang,
  lookupAttempt,
  lens = 'auto',
  glossLang = 'en',
}: Props) {
  const { t } = useT();
  const [selectedLens, setSelectedLens] = useState<LexiconLensOverride>(lens);
  const resolution = resolveLexiconInput(query, selectedLens);
  const interlinear = resolution.kind !== 'empty' && resolution.lens === 'translate';
  const [result, setResult] = useState<LexiconInterlinearResult | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => setSelectedLens(lens), [lens]);

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
      glossLangs: [glossLang],
    }).then((next) => {
      if (!alive) return;
      setResult(next);
      setState('idle');
    }).catch(() => {
      if (alive) setState('error');
    });
    return () => { alive = false; };
  }, [glossLang, interlinear, lang, lookupAttempt, query]);

  return (
    <section className="lexicon-workbench" aria-label={t('lexicon.workbench.interlinear')}>
      {lens === 'auto' && (
        <div className="lexicon-lens-picker" role="group" aria-label={t('lexicon.workbench.interlinear')}>
          {(['auto', 'lookup', 'translate'] as const).map((option) => (
            <button
              className={selectedLens === option ? 'active' : undefined}
              key={option}
              onClick={() => setSelectedLens(option)}
              type="button"
              aria-pressed={selectedLens === option}
            >
              {t(option === 'auto'
                ? 'settings.home.auto'
                : option === 'lookup'
                  ? 'dict.view.search'
                  : 'lexicon.workbench.interlinear')}
            </button>
          ))}
        </div>
      )}
      {!interlinear ? (
        <DictionaryResults key={lookupAttempt} query={query} variant="page" lang={lang} />
      ) : <div className="lexicon-interlinear" aria-label={t('lexicon.workbench.interlinear')}>
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
      </div>}
    </section>
  );
}
