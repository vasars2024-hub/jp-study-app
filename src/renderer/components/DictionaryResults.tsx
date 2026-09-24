import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AnkiStatus, DictEntry, DictResult, ExampleSentence } from '../../shared/types';
import type { StudyProfile } from '../../shared/profiles';
import {
  buildExampleByLang,
  extractTranslationRefs,
  hasFieldTemplates,
  maxExampleCountNeeded,
  pickExamplesForMining,
  requiredExampleLangs,
  resolveExampleCount,
  resolveMiningTemplates,
  templatesNeedExamples,
  type AnkiLinkStatus,
  type ExampleCountLang,
} from '../../shared/anki';
import AnkiSetup from './AnkiSetup';
import Icon from './Icons';
import { loadSaved, onSavedChanged, removeSaved, SAVED_WORDS_BOOK_ID, SAVED_WORDS_BOOK_TITLE, SAVED_WORDS_FOLDER } from '../savedWords';
import { mineToStudy, type MineToStudyInput } from '../studyMining';
import { cycleLevel, getLevel, onKnowledgeChanged, type WkLevel } from '../knownWords';
import { getStudyLang, onStudyLangChanged } from '../studyEnvironment';
import { getActiveProfile, onProfileChanged } from '../profileState';
import { translateTo, type TransLang } from '../translator';
// Imported from their defining modules rather than the `shared/mining` barrel.
// That barrel re-exports `aiMiningCatalog` (41 KB of AI prompt presets), and
// DictionaryResults is in Blanc's boot path — going through the barrel dragged
// the whole catalog into the entry chunk. Same reason StatsContent imports
// `confirmDialog` from `ui/dialogService` instead of the `ui` barrel.
import {
  DICT_LOOKUP_LIMIT,
  DICT_LOOKUP_MAX_LIMIT,
  nextLookupLimit,
} from '../../shared/dictionaryLookup';
import { firstGlossSegment } from '../../shared/epubEnrichment';
import { glossForLangFromEntries } from '../../shared/fieldRouter';
import { isGroundableCharacter } from '../../shared/langs';
import { recordDictionaryEntry } from '../clipboardHistory';
import { recordLookup } from '../lookupHistory';
import { useT } from '../i18n';
import CharacterMetadataPanel from './lexicon/CharacterMetadataPanel';
import CharacterMetadataUnavailable from './lexicon/CharacterMetadataUnavailable';
import ConjugationTable from './lexicon/ConjugationTable';
import LexiconCollocations from './lexicon/LexiconCollocations';
import LexiconCompounds from './lexicon/LexiconCompounds';
import LexiconExamples from './lexicon/LexiconExamples';
import LexiconEtymology from './lexicon/LexiconEtymology';
import WordFrequency from './lexicon/WordFrequency';
import LexiconXrefs from './lexicon/LexiconXrefs';
import WordAudio from './lexicon/WordAudio';
import EntryNote from './lexicon/EntryNote';
import EntryExplain from './lexicon/EntryExplain';
import SemanticNeighbors from './lexicon/SemanticNeighbors';
import UsageLabels, { entryUsageTags } from './lexicon/UsageLabels';
import WordKnowledge from './lexicon/WordKnowledge';

type TFn = (key: string) => string;

// Maps the stable de-inflection reason identifiers (shared/deinflect.ts) to
// their localized catalog keys. Unmapped reasons fall back to the raw string.
const REASON_KEY: Record<string, string> = {
  polite: 'deinflect.reason.polite',
  'polite negative': 'deinflect.reason.politeNegative',
  'polite past': 'deinflect.reason.politePast',
  'polite past negative': 'deinflect.reason.politePastNegative',
  'polite volitional': 'deinflect.reason.politeVolitional',
  negative: 'deinflect.reason.negative',
  past: 'deinflect.reason.past',
  '-te': 'deinflect.reason.te',
  causative: 'deinflect.reason.causative',
  passive: 'deinflect.reason.passive',
  'passive/potential': 'deinflect.reason.passivePotential',
  potential: 'deinflect.reason.potential',
  volitional: 'deinflect.reason.volitional',
  imperative: 'deinflect.reason.imperative',
  'conditional (–ば)': 'deinflect.reason.conditionalBa',
  'conditional (–たら)': 'deinflect.reason.conditionalTara',
  '–たり': 'deinflect.reason.tari',
  '–たい': 'deinflect.reason.tai',
  '–すぎる': 'deinflect.reason.sugiru',
  adverbial: 'deinflect.reason.adverbial',
  'progressive (–ている)': 'deinflect.reason.progressive',
  'completion (–てしまう)': 'deinflect.reason.shimau',
  'completion (–ちゃう)': 'deinflect.reason.chau',
  '–ておく': 'deinflect.reason.teoku',
};

function reasonLabel(reason: string, t: TFn): string {
  const key = REASON_KEY[reason];
  return key ? t(key) : reason;
}

/** Word-level bases: dictionary gloss first, Qwen only as the fail-switch. */
const WORD_LEVEL_BASES = new Set(['expression', 'meaning', 'translation']);

export type DictLang = 'ja' | 'zh';

const EX_LANG_KEY = 'jp-study-ex-langs';
const EX_DISPLAY_KEY = 'jp-study-ex-display';
const EX_LANGS: { code: TransLang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
];

function loadExDisplay(): number {
  try {
    const raw = localStorage.getItem(EX_DISPLAY_KEY);
    if (raw) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 1 && n <= 30) return n;
    }
  } catch {
    /* ignore */
  }
  return 6;
}

function exampleCountsFor(profile: StudyProfile): Record<ExampleCountLang, number> {
  const c = profile.anki.exampleCounts;
  return {
    ja: resolveExampleCount(c, 'ja'),
    en: resolveExampleCount(c, 'en'),
    ru: resolveExampleCount(c, 'ru'),
    zh: resolveExampleCount(c, 'zh'),
  };
}

/**
 * What an example is shown in when the user has never chosen: English, which Tatoeba ships
 * alongside every sentence, plus the profile's own non-Japanese language when that is something
 * else.
 *
 * The hardcoded `['en', 'ru']` this replaces made every profile — including an English one that
 * has no use for the second column — start an offline Qwen3 load the first time it opened this
 * panel: measured 2026-08-24, ~15 s and main 420.7 -> 3,323 MB, +3,339 handles, for a language
 * the reader never asked for. A Russian profile still gets exactly the old default, which is the
 * profile that default was written for.
 */
function defaultExLangs(profile: StudyProfile): TransLang[] {
  const native = nativeLangOf(profile);
  const langs: TransLang[] = ['en'];
  if (native !== 'en' && native !== 'ja' && EX_LANGS.some((l) => l.code === native)) {
    langs.push(native);
  }
  return langs;
}

