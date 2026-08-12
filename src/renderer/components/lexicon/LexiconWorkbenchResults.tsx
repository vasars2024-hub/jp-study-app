import { useEffect, useMemo, useState } from 'react';
import {
  parallelGlossTargets,
  type LexiconInterlinearResult,
  type LexiconInterlinearMatch,
} from '../../../shared/lexiconInterlinear';
import {
  MAX_HARVEST_ITEMS,
  harvestLexiconVocabulary,
  type LexiconVocabularyItem,
} from '../../../shared/lexiconHarvest';
import { buildHarvestMineRequest, canMineHarvestItem } from '../../../shared/lexiconHarvestMining';
import { resolveLexiconInput, type LexiconLensOverride } from '../../../shared/lexiconWorkbench';
import DictionaryResults, { type DictLang } from '../DictionaryResults';
import { useT } from '../../i18n';
import './lexiconWorkbench.css';

/** Gloss targets follow the imported dictionaries, not the source-side DictLang pair. */
type GlossLang = string;

/**
 * Per-row mining state. `dup` is a success for the learner — the word is
 * already studied — so it is kept distinct from `error`, which is the only
 * state that stays retryable.
 */
type MineState = 'adding' | 'added' | 'dup' | 'error';

const MINE_LABEL_KEYS: Record<MineState, string> = {
  adding: 'lexicon.harvest.mining',
  added: 'lexicon.harvest.mined',
  dup: 'lexicon.harvest.mineDuplicate',
  // A failure returns the button to its offer: this is the one retryable state.
  error: 'lexicon.harvest.mine',
};

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
  const [mined, setMined] = useState<Record<string, MineState>>({});
  const [mineError, setMineError] = useState<Record<string, string>>({});

  useEffect(() => setSelectedLens(lens), [lens]);

  // Purely derived from the grounded result, so it costs one pass per lookup
  // rather than a second bridge call.
  const harvest = useMemo(() => (result ? harvestLexiconVocabulary(result) : null), [result]);

  // A row's mine state belongs to the passage it was harvested from, so a new
  // lookup clears it rather than letting "Added" carry over onto a different
  // word that happens to land in the same position.
  function clearMineState() {
    setMined({});
    setMineError({});
  }

  useEffect(() => {
    if (!interlinear) {
      setResult(null);
      setState('idle');
      clearMineState();
      return;
    }
    let alive = true;
    setState('loading');
    setResult(null);
    clearMineState();
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

  /**
   * Mine one harvested word. The request is built from the passage the row was
   * folded out of, so the card carries the sentence the learner actually met the
   * word in, and it routes through the same mining rules a dictionary mine uses.
   */
  async function mineHarvestItem(item: LexiconVocabularyItem) {
    if (!result || mined[item.key] === 'adding') return;
    setMined((prev) => ({ ...prev, [item.key]: 'adding' }));
    setMineError((prev) => {
      const next = { ...prev };
      delete next[item.key];
      return next;
    });
    const fail = (error: string) => {
      setMined((prev) => ({ ...prev, [item.key]: 'error' }));
      setMineError((prev) => ({ ...prev, [item.key]: error }));
    };
    try {
      const res = await window.api.ankiMineNote(buildHarvestMineRequest(item, result, { lang }));
      if (res.ok) {
        setMined((prev) => ({ ...prev, [item.key]: 'added' }));
      } else if (res.error === 'duplicate') {
        setMined((prev) => ({ ...prev, [item.key]: 'dup' }));
      } else {
        // AnkiConnect's own message is more useful than a generic one; the
        // generic string only covers a mine that threw before answering.
        fail(res.error ?? t('lexicon.harvest.mineFailed'));
      }
    } catch {
      fail(t('lexicon.harvest.mineFailed'));
    }
  }

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
                {harvest.items.map((item) => {
                  const mineState = mined[item.key];
                  const mineLabel = t(
                    mineState ? MINE_LABEL_KEYS[mineState] : 'lexicon.harvest.mine',
                  );
                  return (
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
                      {/* A row with no reading and no gloss would mine a card with a
                          blank back, so it offers no button; the gloss cell above
                          already says which of the two is missing. */}
                      {canMineHarvestItem(item) && (
                        <button
                          aria-label={t('lexicon.harvest.mineWord', {
                            word: item.text,
                            action: mineLabel,
                          })}
                          className="lexicon-harvest-mine"
                          disabled={mineState === 'adding' || mineState === 'added' || mineState === 'dup'}
                          onClick={() => void mineHarvestItem(item)}
                          type="button"
                        >
                          {mineLabel}
                        </button>
                      )}
                      {mineState === 'error' && (
                        <span className="lexicon-harvest-mine-error" role="alert">
                          {mineError[item.key]}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
