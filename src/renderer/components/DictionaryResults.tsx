import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { addSaved, loadSaved, onSavedChanged, removeSaved } from '../savedWords';
import { getActiveProfile, onProfileChanged } from '../profileState';
import { translateTo, type TransLang } from '../translator';
// Imported from their defining modules rather than the `shared/mining` barrel.
// That barrel re-exports `aiMiningCatalog` (41 KB of AI prompt presets), and
// DictionaryResults is in Blanc's boot path — going through the barrel dragged
// the whole catalog into the entry chunk. Same reason StatsContent imports
// `confirmDialog` from `ui/dialogService` instead of the `ui` barrel.
import { firstGlossSegment } from '../../shared/epubEnrichment';
import { glossForLangFromEntries } from '../../shared/fieldRouter';
import { isGroundableCharacter } from '../../shared/langs';
import { recordDictionaryEntry } from '../clipboardHistory';
import { recordLookup } from '../lookupHistory';
import { useT } from '../i18n';
import CharacterMetadataPanel from './lexicon/CharacterMetadataPanel';
import CharacterMetadataUnavailable from './lexicon/CharacterMetadataUnavailable';
import SemanticNeighbors from './lexicon/SemanticNeighbors';

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

function loadExLangs(): TransLang[] {
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
  return ['en', 'ru'];
}

interface Props {
  query: string;
  variant?: 'popup' | 'page';
  /** Sentence the word came from — attached to Anki cards for mining. */
  context?: string;
  /** Which dictionary to use: Japanese (Jisho) or Chinese (CC-CEDICT). */
  lang?: DictLang;
}

type AddState = 'idle' | 'translating' | 'adding' | 'added' | 'dup' | 'error';
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