function loadExLangs(profile: StudyProfile): TransLang[] {
  try {
    const raw = localStorage.getItem(EX_LANG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
        return parsed.filter((x): x is TransLang => EX_LANGS.some((l) => l.code === x));
      }
    }
  } catch {
    /* ignore */
  }
  return defaultExLangs(profile);
}

interface Props {
  query: string;
  variant?: 'popup' | 'page';
  /** Sentence the word came from — attached to Anki cards for mining. */
  context?: string;
  /** Which dictionary to use: Japanese (Jisho) or Chinese (CC-CEDICT). */
  lang?: DictLang;
  /**
   * Run a fresh lookup for a word one of the expansion panels points at.
   *
   * The single navigation seam for this whole column: the panels below own no
   * query state, and a host that has no search box to answer with simply omits
   * it, which leaves every target a plain label rather than a control that goes
   * nowhere. `LexiconXrefs` is the first consumer; its siblings can take the
   * same callback without a second mechanism.
   */
  onLookup?: (word: string) => void;
}

/**
 * `saved`: in the local deck, Anki not set up here. `queued`: in the local deck,
 * waiting for Anki to open. Both are successes — the card exists.
 */
type AddState = 'idle' | 'translating' | 'adding' | 'added' | 'dup' | 'saved' | 'queued' | 'error';
type ExState = 'idle' | 'loading' | 'done' | 'error';

/** The profile's non-Japanese language — the one a sentence should translate into. */
function nativeLangOf(profile: StudyProfile): 'en' | 'ru' | 'ja' {
  const { frontLang, backLang } = profile.card;
  return frontLang !== 'ja' ? frontLang : backLang;
}

/** True when field templates reference any example-sentence variable. */
function wantsExampleSentences(profile: StudyProfile): boolean {
  if (!hasFieldTemplates(profile.anki.fieldTemplates)) return false;
  return Object.values(profile.anki.fieldTemplates ?? {}).some((t) =>
    /\{[^}]*example-?sentence[^}]*\}/i.test(t),
  );
}

/** True when templates use bare {translation} (not {translation:xx}). */
function wantsBareTranslation(profile: StudyProfile): boolean {
  if (!hasFieldTemplates(profile.anki.fieldTemplates)) return false;
  return Object.values(profile.anki.fieldTemplates ?? {}).some((t) =>
    /\{translation\}/i.test(t) && !/\{translation:/i.test(t),
  );
}

/** Front/back language that bare {translation} should be written in. */
function translationLangOf(profile: StudyProfile): TransLang | null {
  const templates = profile.anki.fieldTemplates ?? {};
  const blob = Object.values(templates).join('\n');
  if (!/\{translation\}/i.test(blob) || /\{translation:/i.test(blob)) return null;
  for (const [field, tpl] of Object.entries(templates)) {
    if (!/\{translation\}/i.test(tpl) || /\{translation:/i.test(tpl)) continue;
    if (/front|表|見出/i.test(field)) return profile.card.frontLang as TransLang;
    if (/back|裏|意味|訳/i.test(field)) return profile.card.backLang as TransLang;
  }
  return profile.card.frontLang !== 'ja'
    ? (profile.card.frontLang as TransLang)
    : (profile.card.backLang as TransLang);
}

/** True when the note maps the {sentence-translation} variable somewhere. */
function wantsSentenceTranslation(profile: StudyProfile): boolean {
  if (hasFieldTemplates(profile.anki.fieldTemplates)) {
    return Object.values(profile.anki.fieldTemplates ?? {}).some((t) =>
      /\{[^}]*sentence-?translation[^}]*\}/i.test(t),
    );
  }
  return false;
}

/** The source text + language for a translatable base variable ({base:lang}). */
function baseSourceText(
  base: string,
  entry: DictEntry,
  sentence: string | undefined,
  exampleSentence: string | undefined,
  lang: DictLang,
): { text: string; source: TransLang } | null {
  switch (base) {
    case 'expression':
      return { text: entry.word, source: lang };
    case 'reading':
      return { text: entry.reading, source: lang };
    case 'sentence':
      return { text: sentence ?? '', source: lang };
    case 'example-sentence':
      return { text: exampleSentence ?? '', source: lang };
    case 'meaning':
      return { text: glossFor(entry), source: 'en' }; // the gloss is already English
    case 'translation':
      return { text: entry.word, source: lang };
    case 'sentence-translation':
      return { text: sentence ?? '', source: lang };
    default:
      return null; // cloze/pitch/frequency/etc. aren't translatable
  }
}

/** One-line meaning for saving to Flashcards (first two senses). */
function plainMeaning(entry: DictEntry): string {
  return entry.senses
    .slice(0, 2)
    .map((s) => s.definitions.join('; '))
    .filter(Boolean)
    .join(' / ');
}

/** True when the active profile's field templates reference {audio}. */
function profileWantsAudio(profile: StudyProfile): boolean {
  if (!hasFieldTemplates(profile.anki.fieldTemplates)) return false;
  return Object.values(profile.anki.fieldTemplates ?? {}).some((t) =>
    /\{[^}]*(audio|sound)[^}]*\}/i.test(t),
  );
}

