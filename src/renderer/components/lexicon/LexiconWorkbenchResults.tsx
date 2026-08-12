import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  applySensePins,
  canPinSense,
  sensePinKey,
  type LexiconSensePins,
} from '../../../shared/lexiconSensePin';
import { collectSenseHints } from '../../../shared/lexiconRetranslate';
import { resolveLexiconInput, type LexiconLensOverride } from '../../../shared/lexiconWorkbench';
import DictionaryResults, { type DictLang } from '../DictionaryResults';
import { translateTo } from '../../translator';
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

/** A pinned token stays grounded; the extra class only marks the reader's choice. */
function rubyClass(match: LexiconInterlinearMatch | undefined): string | undefined {
  if (!match) return undefined;
  return match.pinnedSense === undefined ? 'is-grounded' : 'is-grounded is-pinned';
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
  const [pins, setPins] = useState<LexiconSensePins>({});
  const [openSense, setOpenSense] = useState<string | null>(null);
  const [retranslation, setRetranslation] = useState<string | null>(null);
  const [retranslateState, setRetranslateState] = useState<'idle' | 'running' | 'error'>('idle');
  // A model call outlives the pins it was made for. This token lets a late
  // answer from a superseded run be discarded instead of overwriting the panel.
  const retranslateRun = useRef(0);

  useEffect(() => setSelectedLens(lens), [lens]);

  // The pinned result is what the rest of the surface reads, so a pinned sense
  // reaches the ruby line, the harvest row and the mined card from one place.
  const pinned = useMemo(() => (result ? applySensePins(result, pins) : null), [pins, result]);

  // Purely derived from the grounded result, so it costs one pass per lookup
  // rather than a second bridge call.
  const harvest = useMemo(() => (pinned ? harvestLexiconVocabulary(pinned) : null), [pinned]);

  // Pure and derived from the pinned result, so whether a retranslation can say
  // anything is known before the model is woken, not after it answers.
  const senseHints = useMemo(() => collectSenseHints(pinned, glossLang), [glossLang, pinned]);
  const pinCount = Object.keys(pins).length;

  // The sense picker is one contextual panel rather than a popover per token, so
  // the open token is looked up by its pin key instead of held as a second copy.
  const openMatch = useMemo(() => {
    if (!openSense || !pinned) return null;
    for (const part of pinned.parts) {
      if (part.kind === 'token' && part.match && sensePinKey(part.match) === openSense) {
        return part.match;
      }
    }
    return null;
  }, [openSense, pinned]);

  // A row's mine state and a reader's sense choices both belong to the passage
  // they were made in, so a new lookup clears them rather than letting "Added"
  // or a pinned sense carry over onto a different word in the same position.
  function clearPassageState() {
    setMined({});
    setMineError({});
    setPins({});
    setOpenSense(null);
    clearRetranslation();
  }

  /**
   * A retranslation is only true of the pins it was produced from. Changing a
   * pin makes the displayed prose stale in a way the reader cannot see, so the
   * old text is dropped rather than left sitting under a different set of
   * senses.
   */
  function clearRetranslation() {
    retranslateRun.current += 1;
    setRetranslation(null);
    setRetranslateState('idle');
  }

  function pinSense(key: string, senseIndex: number | null) {
    clearRetranslation();
    setPins((prev) => {
      const next = { ...prev };
      if (senseIndex === null) delete next[key];
      else next[key] = senseIndex;
      return next;
    });
  }

  useEffect(() => {
    if (!interlinear) {
      setResult(null);
      setState('idle');
      clearPassageState();
      return;
    }
    let alive = true;
    setState('loading');
    setResult(null);
    clearPassageState();
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
   * Retranslate the passage with the reader's pins as translator constraints.
   *
   * The lookup that produced the interlinear is offline and instant; this is the
   * one place in the Workbench that wakes the local model, so it is explicitly
   * asked for rather than run on every pin.
   */
  async function retranslate() {
    if (!senseHints.length || retranslateState === 'running') return;
    const run = ++retranslateRun.current;
    setRetranslateState('running');
    setRetranslation(null);
    try {
      const text = await translateTo(query, lang, glossLang, undefined, senseHints);
      // A passage whose every sentence failed the translator's own validation
      // comes back empty rather than as a rejection. Showing that as a result
      // would be a blank panel indistinguishable from success.
      if (run !== retranslateRun.current) return;
      if (!text.trim()) {
        setRetranslateState('error');
        return;
      }
      setRetranslation(text);
      setRetranslateState('idle');
    } catch {
      if (run === retranslateRun.current) setRetranslateState('error');
    }
  }

  /**
   * Mine one harvested word. The request is built from the passage the row was
   * folded out of, so the card carries the sentence the learner actually met the
   * word in, and it routes through the same mining rules a dictionary mine uses.
   */
  async function mineHarvestItem(item: LexiconVocabularyItem) {
    if (!pinned || mined[item.key] === 'adding') return;
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
      const res = await window.api.ankiMineNote(buildHarvestMineRequest(item, pinned, { lang }));
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
          {pinned && (
            <div className="lexicon-interlinear-flow" lang={lang}>
              {pinned.parts.map((part) => {
                const key = `${part.start}-${part.end}`;
                if (part.kind === 'separator') return <span key={key}>{part.text}</span>;
                const match = part.match;
                const ruby = (
                  <ruby className={rubyClass(match)}>
                    {part.text}
                    <rt>{glossRt(match)}</rt>
                  </ruby>
                );
                // Only a token whose entry offers a real choice becomes a
                // control; a single-sense token stays plain text so the flow
                // does not fill up with buttons that do nothing.
                if (!match || !canPinSense(match)) return <span key={key}>{ruby}</span>;
                const pinKey = sensePinKey(match);
                return (
                  <button
                    aria-expanded={openSense === pinKey}
                    aria-label={t('lexicon.sense.choose', { word: part.text })}
                    className="lexicon-sense-token"
                    key={key}
                    onClick={() => setOpenSense((prev) => (prev === pinKey ? null : pinKey))}
                    type="button"
                  >
                    {ruby}
                  </button>
                );
              })}
            </div>
          )}
          {openMatch && openSense && (
            <div
              aria-label={t('lexicon.sense.group', { word: openMatch.text })}
              className="lexicon-sense-panel"
              role="group"
            >
              <div className="lexicon-sense-head">
                <span className="lexicon-sense-word" lang={lang}>{openMatch.text}</span>
                <span className="lexicon-sense-dict">{openMatch.dictTitle}</span>
                <button
                  className="lexicon-sense-close"
                  onClick={() => setOpenSense(null)}
                  type="button"
                >
                  {t('lexicon.sense.close')}
                </button>
              </div>
              <ul className="lexicon-sense-list">
                <li>
                  <button
                    aria-pressed={openMatch.pinnedSense === undefined}
                    onClick={() => pinSense(openSense, null)}
                    type="button"
                  >
                    <span className="lexicon-sense-gloss">{t('lexicon.sense.none')}</span>
                  </button>
                </li>
                {openMatch.senses?.map((sense) => {
                  const gloss = sense.glosses.map((entry) => entry.text).join('; ');
                  return (
                    <li key={sense.index}>
                      {/* The gloss is part of the accessible name, not only of the
                          visible row: an option named "Use sense 3" alone would drop
                          the very text the reader is choosing between (WCAG 2.5.3). */}
                      <button
                        aria-label={t('lexicon.sense.use', { index: sense.index + 1, gloss })}
                        aria-pressed={openMatch.pinnedSense === sense.index}
                        onClick={() => pinSense(openSense, sense.index)}
                        type="button"
                      >
                        <span className="lexicon-sense-index">{sense.index + 1}</span>
                        <span className="lexicon-sense-gloss">{gloss}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {/* Offered only once the reader has actually pinned something: with no
              pins this is just the translation they already have. */}
          {pinCount > 0 && (
            <div className="lexicon-retranslate">
              <div className="lexicon-retranslate-head">
                <button
                  className="lexicon-retranslate-run"
                  disabled={!senseHints.length || retranslateState === 'running'}
                  onClick={() => void retranslate()}
                  type="button"
                >
                  {retranslateState === 'running'
                    ? t('lexicon.retranslate.running')
                    : t('lexicon.retranslate.action')}
                </button>
                <span className="lexicon-retranslate-note muted">
                  {senseHints.length
                    ? t('lexicon.retranslate.applied', { count: senseHints.length })
                    : t('lexicon.retranslate.unusable')}
                </span>
              </div>
              {retranslateState === 'error' && (
                <p className="lexicon-retranslate-error" role="alert">
                  {t('lexicon.retranslate.failed')}
                </p>
              )}
              {retranslation && (
                <figure className="lexicon-retranslate-output">
                  <figcaption>{t('lexicon.retranslate.title')}</figcaption>
                  <p lang={glossLang}>{retranslation}</p>
                </figure>
              )}
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
