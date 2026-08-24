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
  LEXICON_DIFFICULTY_BANDS,
  scoreLexiconDifficulty,
} from '../../../shared/lexiconDifficulty';
import { checkLexiconComposition } from '../../../shared/lexiconComposition';
import {
  MAX_CONCORDANCE_MEDIA_ITEMS,
  findLexiconConcordance,
  type LexiconConcordanceCitation,
  type LexiconConcordanceSource,
} from '../../../shared/lexiconConcordance';
import {
  applySensePins,
  canPinSense,
  sensePinKey,
  type LexiconSensePins,
} from '../../../shared/lexiconSensePin';
import { collectSenseHints } from '../../../shared/lexiconRetranslate';
import {
  diffLexiconRoundTrip,
  type LexiconRoundTripBucket,
  type LexiconRoundTripDiff,
} from '../../../shared/lexiconRoundTrip';
import { resolveLexiconInput, type LexiconLensOverride } from '../../../shared/lexiconWorkbench';
import { explainSensesFromMatch, hasExplainGrounding } from '../../../shared/lexiconExplainView';
import EntryExplain from './EntryExplain';
import { ContextualSurface } from '../liquid/LiquidSurface';
import DictionaryResults, { type DictLang } from '../DictionaryResults';
import { translateTo } from '../../translator';
import { useT } from '../../i18n';
import { parseStudySubtitles } from '../../subtitles';
import { handOffToAgent, lexiconPassageAgentContext, routeAgentContext } from '../../agentContextHandoff';
import { AGENT_NAVIGATION_SECTION_LABEL_KEYS } from '../../../shared/agentNavigation';
import './lexiconWorkbench.css';

/** Gloss targets follow the imported dictionaries, not the source-side DictLang pair. */
type GlossLang = string;

/**
 * Per-row mining state. `dup` is a success for the learner — the word is
 * already studied — so it is kept distinct from `error`, which is the only
 * state that stays retryable.
 */
type MineState = 'adding' | 'added' | 'dup' | 'error';

type ConcordanceState = 'idle' | 'running' | 'done' | 'error';

function cueTimestamp(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

const MINE_LABEL_KEYS: Record<MineState, string> = {
  adding: 'lexicon.harvest.mining',
  added: 'lexicon.harvest.mined',
  dup: 'lexicon.harvest.mineDuplicate',
  // A failure returns the button to its offer: this is the one retryable state.
  error: 'lexicon.harvest.mine',
};

/**
 * A band's label, built from the threshold it is actually defined by.
 *
 * The numbers are interpolated rather than written into the catalog string so a
 * band edge can never move without the label moving with it — a row reading
 * "Top 1,500" over a band that now ends at 2,000 is a lie no test would catch.
 * The open-ended band is named by where it starts, which is the previous edge.
 */
function bandLabelKey(index: number): { key: string; max: number } {
  const band = LEXICON_DIFFICULTY_BANDS[index];
  if (Number.isFinite(band.maxRank)) {
    return { key: 'lexicon.difficulty.bandTop', max: band.maxRank };
  }
  return { key: 'lexicon.difficulty.bandBeyond', max: LEXICON_DIFFICULTY_BANDS[index - 1].maxRank };
}

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
  /** Passed straight through to `DictionaryResults`; see its own prop doc. */
  onLookup?: (word: string) => void;
}