export default function DictionaryResults({ query, variant = 'popup', lang = 'ja', context }: Props) {
  const { t } = useT();
  const [result, setResult] = useState<DictResult | null>(null);
  const [anki, setAnki] = useState<AnkiStatus | null>(null);
  const [ankiLink, setAnkiLink] = useState<AnkiLinkStatus | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [active, setActive] = useState<StudyProfile>(getActiveProfile);
  const [addState, setAddState] = useState<Record<number, AddState>>({});
  const [addErr, setAddErr] = useState<Record<number, string>>({});
  const [savedSet, setSavedSet] = useState<Set<string>>(() => new Set(loadSaved().map((w) => w.word)));
  const [exState, setExState] = useState<ExState>('idle');
  const [examples, setExamples] = useState<ExampleSentence[]>([]);
  const [exError, setExError] = useState('');
  const [selectedEx, setSelectedEx] = useState<Set<number>>(() => new Set());
  const [exDisplay, setExDisplay] = useState(loadExDisplay);
  const [exLangs, setExLangs] = useState<TransLang[]>(loadExLangs);
  const [exTrans, setExTrans] = useState<Record<string, Partial<Record<TransLang, string>>>>({});
  const [exTransLoading, setExTransLoading] = useState(false);
  const recordedLookupRef = useRef('');

  // (Re)look up whenever the query changes.
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
      lang === 'zh' ? window.api.lookupChinese(query) : window.api.lookupTerm(query);
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
  }, [query, lang]);

  // Keep the star state in sync with saves from other views.
  useEffect(() => onSavedChanged(() => setSavedSet(new Set(loadSaved().map((w) => w.word)))), []);

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

  async function addToAnki(entry: DictEntry, i: number) {
    const s = await ensureAnki();
    if (!s) return;
    const sentence = context?.trim() || undefined;
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
    const res = await window.api.ankiMineNote({
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
    });
    if (res.ok) {
      setAddState((p) => ({ ...p, [i]: 'added' }));
    } else if (res.error === 'duplicate') {
      setAddState((p) => ({ ...p, [i]: 'dup' }));
    } else {
      setAddState((p) => ({ ...p, [i]: 'error' }));
      setAddErr((p) => ({ ...p, [i]: res.error ?? t('dict.results.err.addFailed') }));
    }
  }

  function copyDictionaryEntry(entry: DictEntry) {
    const reading = entry.reading && entry.reading !== entry.word ? entry.reading : undefined;
    const meaning = plainMeaning(entry);
    const rec = recordDictionaryEntry(entry.word, reading, meaning);
    if (rec) void navigator.clipboard.writeText(rec.text);
  }

  function toggleSave(entry: DictEntry) {
    if (savedSet.has(entry.word)) {
      removeSaved(entry.word);
    } else {
      addSaved({
        word: entry.word,
        reading: entry.reading,
        meaning: plainMeaning(entry),
        addedAt: Date.now(),
      });
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
      }
    })();

    return () => {
      alive = false;
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

  if (showSetup) {
    return (
      <div className={`dict-results ${variant}`}>
        <AnkiSetup
          status={anki}
          waitingCollection={ankiLink?.waitingCollection}
          onBack={variant === 'popup' ? () => setShowSetup(false) : undefined}
          onRetry={async () => {
            setShowSetup(false);
            await ensureAnki();
          }}
        />
      </div>
    );
  }

  const entries = result?.entries ?? [];

  return (
    <div className={`dict-results ${variant}`}>
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
                {entry.isCommon && (
                  <span className="dict-badge common">{t('dict.results.common')}</span>
                )}
                {entry.jlpt[0] && <span className="dict-badge jlpt">{entry.jlpt[0]}</span>}
                {entry.frequency != null && (
                  <span className="dict-badge freq" title={t('dict.results.freqTitle')}>
                    #{entry.frequency}
                  </span>
                )}
                <button
                  className="dict-star"
                  title={t('dict.results.copyClipboard')}
                  onClick={() => copyDictionaryEntry(entry)}
                >
                  <Icon name="clipboard" size={14} />
                </button>
                <button
                  className={`dict-star ${saved ? 'on' : ''}`}
                  title={saved ? t('dict.results.savedFlashcards') : t('dict.results.saveFlashcards')}
                  onClick={() => toggleSave(entry)}
                >
                  <Icon name="star" size={14} fill={saved} />
                </button>
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
              {entry.glossaryHtml ? (
                <div
                  className="dict-glossary-html"
                  lang={lang}
                  dangerouslySetInnerHTML={{ __html: entry.glossaryHtml }}
                />
              ) : (
                <ol className="dict-senses">
                  {entry.senses.slice(0, 6).map((s, j) => (
                    <li key={j}>
                      {s.partsOfSpeech.length > 0 && (
                        <span className="dict-pos">{s.partsOfSpeech.join(', ')}</span>
                      )}
                      {s.definitions.join('; ')}
                    </li>
                  ))}
                </ol>
              )}
              {entry.source && <div className="dict-source muted">{entry.source}</div>}
              <button
                className={`dict-add ${addState[i] === 'added' || addState[i] === 'dup' ? 'done' : ''}`}
                disabled={addState[i] === 'adding' || addState[i] === 'translating'}
                onClick={() => addToAnki(entry, i)}
              >
                {addLabel(i)}
              </button>
              {addState[i] === 'error' && addErr[i] && (
                <div className="dict-add-err">{addErr[i]}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Anchored on the matched headword rather than the raw query, so an
          inflected search still expands the word it actually found. The popup
          stays out of it: it is a glance surface, not a place to widen a
          lookup. */}
      {variant !== 'popup' && entries.length > 0 && (
        <SemanticNeighbors query={entries[0].word} lang={lang} />
      )}

      {lang === 'ja' && entries.length > 0 && (
        <div className="dict-examples">
          {exState === 'idle' && (
            <button className="dict-ex-btn" onClick={loadExamples}>
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
                      className={`gram-level-btn ${exLangs.includes(code) ? 'active' : ''}`}
                      onClick={() => toggleExLang(code)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {exTransLoading && (
                <div className="dict-ex-status muted">{t('dict.results.translatingExamples')}</div>
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