/** Fuller gloss for the Anki `{meaning}` variable (all senses, one line). */
function glossFor(entry: DictEntry): string {
  if (entry.glossaryHtml) {
    return entry.glossaryHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return entry.senses
    .map((s) => s.definitions.join('; '))
    .filter(Boolean)
    .join(' / ');
}

export default function DictionaryResults({ query, variant = 'popup', lang = 'ja', context, onLookup }: Props) {
  const { t } = useT();
  const [result, setResult] = useState<DictResult | null>(null);
  const [anki, setAnki] = useState<AnkiStatus | null>(null);
  const [ankiLink, setAnkiLink] = useState<AnkiLinkStatus | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [active, setActive] = useState<StudyProfile>(getActiveProfile);
  const [addState, setAddState] = useState<Record<number, AddState>>({});
  const [addErr, setAddErr] = useState<Record<number, string>>({});
  const [copyError, setCopyError] = useState<string | null>(null);
  const [savedSet, setSavedSet] = useState<Set<string>>(() => new Set(loadSaved().map((w) => w.word)));
  const [studyLang, setStudyLang] = useState(getStudyLang);
  // A counter rather than a copy of the store: `cycleLevel` and an Anki sync
  // both persist and then emit, so re-reading on the emit keeps one source of
  // truth instead of a local map that could drift from it.
  const [knowledgeTick, setKnowledgeTick] = useState(0);
  const [exState, setExState] = useState<ExState>('idle');
  const [examples, setExamples] = useState<ExampleSentence[]>([]);
  const [exError, setExError] = useState('');
  const [selectedEx, setSelectedEx] = useState<Set<number>>(() => new Set());
  const [exDisplay, setExDisplay] = useState(loadExDisplay);
  const [exLangs, setExLangs] = useState<TransLang[]>(() => loadExLangs(getActiveProfile()));
  const [exTrans, setExTrans] = useState<Record<string, Partial<Record<TransLang, string>>>>({});
  const [exTransLoading, setExTransLoading] = useState(false);
  /**
   * Percent, while the offline translation model is loading — `null` once it is ready or was
   * already resident. Measured 2026-08-24: this control is the one Dictionary action that starts
   * a Qwen3 load, and that load takes ~15 s and 2.9 GB of main-process memory. Reporting only
   * "Translating examples…" for those 15 s is a state the app knows to be wrong about itself.
   */
  const [exModelPct, setExModelPct] = useState<number | null>(null);
  const recordedLookupRef = useRef('');

  /**
   * How many entries this lookup asks for, keyed to the query it belongs to.
   *
   * The key is stored *with* the page size rather than reset from an effect on
   * purpose. A reset effect would run after the lookup effect, so a new query
   * would first be fetched at the previous word's expanded page and then again
   * at the default — two database reads and a visible reflow. Deriving the limit
   * during render instead means a new query is already back at page one on the
   * first render that sees it.
   */
  const [page, setPage] = useState<{ key: string; limit: number }>({
    key: '',
    limit: DICT_LOOKUP_LIMIT,
  });
  const pageKey = `${lang}\0${query.trim()}`;
  const limit = page.key === pageKey ? page.limit : DICT_LOOKUP_LIMIT;

  // (Re)look up whenever the query changes, or the reader asks for more of it.
  useEffect(() => {
    let alive = true;
    setResult(null);
    setShowSetup(false);
    setAddState({});
    setAddErr({});
    setExState('idle');
    setExamples([]);
    setExError('');
    setSelectedEx(new Set());
    setExTrans({});
    if (!query.trim()) return;
    const lookup =
      lang === 'zh' ? window.api.lookupChinese(query, limit) : window.api.lookupTerm(query, limit);
    lookup.then((r) => {
      if (!alive) return;
      setResult(r);
      const entry = r.entries[0];
      if (!entry) return;
      const lemma = r.deinflection?.term?.trim() || entry.word.trim() || query.trim();
      const recordKey = `${lang}\u0000${query.trim()}\u0000${lemma}`;
      if (recordedLookupRef.current === recordKey) return;
      recordedLookupRef.current = recordKey;
      recordLookup({
        query,
        lemma,
        reading: entry.reading,
        meaning: plainMeaning(entry),
        jlptLevel: entry.jlpt[0],
        context,
        lang,
      });
    });
    return () => {
      alive = false;
    };
  }, [query, lang, limit]);

  // Keep the star state in sync with saves from other views.
  useEffect(() => onSavedChanged(() => setSavedSet(new Set(loadSaved().map((w) => w.word)))), []);

  // Grading the same word in the popup, the Lens reader or an Anki sync must
  // show up here too — the overlay is a view of one store, not a second one.
  useEffect(() => onKnowledgeChanged(() => setKnowledgeTick((n) => n + 1)), []);
  useEffect(() => onStudyLangChanged(setStudyLang), []);

  // Refresh cached Anki status when the heartbeat reconnects or collection loads.
  useEffect(
    () =>
      window.api.onAnkiLinkChanged((link) => {
        setAnkiLink(link);
        if (link.state === 'connected') {
          window.api.ankiStatus().then((s) => {
            setAnki(s);
            if (s.connected) setShowSetup(false);
          });
          return;
        }
        if (link.waitingCollection) {
          setAnki({
            connected: false,
            decks: [],
            models: [],
            error: link.error,
          });
        }
      }),
    [],
  );

  // Show mining target / connection state as soon as the popup opens.
  useEffect(() => {
    let alive = true;
    window.api.ankiLinkState().then((link) => {
      if (alive) setAnkiLink(link);
    });
    window.api.ankiStatus().then((s) => {
      if (alive) setAnki(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Mining follows the active study profile — switch profiles and the target
  // deck / note type / field mapping all change with it.
  useEffect(
    () =>
      onProfileChanged((snap) => {
        const a = snap.profiles.find((p) => p.id === snap.activeProfileId);
        if (a) setActive(a);
      }),
    [],
  );

  async function ensureAnki(): Promise<AnkiStatus | null> {
    // Always re-check — a prior timeout may have cached connected:false while
    // Anki was still running.
    const s = await window.api.ankiStatus();
    setAnki(s);
    if (!s.connected) {
      setShowSetup(true);
      return null;
    }
    setShowSetup(false);
    return s;
  }

  /** The local-deck half of a dictionary mine; one identity for star and Add. */
  function studyCardFor(entry: DictEntry, sentence: string | undefined): MineToStudyInput {
    return {
      word: entry.word,
      reading: entry.reading && entry.reading !== entry.word ? entry.reading : '',
      meaning: plainMeaning(entry),
      sentence,
      source: 'dictionary',
      sourceId: SAVED_WORDS_BOOK_ID,
      sourceTitle: SAVED_WORDS_BOOK_TITLE,
      folder: SAVED_WORDS_FOLDER,
      studyLang: lang,
    };
  }

  async function addToAnki(entry: DictEntry, i: number) {
    // Offline-first: the card is in the local deck before anything asks Anki,
    // so a closed Anki, a missing example or a failed translation below can
    // no longer lose it. The Anki half joins the same card at the end.
    const sentence = context?.trim() || undefined;
    await mineToStudy({ ...studyCardFor(entry, sentence), notify: false });
    void window.api.ankiStatus().then(setAnki).catch(() => undefined);
    const counts = exampleCountsFor(active);
    const autoMax = Math.max(...Object.values(counts), 1);

    const templates = active.anki.fieldTemplates ?? {};
    const neededExLangs = requiredExampleLangs(templates);
    const mustHaveExamples =
      (neededExLangs.length > 0 || wantsExampleSentences(active)) &&
      active.anki.exampleFallback !== true;
    const canFallback = active.anki.exampleFallback === true && templatesNeedExamples(templates);
    let useExampleFallback = false;

    let miningExamples = examples;
    if (miningExamples.length === 0 && selectedEx.size === 0 && (mustHaveExamples || canFallback)) {
      setAddState((p) => ({ ...p, [i]: 'translating' }));
      const fetchLimit = Math.max(exDisplay, maxExampleCountNeeded(active.anki.exampleCounts));
      const r = await fetchExamplesForMining(entry, fetchLimit);
      if (r.examples.length > 0) {
        miningExamples = r.examples;
        setExamples(r.examples);
        setExState('done');
      } else if (canFallback) {
        useExampleFallback = true;
      } else if (r.error) {
        setAddState((p) => ({ ...p, [i]: 'error' }));
        setAddErr((p) => ({
          ...p,
          [i]: t('dict.results.err.loadExamples', { error: r.error }),
        }));
        return;
      } else {
        setAddState((p) => ({ ...p, [i]: 'error' }));
        setAddErr((p) => ({
          ...p,
          [i]: t('dict.results.err.noTatoeba'),
        }));
        return;
      }
    }

    const { picked, manual } = pickExamplesForMining(miningExamples, selectedEx, autoMax);

    if (picked.length === 0 && canFallback) {
      useExampleFallback = true;
    } else if (mustHaveExamples && picked.length === 0) {
      setAddState((p) => ({ ...p, [i]: 'error' }));
      setAddErr((p) => ({
        ...p,
        [i]: t('dict.results.err.examplesRequired'),
      }));
      return;
    }

    const langsToTranslate = [
      ...new Set<ExampleCountLang>([
        ...neededExLangs,
        ...exLangs.filter((l): l is ExampleCountLang =>
          (['ja', 'en', 'ru', 'zh'] as const).includes(l as ExampleCountLang),
        ),
      ]),
    ].filter((l) => l !== 'ja' && l !== 'en');

    let effectiveExTrans = exTrans;
    if (picked.length > 0 && langsToTranslate.length > 0) {
      setAddState((p) => ({ ...p, [i]: 'translating' }));
      const next: Record<string, Partial<Record<TransLang, string>>> = { ...exTrans };
      for (const ex of picked) {
        next[ex.jp] = { en: ex.en, ...(next[ex.jp] ?? {}) };
        for (const tgt of langsToTranslate) {
          if (next[ex.jp][tgt as TransLang]?.trim()) continue;
          try {
            const out = (await translateTo(ex.jp, 'ja', tgt as TransLang)).trim();
            if (out) next[ex.jp] = { ...next[ex.jp], [tgt]: out };
          } catch {
            /* skip */
          }
        }
      }
      effectiveExTrans = next;
    }

    let exampleByLang = buildExampleByLang(
      picked,
      active.anki.exampleCounts,
      manual,
      (ex, code) => {
        if (code === 'ja') return ex.jp;
        if (code === 'en') return ex.en || effectiveExTrans[ex.jp]?.en || '';
        return effectiveExTrans[ex.jp]?.[code as TransLang] ?? '';
      },
    );

    for (const lang of neededExLangs) {
      if (exampleByLang[lang]?.length) continue;
      if (lang === 'ja') {
        exampleByLang = { ...exampleByLang, ja: picked.map((ex) => ex.jp) };
        continue;
      }
      if (lang === 'en') {
        const parts = picked.map((ex) => ex.en || effectiveExTrans[ex.jp]?.en || '').filter((t) => t.trim());
        if (parts.length) exampleByLang = { ...exampleByLang, en: parts };
        continue;
      }
      const parts = picked
        .map((ex) => effectiveExTrans[ex.jp]?.[lang as TransLang] ?? '')
        .filter((t) => t.trim());
      if (parts.length) exampleByLang = { ...exampleByLang, [lang]: parts };
    }

    const missingExLangs = useExampleFallback
      ? []
      : neededExLangs.filter((l) => !exampleByLang[l]?.length);
    if (missingExLangs.length > 0) {
      if (canFallback) {
        useExampleFallback = true;
      } else {
        setAddState((p) => ({ ...p, [i]: 'error' }));
        setAddErr((p) => ({
          ...p,
          [i]: t('dict.results.err.waitTranslate'),
        }));
        return;
      }
    }

    const jaParts = exampleByLang.ja ?? [];
    const exampleSentence = jaParts[0];
    const exampleSentences = jaParts.length > 1 ? jaParts : undefined;

    const refs = hasFieldTemplates(templates)
      ? extractTranslationRefs(
          resolveMiningTemplates(
            templates,
            useExampleFallback,
            active.anki.exampleFallbackTemplates,
          ) ?? templates,
        )
      : [];
    const legacyTarget = nativeLangOf(active);
    const needsLegacy = Boolean(sentence && wantsSentenceTranslation(active) && legacyTarget !== 'ja');
    const needsTranslation =
      wantsBareTranslation(active) && glossFor(entry).trim().length > 0;
    const translationTarget = translationLangOf(active);

    let translations: Record<string, string> | undefined;
    let sentenceTranslation: string | undefined;
    let translation: string | undefined;

    // All entries the popup already fetched — includes every dictionary's entry
    // for this word (JMdict EN, JMdict RU, …), which is the dictionary-first pool.
    const entriesPool = result?.entries?.length ? result.entries : [entry];

    if (refs.length || needsLegacy || needsTranslation) {
      setAddState((p) => ({ ...p, [i]: 'translating' }));
      if (refs.length) {
        translations = {};
        for (const ref of refs) {
          if (ref.base === 'example-sentence' && ref.lang && exampleByLang[ref.lang as ExampleCountLang]) {
            continue;
          }
          const key = `${ref.base}:${ref.lang}`;
          // Dictionary-first: word-level fields pull the gloss in the target
          // language straight from the fetched entries; Qwen only fills gaps.
          if (WORD_LEVEL_BASES.has(ref.base) && ref.lang !== lang) {
            const gloss = glossForLangFromEntries(entriesPool, ref.lang, entry.word);
            if (gloss) {
              translations[key] = ref.base === 'expression' ? firstGlossSegment(gloss) : gloss;
              continue;
            }
          }
          let bs = baseSourceText(ref.base, entry, sentence, exampleSentence, lang);
          if (!bs || !bs.text.trim()) continue;
          if (bs.source === ref.lang) {
            translations[key] = bs.text;
            continue;
          }
          // Qwen fail-switch for word-level slots: an English gloss translates
          // far more reliably than a bare Japanese headword.
          if (WORD_LEVEL_BASES.has(ref.base) && ref.lang !== 'en') {
            const enGloss = glossForLangFromEntries(entriesPool, 'en', entry.word);
            if (enGloss) bs = { text: enGloss, source: 'en' };
          }
          if (ref.base === 'example-sentence' && exampleSentence) {
            const cached = exTrans[exampleSentence]?.[ref.lang as TransLang];
            if (cached?.trim()) {
              translations[key] = cached.trim();
              continue;
            }
          }
          try {
            const out = (await translateTo(bs.text, bs.source, ref.lang as TransLang)).trim();
            if (out) translations[key] = out;
          } catch {
            /* unreachable language pair — leave that field empty */
          }
        }
      }
      if (needsTranslation && translationTarget && translationTarget !== 'ja') {
        // Bare {translation} is dictionary-first too.
        const dictGloss = glossForLangFromEntries(entriesPool, translationTarget, entry.word);
        if (dictGloss) {
          translation = dictGloss;
        } else {
          const source = glossForLangFromEntries(entriesPool, 'en', entry.word) || glossFor(entry);
          try {
            translation = (await translateTo(source, 'en', translationTarget)).trim() || undefined;
          } catch {
            translation = undefined;
          }
        }
      }
      if (needsLegacy && sentence) {
        try {
          sentenceTranslation =
            (await translateTo(sentence, lang, legacyTarget as TransLang)).trim() || undefined;
        } catch {
          sentenceTranslation = undefined;
        }
      }
    }

    setAddState((p) => ({ ...p, [i]: 'adding' }));
    // The profile's field mapping (or auto role mapper) decides where each
    // variable lands; we just supply the raw content for this entry.
    const mined = await mineToStudy({
      ...studyCardFor(entry, sentence),
      anki: {
        route: { source: 'dictionary', cardKind: 'word' },
        term: entry.word,
        reading: entry.reading && entry.reading !== entry.word ? entry.reading : undefined,
        meaning: glossFor(entry) || undefined,
        translation,
        sentence,
        exampleSentence,
        exampleSentences,
        exampleByLang: Object.keys(exampleByLang).length ? exampleByLang : undefined,
        sentenceTranslation,
        translations,
        useExampleFallback: useExampleFallback || undefined,
        fetchAudio: profileWantsAudio(active) || undefined,
      },
    });
    switch (mined.anki) {
      case 'added':
        setAddState((p) => ({ ...p, [i]: 'added' }));
        break;
      case 'duplicate':
        setAddState((p) => ({ ...p, [i]: 'dup' }));
        break;
      case 'queued':
        setAddState((p) => ({ ...p, [i]: 'queued' }));
        break;
      case 'local':
        setAddState((p) => ({ ...p, [i]: 'saved' }));
        break;
      default:
        setAddState((p) => ({ ...p, [i]: 'error' }));
        setAddErr((p) => ({ ...p, [i]: mined.error ?? t('dict.results.err.addFailed') }));
    }
  }

  async function copyDictionaryEntry(entry: DictEntry) {
    const reading = entry.reading && entry.reading !== entry.word ? entry.reading : undefined;
    const meaning = plainMeaning(entry);
    setCopyError(null);
    try {
      await navigator.clipboard.writeText([entry.word, reading, meaning].filter(Boolean).join(' — '));
      recordDictionaryEntry(entry.word, reading, meaning);
    } catch {
      setCopyError(t('dict.results.copyFailed'));
    }
  }

  /**
   * The star is a real deck card now: saving keeps the sentence the word was
   * looked up in (the popup passes it as `context`) and the card is reviewed
   * and scheduled like any other.
   */
  function toggleSave(entry: DictEntry) {
    if (savedSet.has(entry.word)) {
      removeSaved(entry.word);
    } else {
      void mineToStudy(studyCardFor(entry, context?.trim() || undefined));
    }
  }

  async function loadExamples() {
    setExState('loading');
    setExError('');
    setSelectedEx(new Set());
    setExTrans({});
    const fetchLimit = Math.max(exDisplay, maxExampleCountNeeded(active.anki.exampleCounts));
    const r = await window.api.searchExamples(query, fetchLimit);
    if (r.error) {
      setExState('error');
      setExError(r.error);
      return;
    }
    setExamples(r.examples);
    setExState('done');
  }

  function toggleExample(i: number) {
    setSelectedEx((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function setDisplayCount(n: number) {
    const capped = Math.max(1, Math.min(30, n));
    setExDisplay(capped);
    localStorage.setItem(EX_DISPLAY_KEY, String(capped));
  }

  function toggleExLang(code: TransLang) {
    setExLangs((prev) => {
      if (prev.includes(code) && prev.length <= 1) return prev;
      const next = prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code];
      localStorage.setItem(EX_LANG_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function fetchExamplesForMining(
    entry: DictEntry,
    limit: number,
  ): Promise<{ examples: ExampleSentence[]; error?: string }> {
    const candidates = [query, entry.word, entry.reading].filter(
      (v, idx, arr): v is string =>
        typeof v === 'string' && v.trim().length > 0 && arr.indexOf(v) === idx,
    );
    let lastError = '';
    for (const candidate of candidates) {
      const r = await window.api.searchExamples(candidate, limit);
      if (r.examples.length > 0) return { examples: r.examples };
      if (r.error) lastError = r.error;
    }
    return { examples: [], error: lastError };
  }

  const displayCount = Math.min(exDisplay, examples.length);
  const counts = exampleCountsFor(active);
  const maxMineNeeded = Math.max(...Object.values(counts), 1);
  const translateLimit = Math.max(displayCount, maxMineNeeded);

  // Seed Tatoeba English + translate into each toggled language (Qwen3).
  useEffect(() => {
    if (exState !== 'done' || examples.length === 0) return;
    let alive = true;
    const qwenLangs = exLangs.filter((l) => l !== 'ja' && l !== 'en');

    const seedEnglish = (): Record<string, Partial<Record<TransLang, string>>> => {
      const seeded: Record<string, Partial<Record<TransLang, string>>> = {};
      for (const ex of examples.slice(0, translateLimit)) {
        seeded[ex.jp] = { en: ex.en, ...(exTrans[ex.jp] ?? {}) };
      }
      return seeded;
    };

    if (qwenLangs.length === 0) {
      setExTrans(seedEnglish());
      setExTransLoading(false);
      return;
    }

    // Subscribed through the preload binding rather than through `translator.ts`'s
    // `onModelProgress`, which holds ONE global callback: registering there would silently take
    // the Translate view's or a reader's progress away. This one unsubscribes.
    const offModel = window.api.onTranslateModelProgress((p) => {
      if (!alive) return;
      if (p.status === 'ready') setExModelPct(null);
      else setExModelPct(typeof p.progress === 'number' ? Math.round(p.progress) : 0);
    });

    (async () => {
      setExTransLoading(true);
      const next = seedEnglish();
      for (const ex of examples.slice(0, translateLimit)) {
        if (!alive) return;
        for (const tgt of qwenLangs) {
          if (next[ex.jp][tgt]?.trim()) continue;
          try {
            const out = (await translateTo(ex.jp, 'ja', tgt)).trim();
            if (out) next[ex.jp] = { ...next[ex.jp], [tgt]: out };
          } catch {
            /* skip failed pair */
          }
        }
      }
      if (alive) {
        setExTrans(next);
        setExTransLoading(false);
        setExModelPct(null);
      }
    })();

    return () => {
      alive = false;
      offModel?.();
      setExModelPct(null);
    };
    // NOTE: no eslint-disable here. `react-hooks/exhaustive-deps` is not loaded
    // in this config, so a disable comment for it is itself an eslint error
    // ("Definition for rule ... was not found") — the same dead-directive case
    // removed from MediaContent for `jsx-a11y/media-has-caption`. The dep list
    // below is intentionally narrow: `translate` and the setters are stable.
  }, [examples, exLangs, exState, translateLimit]);

  function exTranslation(ex: ExampleSentence, code: TransLang): string {
    if (code === 'ja') return ex.jp;
    if (code === 'en') return ex.en || exTrans[ex.jp]?.en || '';
    return exTrans[ex.jp]?.[code] ?? '';
  }

  function addLabel(i: number): ReactNode {
    switch (addState[i]) {
      case 'added':
        return (
          <>
            {t('dict.results.added')}
            <Icon name="check" size={12} style={{ marginLeft: 4, verticalAlign: '-1px' }} />
          </>
        );
      case 'dup':
        return t('dict.results.alreadyInAnki');
      case 'saved':
        return t('dict.results.savedToDeck');
      case 'queued':
        return t('dict.results.savedAnkiLater');
      case 'translating':
        return t('dict.results.translating');
      case 'adding':
        return t('dict.results.adding');
      case 'error':
        return t('dict.results.retryAdd');
      default:
        return t('dict.results.add');
    }
  }

  const entries = result?.entries ?? [];

  /**
   * Grading is offered only when the dictionary being read is the language the
   * knowledge store is currently keyed to. `jp-word-knowledge-*` is per study
   * language, and this component is also rendered with a fixed `lang="ja"` from
   * Blanc, so a Chinese headword graded while the study language is Japanese
   * would land in the Japanese store. Hiding the control loses a feature for
   * that combination; showing it would quietly corrupt the other language's
   * vocabulary. The popup variant is excluded for a different reason: it and
   * the Lens reader carry their own four-button grade control for the token
   * that was clicked, and two controls for one word is worse than one.
   */
  const gradable = variant !== 'popup' && lang === studyLang;

  /**
   * This hook and the two consts above it must stay ABOVE the `showSetup` early
   * return. `ensureAnki` sets `showSetup` whenever `ankiStatus()` comes back
   * disconnected, so the very first render after Anki becomes unreachable took
   * the early return and ran one hook fewer than the render before it. React
   * raised "Rendered fewer hooks than expected" inside `<DictionaryResults>`,
   * `AppErrorBoundary` caught it and recreated the tree from scratch, and every
   * floating window on the desk disappeared — measured live against a refused
   * AnkiConnect port, one click on "+ Add to Anki".
   */
  const knowledge = useMemo(() => {
    const levels = new Map<string, WkLevel>();
    if (gradable) for (const entry of entries) levels.set(entry.word, getLevel(entry.word));
    return levels;
    // `knowledgeTick` is the subscription, not a value: it is what re-reads the
    // store after somebody else writes to it.
  }, [entries, gradable, knowledgeTick]);

  /**
   * Every variant gets the way back, not only the popup.
   *
   * This panel replaces the whole result list, and on the page variant its only control used to
   * be Retry — which calls `ensureAnki` again and, against a refused port, sets `showSetup`
   * straight back. Measured live at a refused `127.0.0.1:8765`, one click on "+ Add to Anki":
   * `backButtonPresent: false`, and after Retry `stillSetup: true, entries: 0`. The results were
   * never unrecoverable, because the query effect above clears `showSetup`, but getting them back
   * meant re-running the lookup against a 697k-row database and losing what was already on screen.
   */
  if (showSetup) {
    return (
      <div className={`dict-results ${variant}`}>
        <AnkiSetup
          status={anki}
          waitingCollection={ankiLink?.waitingCollection}
          onBack={() => setShowSetup(false)}
          onRetry={async () => {
            setShowSetup(false);
            await ensureAnki();
          }}
        />
      </div>
    );
  }

  return (
    <div className={`dict-results ${variant}`}>
      {copyError && <div role="alert" className="dict-empty">{copyError}</div>}
      {query.trim() && !result && <div className="dict-loading">{t('dict.results.lookingUp')}</div>}
      {result?.error && <div className="dict-empty">{result.error}</div>}
      {result && !result.error && entries.length === 0 && (
        <div className="dict-empty">{t('dict.results.noMatch', { query })}</div>
      )}

      {result?.approximate && entries.length > 0 && (
        <div className="dict-deinflection">
          <span className="dict-deinflection-forms">{t('dict.results.approximate', { query })}</span>
        </div>
      )}

      {result?.deinflection && (
        <div className="dict-deinflection">
          <span className="dict-deinflection-forms" lang="ja">
            {t('deinflect.matched', {
              source: result.deinflection.source,
              term: result.deinflection.term,
            })}
          </span>
          <span className="dict-deinflection-reasons">
            {result.deinflection.reasons.map((r) => reasonLabel(r, t)).join(' · ')}
          </span>
        </div>
      )}

      {result?.character && <CharacterMetadataPanel character={result.character} entries={entries} />}
      {result && !result.character && isGroundableCharacter(result.query ?? '') && (
        <CharacterMetadataUnavailable char={result.query} />
      )}

      <div className="dict-entries">
        {entries.map((entry, i) => {
          const saved = savedSet.has(entry.word);
          return (
            <div className="dict-entry" key={i}>
              <div className="dict-entry-head">
                <span className="dict-word" lang={lang}>
                  {entry.word}
                </span>
                {entry.reading && entry.reading !== entry.word && (
                  <span className="dict-reading" lang={lang}>
                    {entry.reading}
                  </span>
                )}
                {/* Beside the reading rather than in a panel of its own: a
                    pronunciation belongs to this entry's word, and the result
                    list shows several. Renders nothing for a language with no
                    provider, and fetches nothing until it is clicked. */}
                <WordAudio lang={lang} reading={entry.reading} word={entry.word} />
                {entry.isCommon && (
                  <span className="dict-badge common">{t('dict.results.common')}</span>
                )}
                {entry.jlpt[0] && <span className="dict-badge jlpt">{entry.jlpt[0]}</span>}
                {entry.frequency != null && (
                  <span
                    className="dict-badge freq"
                    title={
                      entry.frequencySource
                        ? t('dict.results.freqTitleSourced', { source: entry.frequencySource })
                        : t('dict.results.freqTitle')
                    }
                  >
                    #{entry.frequency}
                    {entry.frequencySource && (
                      <span className="dict-freq-source">{entry.frequencySource}</span>
                    )}
                  </span>
                )}
                <button
                  className="dict-star lq-hit"
                  title={t('dict.results.copyClipboard')}
                  onClick={() => copyDictionaryEntry(entry)}
                >
                  <Icon name="clipboard" size={14} />
                </button>
                {/* A toggle, so it says so: the `on` class, the filled star and
                    the swapped title are all sighted-only signals, and a title
                    that changes in place is not announced. */}
                <button
                  className={`dict-star lq-hit ${saved ? 'on' : ''}`}
                  aria-pressed={saved}
                  title={saved ? t('dict.results.savedFlashcards') : t('dict.results.saveFlashcards')}
                  onClick={() => toggleSave(entry)}
                >
                  <Icon name="star" size={14} fill={saved} />
                </button>
                {gradable && (
                  <WordKnowledge
                    word={entry.word}
                    level={knowledge.get(entry.word) ?? 0}
                    onCycle={cycleLevel}
                  />
                )}
              </div>
              {entry.pitchHtml && (
                <div className="dict-pitch" lang="ja">
                  <span className="dict-pitch-label">{t('dict.results.pitch')}</span>
                  <span
                    className="dict-pitch-pattern"
                    dangerouslySetInnerHTML={{ __html: entry.pitchHtml }}
                  />
                </div>
              )}
              {entry.ipa && entry.ipa.length > 0 && (
                <div className="dict-pitch dict-ipa">
                  <span className="dict-pitch-label">{t('dict.results.ipa')}</span>
                  <span className="dict-ipa-text">{entry.ipa.join(' / ')}</span>
                </div>
              )}
              {entry.glossaryHtml ? (
                <>
                  {/* A structured glossary arrives as one HTML block with no
                      sense boundaries left in it, so the labels collapse to the
                      entry and sit above the block rather than inside it. */}
                  <UsageLabels tags={entryUsageTags(entry)} />
                  <div
                    className="dict-glossary-html"
                    lang={lang}
                    dangerouslySetInnerHTML={{ __html: entry.glossaryHtml }}
                  />
                </>
              ) : (
                <ol className="dict-senses">
                  {entry.senses.slice(0, 6).map((s, j) => (
                    <li key={j}>
                      {s.partsOfSpeech.length > 0 && (
                        <span className="dict-pos">{s.partsOfSpeech.join(', ')}</span>
                      )}
                      <UsageLabels tags={s.tags} />
                      {s.definitions.join('; ')}
                    </li>
                  ))}
                </ol>
              )}
              {entry.source && <div className="dict-source muted">{entry.source}</div>}
              <button
                className={`dict-add lq-hit ${addState[i] === 'added' || addState[i] === 'dup' || addState[i] === 'queued' || addState[i] === 'saved' ? 'done' : ''}`}
                disabled={addState[i] === 'adding' || addState[i] === 'translating'}
                onClick={() => addToAnki(entry, i)}
              >
                {addLabel(i)}
              </button>
              {addState[i] === 'error' && addErr[i] && (
                <div className="dict-add-err">{addErr[i]}</div>
              )}
              {addState[i] === 'saved' && (
                <div className="dict-add-note muted">
                  {t('dict.results.savedNoAnki')}{' '}
                  <button type="button" onClick={() => setShowSetup(true)}>
                    {t('dict.results.setUpAnki')}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/*
        A page of results has to say it is a page.

        The database read is capped, and until this row existed the cap was
        invisible: eight entries rendered identically whether eight was the whole
        answer or the first eight of hundreds, and nothing on the surface could
        reach the ninth. `truncated` is set by the lookup itself — never inferred
        from `entries.length === limit`, which is equally true of a result that
        is exactly complete — so this row appears only when a further match
        provably exists. No total is claimed, because the probes behind the
        lookup are themselves capped and any number here would be a floor
        presented as a count.
      */}
      {result?.truncated && entries.length > 0 && (
        <div className="dict-truncated">
          <span className="muted">
            {limit >= DICT_LOOKUP_MAX_LIMIT
              ? t('dict.results.truncatedMax', { count: entries.length })
              : t('dict.results.truncated', { count: entries.length })}
          </span>
          {limit < DICT_LOOKUP_MAX_LIMIT && (
            <button
              className="dict-more-btn lq-hit"
              onClick={() => setPage({ key: pageKey, limit: nextLookupLimit(limit) })}
            >
              {t('dict.results.showMore')}
            </button>
          )}
        </div>
      )}

      {/* First of the unasked panels because it is the shortest fact about the
          word and the one that changes how the rest is read. One indexed probe,
          and absent entirely on an install with no frequency corpus — which is
          every default install. */}
      {variant !== 'popup' && entries.length > 0 && (
        <WordFrequency query={entries[0].word} lang={lang} />
      )}

      {/* Anchored on the matched headword rather than the raw query, so an
          inflected search still expands the word it actually found. The popup
          stays out of it: it is a glance surface, not a place to widen a
          lookup. */}
      {variant !== 'popup' && entries.length > 0 && (
        <ConjugationTable query={entries[0].word} lang={lang} />
      )}

      {/* Above the opt-in expansions rather than beside them: this one costs two
          indexed probes, runs unasked, and renders nothing when the installed
          dictionaries carry no origin for the word — so it never occupies space
          it cannot fill. */}
      {variant !== 'popup' && entries.length > 0 && (
        <LexiconEtymology query={entries[0].word} lang={lang} />
      )}

      {/* Beside the etymology and above the opt-in expansions, for the same
          reason: indexed probes only, and absent entirely when the installed
          dictionaries state no relation for the word. */}
      {variant !== 'popup' && entries.length > 0 && (
        <LexiconXrefs query={entries[0].word} lang={lang} onLookup={onLookup} />
      )}

      {variant !== 'popup' && entries.length > 0 && (
        <LexiconCompounds query={entries[0].word} lang={lang} onLookup={onLookup} />
      )}

      {/* Directly below the compounds, because the two answer neighbouring
          questions about the same scan — what this word is written inside, and
          what it is used with. */}
      {variant !== 'popup' && entries.length > 0 && (
        <LexiconCollocations query={entries[0].word} lang={lang} onLookup={onLookup} />
      )}

      {variant !== 'popup' && entries.length > 0 && (
        <LexiconExamples query={entries[0].word} lang={lang} />
      )}

      {variant !== 'popup' && entries.length > 0 && (
        <SemanticNeighbors query={entries[0].word} lang={lang} onLookup={onLookup} />
      )}

      {/* Below every dictionary-sourced expansion, because this is the only one
          on the page a model wrote. It is grounded on the same matched headword
          and on the glosses rendered above, so the model explains the entry the
          reader is looking at rather than its own guess at the word. */}
      {variant !== 'popup' && entries.length > 0 && (
        <EntryExplain
          word={entries[0].word}
          reading={entries[0].reading ?? ''}
          lang={lang}
          senses={entries[0].senses ?? []}
        />
      )}

      {/* Anchored on the same matched headword as the expansions above, so a note
          written after an inflected search belongs to the dictionary form rather
          than to the form that happened to be typed. */}
      {variant !== 'popup' && entries.length > 0 && (
        <EntryNote word={entries[0].word} reading={entries[0].reading ?? ''} lang={lang} />
      )}

      {lang === 'ja' && entries.length > 0 && (
        <div className="dict-examples">
          {exState === 'idle' && (
            <button className="dict-ex-btn lq-hit" onClick={loadExamples}>
              {t('dict.results.examples')}
            </button>
          )}
          {exState === 'loading' && (
            <div className="dict-ex-status muted">{t('dict.results.searchingTatoeba')}</div>
          )}
          {exState === 'error' && <div className="dict-ex-status muted">{exError}</div>}
          {exState === 'done' && examples.length === 0 && (
            <div className="dict-ex-status muted">{t('dict.results.noExamples')}</div>
          )}
          {exState === 'done' && examples.length > 0 && (
            <>
              <div className="dict-ex-head">
                <span className="dict-ex-title">{t('dict.results.examples')}</span>
                <label className="dict-ex-show">
                  {t('dict.results.show')}
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={exDisplay}
                    onChange={(e) => setDisplayCount(parseInt(e.target.value, 10) || 6)}
                  />
                </label>
                <div className="dict-ex-langs">
                  {EX_LANGS.map(({ code, label }) => (
                    <button
                      key={code}
                      type="button"
                      // Register row D6: a multi-select filter set, so the
                      // switched-on ones must announce as pressed rather than
                      // relying on the `active` class, which is only paint.
                      aria-pressed={exLangs.includes(code)}
                      className={`gram-level-btn ${exLangs.includes(code) ? 'active' : ''}`}
                      onClick={() => toggleExLang(code)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {exTransLoading && (
                <div className="dict-ex-status muted">
                  {exModelPct === null
                    ? t('dict.results.translatingExamples')
                    : t('dict.results.loadingModelPct', { pct: exModelPct })}
                </div>
              )}
              <p className="dict-ex-hint muted">{t('dict.results.exHint')}</p>
              <ul className="dict-ex-list">
                {examples.slice(0, displayCount).map((ex, i) => (
                  <li
                    key={i}
                    className={selectedEx.has(i) ? 'selected' : ''}
                    onClick={() => toggleExample(i)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleExample(i);
                      }
                    }}
                  >
                    <span className="dict-ex-jp" lang="ja">
                      {ex.jp}
                    </span>
                    {exLangs
                      .filter((code) => code !== 'ja')
                      .map((code) => {
                        const text = exTranslation(ex, code);
                        if (!text && !exTransLoading) return null;
                        const meta = EX_LANGS.find((l) => l.code === code);
                        return (
                          <span key={code} className="dict-ex-tr" lang={code}>
                            <span className="dict-ex-tr-label">{meta?.label ?? code}</span>
                            {text || (exTransLoading ? '…' : '')}
                          </span>
                        );
                      })}
                  </li>
                ))}
              </ul>
              {/*
                These are real Tatoeba sentences, and they get mined onto Anki
                cards from this very panel — so the attribution obligation
                follows them here exactly as it does in Grammar, which renders
                the same credit for the same corpus
                (`grammar/GrammarContent.tsx:147-154`). Audit F6. The browser
                extension's Examples tab consumed the same corpus uncredited and
                was fixed alongside this (`extension/content.js`).
              */}
              <p className="dict-ex-credit muted">
                <a href="https://tatoeba.org" target="_blank" rel="noreferrer">
                  {t('grammar.examples.tatoebaCredit')}
                </a>
              </p>
            </>
          )}
        </div>
      )}

      {anki?.connected && entries.length > 0 && (
        <div className={`dict-anki-cfg ${variant === 'popup' ? 'compact' : ''}`}>
          <Icon name="anki" size={12} className="dict-anki-icon" />
          <span className="dict-mine-target">
            <b>{active.label}</b>
            {variant !== 'popup' && (
              <span className="muted">
                {' '}
                · {active.anki.deckName} / {active.anki.modelName}
              </span>
            )}
          </span>
          {variant !== 'popup' &&
            (selectedEx.size > 0 ? (
              <span className="dict-ex-selected muted">
                {t('dict.results.selectedManual', { count: selectedEx.size })}
              </span>
            ) : (
              <span className="dict-ex-selected muted">
                {t('dict.results.autoExamples', {
                  ja: counts.ja,
                  en: counts.en,
                  ru: counts.ru,
                  zh: counts.zh,
                })}
              </span>
            ))}
          {variant === 'popup' && (
            <div className="dict-anki-tip">
              <div className="dict-anki-tip-row">
                <span className="muted">{t('dict.results.label.language')}</span>
                <b>{lang.toUpperCase()}</b>
              </div>
              <div className="dict-anki-tip-row">
                <span className="muted">{t('dict.results.label.profile')}</span>
                <b>{active.label}</b>
              </div>
              <div className="dict-anki-tip-row">
                <span className="muted">{t('dict.results.label.deck')}</span>
                <b>{active.anki.deckName}</b>
              </div>
              <div className="dict-anki-tip-row">
                <span className="muted">{t('dict.results.label.noteType')}</span>
                <b>{active.anki.modelName}</b>
              </div>
              <div className="dict-anki-tip-row">
                <span className="muted">{t('dict.results.label.examples')}</span>
                <b>
                  {selectedEx.size > 0
                    ? t('dict.results.selectedManualShort', { count: selectedEx.size })
                    : t('dict.results.autoExamplesShort', {
                        ja: counts.ja,
                        en: counts.en,
                        ru: counts.ru,
                        zh: counts.zh,
                      })}
                </b>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
