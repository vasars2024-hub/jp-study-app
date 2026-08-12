import { useEffect, useMemo, useState } from 'react';
import {
  parallelGlossTargets,
  type LexiconInterlinearResult,
  type LexiconInterlinearMatch,
} from '../../../shared/lexiconInterlinear';
import { MAX_HARVEST_ITEMS, harvestLexiconVocabulary } from '../../../shared/lexiconHarvest';
import { resolveLexiconInput, type LexiconLensOverride } from '../../../shared/lexiconWorkbench';
import DictionaryResults, { type DictLang } from '../DictionaryResults';
import { useT } from '../../i18n';
import './lexiconWorkbench.css';

/** Gloss targets follow the imported dictionaries, not the source-side DictLang pair. */
type GlossLang = string;

const LENS_OPTIONS = ['auto', 'lookup', 'translate'] as const;

const LENS_LABEL_KEYS: Record<(typeof LENS_OPTIONS)[number], string> = {
  auto: 'lexicon.lens.auto',
  lookup: 'lexicon.lens.lookup',
  translate: 'lexicon.lens.interlinear',
};

/**
 * One gloss line per requested target, each tagged with the language code the
 * dictionary itself stores. The code is registry data — the same value Settings
 * prints for an installed dictionary — not translatable chrome. A single-target
 * match carries no `parallel` grouping and keeps the original one-line ruby.
 */
function glossRt(match: LexiconInterlinearMatch | undefined) {
  if (!match) return '';
  if (match.parallel?.length) {
    return match.parallel.map((group) => (
      <span className="lexicon-gloss-line" key={group.lang}>
        <span className="lexicon-gloss-lang">{group.lang.toUpperCase()}</span>
        {group.glosses.map((gloss) => gloss.text).join('; ')}
      </span>
    ));
  }
  return match.glosses.map((gloss) => gloss.text).join('; ') || match.reading || '';
}

interface Props {
  query: string;
  lang: DictLang;
  lookupAttempt: number;
  lens?: LexiconLensOverride;
  glossLang?: GlossLang;
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

  // Purely derived from the grounded result, so it costs one pass per lookup
  // rather than a second bridge call.
  const harvest = useMemo(() => (result ? harvestLexiconVocabulary(result) : null), [result]);

  useEffect(() => {
    if (!interlinear) {
      setResult(null);
      setState('idle');
      return;
    }
    let alive = true;
    setState('loading');
    setResult(null);
    const primary = glossLang.trim().toLowerCase() || 'en';
    // The extra targets are whatever the installed dictionaries can actually
    // answer offline, so a user with only one dictionary keeps the exact
    // single-target request — and response shape — they had before.
    void Promise.resolve(window.api.dictListYomitan?.())
      .then((dicts) => parallelGlossTargets(primary, dicts ?? []))
      .catch(() => [primary])
      .then((glossLangs) => window.api.lookupOfflineInterlinear(query, {
        sourceLangs: [lang],
        glossLangs,
      }))
      .then((next) => {
        if (!alive) return;
        setResult(next);
        setState('idle');
      })
      .catch(() => {
        if (alive) setState('error');
      });
    return () => { alive = false; };
  }, [glossLang, interlinear, lang, lookupAttempt, query]);

  return (
    <section className="lexicon-workbench" aria-label={t('lexicon.workbench.interlinear')}>
      {lens === 'auto' && (
        <div className="lexicon-lens-picker" role="group" aria-label={t('lexicon.lens.group')}>
          {LENS_OPTIONS.map((option) => (
            <button
              className={selectedLens === option ? 'active' : undefined}
              key={option}
              onClick={() => setSelectedLens(option)}
              type="button"
              aria-pressed={selectedLens === option}
            >
              {t(LENS_LABEL_KEYS[option])}
            </button>
          ))}
        </div>
      )}
      {!interlinear ? (
        <DictionaryResults key={lookupAttempt} query={query} variant="page" lang={lang} />
      ) : (
        <div className="lexicon-interlinear">
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
                  <rt>{glossRt(part.match)}</rt>
                </ruby>
              ))}
            </div>
          )}
          {harvest && harvest.items.length > 0 && (
            <details className="lexicon-harvest" open>
              <summary>{t('lexicon.harvest.title')}</summary>
              <p className="lexicon-harvest-summary muted">
                {t('lexicon.harvest.summary', {
                  unique: harvest.uniqueCount,
                  grounded: harvest.groundedCount,
                })}
                {harvest.capped ? ` ${t('lexicon.harvest.capped', { max: MAX_HARVEST_ITEMS })}` : ''}
              </p>
              <ul className="lexicon-harvest-list">
                {harvest.items.map((item) => (
                  <li className={item.grounded ? 'is-grounded' : undefined} key={item.key}>
                    <span className="lexicon-harvest-word" lang={lang}>{item.text}</span>
                    {item.reading && (
                      <span className="lexicon-harvest-reading" lang={lang}>{item.reading}</span>
                    )}
                    <span
                      aria-label={t('lexicon.harvest.occurrences', { count: item.count })}
                      className="lexicon-harvest-count"
                    >
                      {t('lexicon.harvest.occurrenceBadge', { count: item.count })}
                    </span>
                    <span className="lexicon-harvest-gloss">
                      {!item.grounded
                        ? t('lexicon.harvest.ungrounded')
                        : item.glosses.length
                          ? item.glosses.map((gloss) => gloss.text).join('; ')
                          : t('lexicon.harvest.noGloss')}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