export default function LexiconWorkbenchResults({
  query,
  lang,
  lookupAttempt,
  lens = 'auto',
  glossLang = 'en',
  onLookup,
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
  const [roundTrip, setRoundTrip] = useState<{ text: string; diff: LexiconRoundTripDiff } | null>(null);
  const [roundTripState, setRoundTripState] = useState<'idle' | 'running' | 'error'>('idle');
  const roundTripRun = useRef(0);
  const [concordance, setConcordance] = useState<LexiconConcordanceCitation[]>([]);
  const [concordanceState, setConcordanceState] = useState<ConcordanceState>('idle');
  const [concordanceScanned, setConcordanceScanned] = useState(0);
  const concordanceRun = useRef(0);

  useEffect(() => setSelectedLens(lens), [lens]);

  // The pinned result is what the rest of the surface reads, so a pinned sense
  // reaches the ruby line, the harvest row and the mined card from one place.
  const pinned = useMemo(() => (result ? applySensePins(result, pins) : null), [pins, result]);

  // Purely derived from the grounded result, so it costs one pass per lookup
  // rather than a second bridge call.
  const harvest = useMemo(() => (pinned ? harvestLexiconVocabulary(pinned) : null), [pinned]);
  // Only dictionary-grounded terms belong in a concordance. An unmatched token
  // may be an inflected phrase or a tokenizer gap; treating it as a word would
  // make a literal line match look lexically authoritative when it is not.
  const concordanceTerms = useMemo(
    () => harvest?.items.filter((item) => item.grounded && item.wordClass !== 'function') ?? [],
    [harvest],
  );

  // Same deal: the ranks arrived with the lookup, so the profile is a fold over
  // data already in hand and never a second trip to main.
  const difficulty = useMemo(() => (pinned ? scoreLexiconDifficulty(pinned) : null), [pinned]);
  const composition = useMemo(() => (pinned ? checkLexiconComposition(pinned) : null), [pinned]);

  // Pure and derived from the pinned result, so whether a retranslation can say
  // anything is known before the model is woken, not after it answers.
  const senseHints = useMemo(() => collectSenseHints(pinned, glossLang), [glossLang, pinned]);
  const pinCount = Object.keys(pins).length;

  function explainInAgent() {
    void handOffToAgent(
      lexiconPassageAgentContext(query),
      t('lexicon.explain.conversation'),
      routeAgentContext('dictionary', t(AGENT_NAVIGATION_SECTION_LABEL_KEYS.dictionary)),
    );
  }

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
    concordanceRun.current += 1;
    setConcordance([]);
    setConcordanceState('idle');
    setConcordanceScanned(0);
    clearRetranslation();
  }

  /**
   * Search only subtitle bytes already reachable through the local media bridge.
   * It is opt-in because even local disk I/O is surprising when a lookup itself
   * is otherwise instant. The hard media/result caps keep a large library from
   * turning one click into an unbounded main-process file scan.
   */
  async function searchPersonalConcordance() {
    if (!concordanceTerms.length || concordanceState === 'running') return;
    const run = ++concordanceRun.current;
    setConcordance([]);
    setConcordanceScanned(0);
    setConcordanceState('running');
    try {
      const media = (await window.api.listMedia()).slice(0, MAX_CONCORDANCE_MEDIA_ITEMS);
      const sources: LexiconConcordanceSource[] = [];
      for (const item of media) {
        const subtitle = await window.api.subtitleForPath(item.path);
        if (run !== concordanceRun.current) return;
        if (!subtitle?.text) continue;
        // The study parser: the concordance is evidence about the learner's own Japanese
        // corpus, and a dual-language `.ass` would put its Chinese track's shared hanzi
        // into the hit list as though the user had read that line in Japanese.
        const cues = parseStudySubtitles(subtitle.text).cues;
        if (cues.length) sources.push({ mediaId: item.id, title: item.title, cues });
      }
      if (run !== concordanceRun.current) return;
      setConcordanceScanned(sources.length);
      setConcordance(findLexiconConcordance(
        concordanceTerms.map((item) => ({ key: item.key, text: item.text })),
        sources,
      ));
      setConcordanceState('done');
    } catch {
      if (run === concordanceRun.current) setConcordanceState('error');
    }
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
    clearRoundTrip();
  }

  /**
   * A round trip is a statement about one translation. The moment that
   * translation is replaced — or re-run and about to be — the diff underneath it
   * describes prose the reader can no longer see, so it goes with it.
   */
  function clearRoundTrip() {
    roundTripRun.current += 1;
    setRoundTrip(null);
    setRoundTripState('idle');
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
      // The Workbench is the surface that renders a difficulty profile, so it is
      // the one that asks main to pay for the frequency lists — and for the
      // morphological analysis that keeps particles out of that profile.
      .then((glossLangs) => window.api.lookupOfflineInterlinear(query, {
        sourceLangs: [lang],
        glossLangs,
        withFrequency: true,
        withPartOfSpeech: true,
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
    clearRoundTrip();
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
   * Translate the retranslation back and show which of the passage's words came
   * with it.
   *
   * The return leg is deliberately sent **without** the sense hints. The
   * question this asks is whether the English prose still carries the reader's
   * words; handing the model the pinned glosses on the way back would plant the
   * very words the check is looking for, and every round trip would flatter the
   * translation it is supposed to audit.
   */
  async function checkRoundTrip() {
    if (!retranslation || !pinned || roundTripState === 'running') return;
    const run = ++roundTripRun.current;
    setRoundTripState('running');
    setRoundTrip(null);
    try {
      const back = await translateTo(retranslation, glossLang, lang);
      if (run !== roundTripRun.current) return;
      // A back-translation that failed the translator's own validation comes
      // back empty. Diffing that would report the whole passage as lost, which
      // reads as a damning result for the translation rather than what it is:
      // no answer at all.
      if (!back.trim()) {
        setRoundTripState('error');
        return;
      }
      const result = await window.api.lookupOfflineInterlinear(back, {
        sourceLangs: [lang],
        glossLangs: [glossLang.trim().toLowerCase() || 'en'],
      });
      if (run !== roundTripRun.current) return;
      setRoundTrip({ text: back, diff: diffLexiconRoundTrip(pinned, result) });
      setRoundTripState('idle');
    } catch {
      if (run === roundTripRun.current) setRoundTripState('error');
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

  /**
   * One diff bucket. An empty bucket renders nothing rather than an empty list:
   * "Did not come back" over no rows reads as a failure to load.
   */
  function roundTripBucket(kind: 'lost' | 'added' | 'kept', bucket: LexiconRoundTripBucket) {
    if (!bucket.total) return null;
    const title = t(`lexicon.roundTrip.${kind}`);
    return (
      <div aria-label={title} className={`lexicon-roundtrip-bucket is-${kind}`} role="group">
        <p className="lexicon-roundtrip-bucket-title">
          {title}
          <span className="lexicon-roundtrip-bucket-count">{bucket.total}</span>
        </p>
        <ul>
          {bucket.words.map((word) => (
            <li className={word.pinned ? 'is-pinned' : undefined} key={word.key}>
              <span className="lexicon-roundtrip-word" lang={lang}>{word.text}</span>
              {word.reading && (
                <span className="lexicon-roundtrip-reading" lang={lang}>{word.reading}</span>
              )}
              {word.pinned && (
                <span className="lexicon-roundtrip-badge">{t('lexicon.roundTrip.pinnedBadge')}</span>
              )}
              {word.glosses.length > 0 && (
                <span className="lexicon-roundtrip-gloss">{word.glosses.join('; ')}</span>
              )}
            </li>
          ))}
        </ul>
        {bucket.total > bucket.words.length && (
          <p className="muted">
            {t('lexicon.roundTrip.more', { count: bucket.total - bucket.words.length })}
          </p>
        )}
      </div>
    );
  }

  return (
    <section className="lexicon-workbench" aria-label={t('lexicon.workbench.interlinear')}>
      {lens === 'auto' && (
        <ContextualSurface
          className="lexicon-lens-picker"
          role="group"
          aria-label={t('lexicon.lens.group')}
        >
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
        </ContextualSurface>
      )}
      {!interlinear ? (
        <DictionaryResults key={lookupAttempt} query={query} variant="page" lang={lang} onLookup={onLookup} />
      ) : (
        <div className="lexicon-interlinear">
          <div className="lexicon-interlinear-meta">
            <span>{t('lexicon.workbench.detected', { kind: t(`lexicon.kind.${resolution.kind}`) })}</span>
            {result?.truncated && <span>{t('lexicon.workbench.truncated')}</span>}
          </div>
          {state === 'loading' && <p className="muted">{t('common.loading')}</p>}
          {state === 'error' && <p role="alert">{t('lexicon.workbench.offlineFailed')}</p>}
          {pinned && (
            <>
              <div className="lexicon-explain-bar">
                <button className="lexicon-explain-run" onClick={explainInAgent} type="button">
                  {t('lexicon.explain.action')}
                </button>
                <span className="muted">{t('lexicon.explain.generated')}</span>
              </div>
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
                // A token becomes a control when the panel has something to put
                // in it: a real sense choice, or — since the panel gained
                // Explain — an entry grounded enough to explain. A token whose
                // dictionary said nothing in the reader's target languages
                // stays plain text, so the flow still never fills up with
                // buttons that open an empty panel.
                const pinnable = !!match && canPinSense(match);
                if (!match || !(pinnable || hasExplainGrounding(match))) {
                  return <span key={key}>{ruby}</span>;
                }
                const pinKey = sensePinKey(match);
                return (
                  <button
                    aria-expanded={openSense === pinKey}
                    aria-label={t(
                      pinnable ? 'lexicon.sense.choose' : 'lexicon.sense.openExplain',
                      { word: part.text },
                    )}
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
            </>
          )}
          {openMatch && openSense && (
            <div
              aria-label={t(
                canPinSense(openMatch) ? 'lexicon.sense.group' : 'lexicon.sense.groupExplain',
                { word: openMatch.text },
              )}
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
              {/* No list at all when the entry offers one sense: "no pinned
                  sense" against a single option is a choice with one outcome,
                  and the flat gloss line above already says the same thing. */}
              {canPinSense(openMatch) ? (
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
              ) : (
                <p className="muted lexicon-sense-single">{t('lexicon.sense.single')}</p>
              )}
              {/* The one place on this surface a single word is already the
                  subject. The grounding is the token's own entry rather than the
                  passage, and it deliberately ignores the pin above it — see
                  `explainSensesFromMatch` for why a pinned sense must not reach
                  a cache keyed on the word. */}
              <EntryExplain
                word={openMatch.text}
                reading={openMatch.reading}
                lang={lang}
                senses={explainSensesFromMatch(openMatch)}
              />
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
              {/* Offered only once a translation exists to send back: there is
                  nothing to read back before one has been produced. */}
              {retranslation && (
                <div className="lexicon-roundtrip">
                  <button
                    className="lexicon-roundtrip-run"
                    disabled={roundTripState === 'running'}
                    onClick={() => void checkRoundTrip()}
                    type="button"
                  >
                    {roundTripState === 'running'
                      ? t('lexicon.roundTrip.running')
                      : t('lexicon.roundTrip.action')}
                  </button>
                  {roundTripState === 'error' && (
                    <p className="lexicon-roundtrip-error" role="alert">
                      {t('lexicon.roundTrip.failed')}
                    </p>
                  )}
                  {roundTrip && (
                    <div className="lexicon-roundtrip-body">
                      <figure className="lexicon-roundtrip-output">
                        <figcaption>{t('lexicon.roundTrip.title')}</figcaption>
                        <p lang={lang}>{roundTrip.text}</p>
                      </figure>
                      {/* A round trip nothing could be grounded in says nothing
                          about the translation. Reporting "0 of 5 came back"
                          here would blame the prose for a missing dictionary. */}
                      {!roundTrip.diff.comparable ? (
                        <p className="muted">{t('lexicon.roundTrip.incomparable')}</p>
                      ) : (
                        <>
                          <p className="lexicon-roundtrip-summary">
                            {t('lexicon.roundTrip.summary', {
                              kept: roundTrip.diff.kept.total,
                              total: roundTrip.diff.originalCount,
                            })}
                          </p>
                          {roundTrip.diff.pinnedLost > 0 && (
                            <p className="lexicon-roundtrip-pinned-lost">
                              {t('lexicon.roundTrip.pinnedLost', { count: roundTrip.diff.pinnedLost })}
                            </p>
                          )}
                          {roundTripBucket('lost', roundTrip.diff.lost)}
                          {roundTripBucket('added', roundTrip.diff.added)}
                          {roundTripBucket('kept', roundTrip.diff.kept)}
                          {(roundTrip.diff.ungrounded.original > 0
                            || roundTrip.diff.ungrounded.roundTrip > 0) && (
                            <p className="muted">
                              {t('lexicon.roundTrip.ungrounded', {
                                original: roundTrip.diff.ungrounded.original,
                                roundTrip: roundTrip.diff.ungrounded.roundTrip,
                              })}
                            </p>
                          )}
                          <p className="muted lexicon-roundtrip-note">{t('lexicon.roundTrip.note')}</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {difficulty && difficulty.distinct > 0 && (
            <details className="lexicon-difficulty" open>
              <summary>{t('lexicon.difficulty.title')}</summary>
              {/* Every rank came back empty. Printing four zero-count bands here
                  would read as "every word in this passage is rare", which is
                  the opposite of what an empty frequency list means. */}
              {!difficulty.scored ? (
                <p className="muted">{t('lexicon.difficulty.unscored')}</p>
              ) : (
                <>
                  <p className="lexicon-difficulty-summary">
                    {t('lexicon.difficulty.coverage', {
                      ranked: difficulty.ranked,
                      distinct: difficulty.distinct,
                    })}
                    {difficulty.medianRank !== undefined
                      && ` ${t('lexicon.difficulty.median', { rank: difficulty.medianRank })}`}
                  </p>
                  {/* Every band is shown, including the empty ones: unlike a diff
                      bucket, "no words past 15,000" is itself the answer the
                      reader came for. */}
                  <ul
                    aria-label={t('lexicon.difficulty.bandGroup')}
                    className="lexicon-difficulty-bands"
                  >
                    {difficulty.bands.map((band, index) => {
                      const label = bandLabelKey(index);
                      return (
                        <li className={`is-${band.id}`} key={band.id}>
                          <span className="lexicon-difficulty-band-label">
                            {t(label.key, { max: label.max })}
                          </span>
                          <span className="lexicon-difficulty-band-count">{band.count}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {difficulty.hardest.length > 0 && (
                    <div
                      aria-label={t('lexicon.difficulty.hardest')}
                      className="lexicon-difficulty-hardest"
                      role="group"
                    >
                      <p className="lexicon-difficulty-hardest-title">
                        {t('lexicon.difficulty.hardest')}
                      </p>
                      <ul>
                        {difficulty.hardest.map((word) => (
                          <li key={word.key}>
                            <span className="lexicon-difficulty-word" lang={lang}>{word.text}</span>
                            {word.reading && (
                              <span className="lexicon-difficulty-reading" lang={lang}>
                                {word.reading}
                              </span>
                            )}
                            <span className="lexicon-difficulty-rank">
                              {t('lexicon.difficulty.rankBadge', { rank: word.rank })}
                            </span>
                            {word.count > 1 && (
                              <span className="lexicon-difficulty-count muted">
                                {t('lexicon.difficulty.occurrences', { count: word.count })}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {difficulty.unranked > 0 && (
                    <p className="muted">
                      {t('lexicon.difficulty.unranked', { count: difficulty.unranked })}
                    </p>
                  )}
                  {difficulty.ungrounded > 0 && (
                    <p className="muted">
                      {t('lexicon.difficulty.ungrounded', { count: difficulty.ungrounded })}
                    </p>
                  )}
                  {difficulty.functionWords > 0 && (
                    <p className="muted">
                      {t('lexicon.difficulty.functionWords', { count: difficulty.functionWords })}
                    </p>
                  )}
                  <p className="muted">
                    {t('lexicon.difficulty.sources', { sources: difficulty.sources.join(', ') })}
                  </p>
                  {/* The note has to say which of the two profiles this is: the
                      grammar is only separated out when an analyser reached the
                      passage, and a reader cannot tell a passage with no
                      particles from one nothing analysed. */}
                  <p className="muted lexicon-difficulty-note">
                    {t(difficulty.analyzed
                      ? 'lexicon.difficulty.note'
                      : 'lexicon.difficulty.noteUnanalyzed')}
                  </p>
                </>
              )}
            </details>
          )}
          {composition && (
            <details className="lexicon-composition" open>
              <summary>{t('lexicon.composition.title')}</summary>
              {composition.issues.length === 0 ? (
                <p className="muted">
                  {t(composition.analyzed
                    ? 'lexicon.composition.clear'
                    : 'lexicon.composition.clearUnanalyzed')}
                </p>
              ) : (
                <ul className="lexicon-composition-list">
                  {composition.issues.map((issue) => (
                    <li key={`${issue.kind}-${issue.start}-${issue.end}`}>
                      <code lang={lang}>{issue.text}</code>
                      <span>{t(`lexicon.composition.${issue.kind}`)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="muted lexicon-composition-note">
                {t(composition.analyzed
                  ? 'lexicon.composition.note'
                  : 'lexicon.composition.noteUnanalyzed')}
              </p>
            </details>
          )}
          {concordanceTerms.length > 0 && (
            <details className="lexicon-concordance">
              <summary>{t('lexicon.concordance.title')}</summary>
              <p className="muted lexicon-concordance-note">
                {t('lexicon.concordance.note', { max: MAX_CONCORDANCE_MEDIA_ITEMS })}
              </p>
              <button
                className="lexicon-concordance-run"
                disabled={concordanceState === 'running'}
                onClick={() => void searchPersonalConcordance()}
                type="button"
              >
                {t(concordanceState === 'running'
                  ? 'lexicon.concordance.running'
                  : 'lexicon.concordance.action')}
              </button>
              {concordanceState === 'error' && (
                <p className="lexicon-concordance-error" role="alert">
                  {t('lexicon.concordance.failed')}
                </p>
              )}
              {concordanceState === 'done' && concordance.length === 0 && (
                <p className="muted">
                  {t('lexicon.concordance.empty', { count: concordanceScanned })}
                </p>
              )}
              {concordance.length > 0 && (
                <>
                  <p className="muted">
                    {t('lexicon.concordance.summary', {
                      count: concordance.length,
                      sources: concordanceScanned,
                    })}
                  </p>
                  <ol className="lexicon-concordance-list">
                    {concordance.map((citation) => (
                      <li key={`${citation.mediaId}-${citation.start}-${citation.end}`}>
                        <div className="lexicon-concordance-source">
                          <strong>{citation.title}</strong>
                          <span>{cueTimestamp(citation.start)}</span>
                        </div>
                        <blockquote lang={lang}>{citation.text}</blockquote>
                        <div className="lexicon-concordance-terms">
                          {citation.terms.map((key) => (
                            <span key={key}>
                              {harvest.items.find((item) => item.key === key)?.text ?? key}
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ol>
                  <p className="muted lexicon-concordance-scope">
                    {t('lexicon.concordance.scope')}
                  </p>
                </>
              )}
            </details>
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
