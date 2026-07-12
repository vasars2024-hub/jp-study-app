// Anki connector wire types and canonical constants (SERVICES_PATCH.md 5.1).
// Shared verbatim by main and renderer. No Electron imports allowed here.

import type { CardContent, FieldRole, ProfileId } from './profiles';

/** Byte-exact UI copy required on connection failure. Single source of truth. */
export const ANKI_UNREACHABLE_MSG =
  "Can't reach Anki. Open Anki desktop and make sure the AnkiConnect add-on is installed.";

/** AnkiConnect is up but Anki's collection failed to open or is still loading. */
export const ANKI_COLLECTION_UNAVAILABLE_MSG =
  'Anki is open but the collection is not loaded yet. The app will retry automatically every few seconds. If this persists, close every Anki window (check Task Manager), reopen Anki, and wait until your decks appear.';

export const APP_TAG = 'jp-study-app';
export const KINOMOTO_MODEL_NAME = 'jidoujisho Kinomoto';

// ----- Connection (heartbeat) ---------------------------------------------

export type AnkiLinkState = 'checking' | 'connected' | 'disconnected';

export interface AnkiLinkStatus {
  state: AnkiLinkState;
  /** Human-readable detail when disconnected or waiting on the collection. */
  error?: string;
  /** True when AnkiConnect responds but deck/collection APIs are not ready. */
  waitingCollection?: boolean;
  /** AnkiConnect API version from the last successful probe. */
  apiVersion?: number;
  lastOkAt?: number; // epoch ms
  lastProbeAt?: number; // epoch ms
  consecutiveFailures: number;
}

// ----- Mining (profile-aware note creation) --------------------------------

export interface MineNoteRequest {
  /** Defaults to the active profile. */
  profileId?: ProfileId;
  term: string;
  reading?: string;
  /** English gloss (P1 back, P2 front). */
  meaning?: string;
  /** Front-language translation for translation-front profiles (P3: Russian). */
  translation?: string;
  /** Mining context sentence (reader / subtitle line). */
  sentence?: string;
  /**
   * The exact surface text as it appears in `sentence` (e.g. the reader
   * selection 食べた for the dictionary form 食べる). Used to locate the word
   * for cloze splitting; falls back to term/reading when absent.
   */
  surface?: string;
  /** Translation of the context sentence (fills {sentence-translation}). */
  sentenceTranslation?: string;
  /** Tatoeba example sentence selected in the dictionary (fills {example-sentence}). */
  exampleSentence?: string;
  /** Multiple Tatoeba examples (fills {example-sentence} with joined text). */
  exampleSentences?: string[];
  /**
   * Per-language example texts for `{example-sentence:lang}` (joined with blank
   * lines at mine time). Keys: ja | zh | en | ru.
   */
  exampleByLang?: Partial<Record<'ja' | 'zh' | 'en' | 'ru', string[]>>;
  /**
   * Pre-computed translated values for {base:lang} template variables, keyed
   * "base:lang" (e.g. { 'sentence:ru': '…', 'expression:ru': '…' }). Filled by
   * the renderer because the offline translator runs renderer-side.
   */
  translations?: Record<string, string>;
  /** Use expression fallback templates — examples were unavailable. */
  useExampleFallback?: boolean;
  /** Grab the current clipboard image into the {image} variable (Phase C). */
  captureClipboardImage?: boolean;
  /** Prebuilt image markup supplied by the mining engine or AI enrichers. */
  imageHtml?: string;
  /** When set, writes these literal front/back values into the model's first two fields. */
  prebuiltCard?: { front: string; back: string };
  /** Fetch native-speaker audio into the {audio} variable (Phase D). */
  fetchAudio?: boolean;
  /** Named frequency ranks for tokens like {frequency:BCCWJ}. */
  frequencies?: Record<string, string | number>;
  extraTags?: string[];
}

export interface MineNoteResult {
  ok: boolean;
  noteId?: number;
  /** 'duplicate' | ANKI_UNREACHABLE_MSG | verbatim AnkiConnect API error. */
  error?: string;
}

// ----- Note-type integration ------------------------------------------------

export interface EnsureModelResult {
  ok: boolean;
  modelName: string;
  /** True when this call created the model inside the user's collection. */
  created: boolean;
  /** Resolved role map actually in force (after the 5.4 algorithm). */
  fieldMap: Partial<Record<FieldRole, string>>;
  /** Roles the blueprint needs that no field could satisfy. */
  unmappedRoles: FieldRole[];
  error?: string;
}

// ----- Interval reading -------------------------------------------------------

export interface IntervalEntry {
  /** Cleaned expression from the note's term field (HTML/furigana stripped). */
  expression: string;
  /** Longest interval across the note's cards, in days. */
  ivlDays: number;
  noteId: number;
  modelName: string;
}

export interface IntervalSnapshot {
  generatedAt: number; // epoch ms
  sourceQueries: string[]; // deduped union of profile syncQueries
  entries: IntervalEntry[];
  noteCount: number; // notes scanned before filtering
  truncated: boolean; // true if the 100k safety cap was hit
}

/** Binary rollup consumed by reader-facing features ("known" vs "new"). */
export type KnownCategory = 'known' | 'new';

/**
 * WkLevel derivation from ivlDays using per-profile DeckParams.thresholds.
 * Replicates src/renderer/ankiSync.ts levelForInterval() with the seed
 * thresholds { familiar: 1, known: 21 }.
 */
export function levelForIntervalDays(
  ivlDays: number,
  thresholds: { familiar: number; known: number },
): 1 | 2 | 3 {
  if (ivlDays >= thresholds.known) return 3;
  if (ivlDays >= thresholds.familiar) return 2;
  return 1;
}

/** Rollup rule: WkLevel >= 3 -> 'known'; WkLevel 0..2 -> 'new'. */
export function knownCategoryForLevel(wkLevel: number): KnownCategory {
  return wkLevel >= 3 ? 'known' : 'new';
}

// ----- Jidoujisho-style field templates ------------------------------------
//
// A "field template" is the Yomitan/jidoujisho mining model: for each field of
// the chosen note type the user writes a small template string that may embed
// {placeholders}. At mine time each placeholder is replaced with the matching
// value from the word being mined (the term, its reading, the meaning, the
// context sentence, ...). Literal text and HTML in the template pass through
// untouched, so `<b>{expression}</b>【{reading}】` is a valid field template.
//
// This coexists with the automatic role mapper (fieldMapper.ts): a profile
// with no templates keeps today's auto behaviour; once any field carries a
// non-empty template, mining fills fields from the templates instead (5.6).

/** A placeholder the user can drop into a field template. */
export interface MiningVar {
  /** The token written between braces, e.g. `expression` in `{expression}`. */
  key: string;
  /** Human label shown on the palette chip in the mapping UI. */
  label: string;
  /** One-line description of what the variable resolves to. */
  hint: string;
  /** Which source content this variable pulls from (informational). */
  content: CardContent | 'audio' | 'sentenceTranslation' | 'frequency' | 'image';
}

/**
 * The variables offered in the mapping UI, in palette order. `expression` is
 * the jidoujisho/Yomitan name for the headword; it maps to the internal
 * `term` content slot (MineNoteRequest.term).
 */
export const MINING_VARS: readonly MiningVar[] = [
  { key: 'expression', label: 'Expression', hint: 'The word / headword — e.g. 勉強', content: 'term' },
  { key: 'reading', label: 'Reading', hint: 'Kana reading — e.g. べんきょう', content: 'reading' },
  { key: 'meaning', label: 'Meaning', hint: 'Definition / English gloss', content: 'meaning' },
  { key: 'translation', label: 'Translation', hint: 'Front-language translation (e.g. Russian)', content: 'translation' },
  { key: 'sentence', label: 'Sentence', hint: 'The context sentence the word came from', content: 'sentence' },
  { key: 'example-sentence', label: 'Example sentence', hint: 'A Tatoeba example you selected in the dictionary', content: 'sentence' },
  {
    key: 'example-pairs',
    label: 'Example pairs',
    hint: 'Interleaved examples — e.g. RU sentence 1 then JA sentence 1, then pair 2…',
    content: 'sentence',
  },
  { key: 'sentence-translation', label: 'Sentence translation', hint: 'The context sentence translated to your other language', content: 'sentenceTranslation' },
  { key: 'cloze-before', label: 'Cloze before', hint: 'Sentence text before the word', content: 'sentence' },
  { key: 'cloze-inside', label: 'Cloze word', hint: 'The word itself, as it appears in the sentence', content: 'sentence' },
  { key: 'cloze-after', label: 'Cloze after', hint: 'Sentence text after the word', content: 'sentence' },
  { key: 'pitch', label: 'Pitch accent', hint: 'Pitch-accent pattern (from an imported/bundled dictionary)', content: 'reading' },
  { key: 'frequency', label: 'Frequency', hint: 'Frequency rank (from an imported/bundled dictionary)', content: 'frequency' },
  { key: 'audio', label: 'Audio', hint: 'Native-speaker audio [sound:…]', content: 'audio' },
  { key: 'image', label: 'Image', hint: 'Image grabbed from your clipboard', content: 'image' },
];

/** Languages with configurable `{example-sentence:lang}` counts when mining. */
export type ExampleCountLang = 'ja' | 'zh' | 'en' | 'ru';

export const EXAMPLE_COUNT_LANGS: readonly { code: ExampleCountLang; label: string }[] = [
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
];

export const DEFAULT_EXAMPLE_COUNT = 1;
export const MAX_EXAMPLE_COUNT = 10;

export function resolveExampleCount(
  counts: Partial<Record<ExampleCountLang, number>> | undefined,
  lang: ExampleCountLang,
): number {
  const n = counts?.[lang];
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_EXAMPLE_COUNT;
  return Math.max(0, Math.min(MAX_EXAMPLE_COUNT, Math.round(n)));
}

/** Max examples to fetch/show — driven by the largest auto-pick count. */
export function maxExampleCountNeeded(
  counts: Partial<Record<ExampleCountLang, number>> | undefined,
  floor = 6,
): number {
  let max = floor;
  for (const { code } of EXAMPLE_COUNT_LANGS) {
    max = Math.max(max, resolveExampleCount(counts, code));
  }
  return Math.min(30, max);
}

export interface ExamplePickResult {
  picked: { jp: string; en: string }[];
  /** True when the user explicitly selected examples in the dictionary UI. */
  manual: boolean;
}

/**
 * Manual selection: use every selected example in click order (counts ignored).
 * Auto mode: take the first `autoMax` results from Tatoeba (per-language limits
 * applied later in buildExampleByLang).
 */
export function pickExamplesForMining(
  examples: { jp: string; en: string }[],
  selectedIndices: ReadonlySet<number>,
  autoMax: number,
): ExamplePickResult {
  if (selectedIndices.size > 0) {
    return {
      picked: [...selectedIndices]
        .sort((a, b) => a - b)
        .map((i) => examples[i])
        .filter(Boolean),
      manual: true,
    };
  }
  const cap = Math.max(1, autoMax);
  return { picked: examples.slice(0, cap), manual: false };
}

/** Build per-language example text arrays for mining. */
export function buildExampleByLang(
  picked: { jp: string; en: string }[],
  counts: Partial<Record<ExampleCountLang, number>>,
  manual: boolean,
  translate: (ex: { jp: string; en: string }, lang: ExampleCountLang) => string,
): Partial<Record<ExampleCountLang, string[]>> {
  if (!picked.length) return {};
  const out: Partial<Record<ExampleCountLang, string[]>> = {};
  for (const { code } of EXAMPLE_COUNT_LANGS) {
    const limit = manual ? picked.length : resolveExampleCount(counts, code);
    if (limit <= 0) continue;
    const parts = picked
      .slice(0, limit)
      .map((ex) => translate(ex, code))
      .filter((t) => t.trim());
    if (parts.length) out[code] = parts;
  }
  return out;
}

/** Languages referenced as `{example-sentence:xx}` in field templates. */
export function requiredExampleLangs(
  templates: Record<string, string> | undefined,
): ExampleCountLang[] {
  const langs = new Set<ExampleCountLang>();
  if (!templates) return [];
  const re = /\{\s*example-sentence(?:\s*:\s*|-)([a-z]{2})\s*\}/gi;
  for (const tpl of Object.values(templates)) {
    if (!tpl) continue;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(tpl))) {
      const code = m[1].toLowerCase() as ExampleCountLang;
      if (EXAMPLE_COUNT_LANGS.some((l) => l.code === code)) langs.add(code);
    }
    if (/\{\s*example-sentence\s*\}/i.test(tpl)) langs.add('ja');
  }
  return [...langs];
}

const EXAMPLE_LANG_LABELS: Record<ExampleCountLang, string> = {
  ja: 'Japanese',
  en: 'English',
  ru: 'Russian',
  zh: 'Chinese',
};

export function labelExampleLang(code: ExampleCountLang): string {
  return EXAMPLE_LANG_LABELS[code] ?? code;
}

/**
 * Swap example placeholders for expression equivalents (mine-time fallback).
 * `{example-sentence:ru}` → `{expression:ru}`, `{example-pairs:ru:ja}` → paired expressions.
 */
export function applyExampleFallbackTemplate(template: string): string {
  return template
    .replace(
      /\{\s*example-pairs\s*:\s*([a-z]{2})\s*:\s*([a-z]{2})\s*\}/gi,
      (_, a: string, b: string) => `{expression:${a.toLowerCase()}}<br>{expression:${b.toLowerCase()}}`,
    )
    .replace(/\{\s*example-sentence\s*:\s*([a-z]{2})\s*\}/gi, (_, lang: string) => `{expression:${lang.toLowerCase()}}`)
    .replace(/\{\s*example-sentence\s*\}/gi, '{expression}');
}

/** Pick field templates for this mine — normal or expression fallback. */
export function resolveMiningTemplates(
  templates: Record<string, string> | undefined,
  useFallback: boolean,
  fallbackTemplates?: Record<string, string>,
): Record<string, string> | undefined {
  if (!templates || !useFallback) return templates;
  if (fallbackTemplates && Object.keys(fallbackTemplates).length > 0) {
    return fallbackTemplates;
  }
  const out: Record<string, string> = {};
  for (const [field, tpl] of Object.entries(templates)) {
    out[field] = applyExampleFallbackTemplate(tpl);
  }
  return out;
}

/** True when templates reference example-sentence or example-pairs variables. */
export function templatesNeedExamples(templates: Record<string, string> | undefined): boolean {
  if (!templates) return false;
  return Object.values(templates).some((t) =>
    /\{[^}]*(example-sentence|example-pairs)[^}]*\}/i.test(t ?? ''),
  );
}

/** `{example-pairs:ru:ja}` refs in field templates. */
export function extractExamplePairRefs(
  templates: Record<string, string> | undefined,
): { a: ExampleCountLang; b: ExampleCountLang }[] {
  const refs: { a: ExampleCountLang; b: ExampleCountLang }[] = [];
  const seen = new Set<string>();
  if (!templates) return refs;
  const re = /\{\s*example-pairs\s*:\s*([a-z]{2})\s*:\s*([a-z]{2})\s*\}/gi;
  for (const tpl of Object.values(templates)) {
    if (!tpl) continue;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(tpl))) {
      const a = m[1].toLowerCase() as ExampleCountLang;
      const b = m[2].toLowerCase() as ExampleCountLang;
      if (!EXAMPLE_COUNT_LANGS.some((l) => l.code === a)) continue;
      if (!EXAMPLE_COUNT_LANGS.some((l) => l.code === b)) continue;
      const key = `${a}:${b}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push({ a, b });
      }
    }
  }
  return refs;
}

/** Join aligned example sentences from two languages (pair 1, pair 2, …). */
export function formatExamplePairs(
  byLang: Partial<Record<ExampleCountLang, string[]>>,
  langA: ExampleCountLang,
  langB: ExampleCountLang,
  formatPart: (text: string) => string = (t) => t,
): string {
  const a = byLang[langA] ?? [];
  const b = byLang[langB] ?? [];
  const n = Math.max(a.length, b.length);
  const blocks: string[] = [];
  for (let i = 0; i < n; i++) {
    const ta = a[i]?.trim();
    const tb = b[i]?.trim();
    if (ta && tb) blocks.push(`${formatPart(ta)}<br>${formatPart(tb)}`);
    else if (ta) blocks.push(formatPart(ta));
    else if (tb) blocks.push(formatPart(tb));
  }
  return blocks.join('<br><br>');
}

/** Languages available for {base:lang} / {base-lang} translated variables. */
export const MINING_LANGS: readonly { code: string; label: string }[] = [
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
];

/**
 * Base variables that can be suffixed with a language code for translation.
 * `reading` is intentionally absent — translating a kana reading to another
 * language is meaningless, and those tokens only generated wasted LLM jobs.
 * `{reading:ja}` still works as a raw value.
 */
export const MINING_TRANSLATABLE_BASES: readonly string[] = [
  'expression',
  'sentence',
  'example-sentence',
  'meaning',
  'translation',
  'sentence-translation',
];

/**
 * Aliases accepted inside templates so users coming from other tools feel at
 * home ({term}/{word} == {expression}, {glossary} == {meaning}, ...). Maps a
 * lowercased token to its canonical MINING_VARS key.
 */
export const MINING_VAR_ALIASES: Readonly<Record<string, string>> = {
  expression: 'expression',
  term: 'expression',
  word: 'expression',
  hanzi: 'expression', // Chinese headword
  simplified: 'expression',
  traditional: 'expression',
  reading: 'reading',
  kana: 'reading',
  furigana: 'reading',
  yomi: 'reading',
  pinyin: 'reading', // Chinese reading
  romaji: 'reading',
  meaning: 'meaning',
  glossary: 'meaning',
  gloss: 'meaning',
  definition: 'meaning',
  translation: 'translation',
  sentence: 'sentence',
  context: 'sentence',
  'example-sentence': 'example-sentence',
  example: 'example-sentence',
  'example-pairs': 'example-pairs',
  examplepairs: 'example-pairs',
  'sentence-translation': 'sentence-translation',
  sentencetranslation: 'sentence-translation',
  'cloze-before': 'cloze-before',
  clozebefore: 'cloze-before',
  'cloze-prefix': 'cloze-before',
  'cloze-inside': 'cloze-inside',
  clozeinside: 'cloze-inside',
  'cloze-body': 'cloze-inside',
  'cloze-after': 'cloze-after',
  clozeafter: 'cloze-after',
  'cloze-suffix': 'cloze-after',
  pitch: 'pitch',
  'pitch-accent': 'pitch',
  frequency: 'frequency',
  freq: 'frequency',
  audio: 'audio',
  image: 'image',
  picture: 'image',
};

/** The value bag a template renders against — keyed by canonical variable. */
export type MiningValues = Partial<Record<MiningVar['key'], string>> & Record<string, string>;

/**
 * Parse a brace token like `expression`, `expression:ru`, or `expression-ru`
 * into its canonical base variable and optional language code.
 */
export function parseMiningBraceToken(
  rawName: string,
  colonLang?: string,
): { canonical: string; lang?: string } | null {
  let lang = colonLang?.toLowerCase();
  let baseName = rawName;

  if (!lang) {
    const m = rawName.match(/^(.+)-([a-z]{2})$/i);
    if (m) {
      const candidateBase = m[1];
      const candidateLang = m[2].toLowerCase();
      if (MINING_VAR_ALIASES[candidateBase.toLowerCase()]) {
        baseName = candidateBase;
        lang = candidateLang;
      }
    }
  }

  const canonical = MINING_VAR_ALIASES[baseName.toLowerCase()];
  if (!canonical) return null;
  return { canonical, lang };
}

/**
 * Render one field template. Every `{token}` whose (aliased) name is known is
 * replaced with `values[canonicalKey]` (or '' when that value is absent);
 * unknown tokens are left verbatim so a typo is visible rather than silently
 * dropped. Literal text/HTML around the braces is never touched — callers that
 * need HTML-safe data must pass already-escaped values in `values`.
 */
export function renderFieldTemplate(template: string, values: MiningValues): string {
  const withPairs = template.replace(
    /\{\s*example-pairs\s*:\s*([a-z]{2})\s*:\s*([a-z]{2})\s*\}/gi,
    (whole, langA: string, langB: string) => values[`example-pairs:${langA.toLowerCase()}:${langB.toLowerCase()}`] ?? '',
  );
  const withDynamicFreq = withPairs.replace(
    /\{\s*frequency\s*:\s*([A-Za-z0-9 _-]+)\s*\}/g,
    (_whole, rawName: string) => values[`frequency:${rawName.trim()}`] ?? '',
  );
  return withDynamicFreq.replace(
    /\{\s*([A-Za-z][A-Za-z0-9-]*)(?::([a-z]{2}))?\s*\}/g,
    (whole, rawName: string, colonLang: string | undefined) => {
      const parsed = parseMiningBraceToken(rawName, colonLang);
      if (!parsed) return whole;
      const key = parsed.lang ? `${parsed.canonical}:${parsed.lang}` : parsed.canonical;
      return values[key] ?? '';
    },
  );
}

/**
 * Find every `{base:lang}` translation the given field templates ask for, as
 * unique {base, lang} pairs (base is the canonical variable). The renderer uses
 * this to pre-translate values before mining (translation is renderer-side).
 */
export function extractTranslationRefs(
  templates: Record<string, string>,
): { base: string; lang: string }[] {
  const seen = new Set<string>();
  const refs: { base: string; lang: string }[] = [];
  const re = /\{\s*([A-Za-z][A-Za-z0-9-]*)(?::([a-z]{2}))?\s*\}/g;
  for (const tpl of Object.values(templates)) {
    if (!tpl) continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(tpl))) {
      const parsed = parseMiningBraceToken(m[1], m[2]);
      if (!parsed?.lang) continue;
      // Non-JA reading refs are fluff — never translated, never queued.
      if (parsed.canonical === 'reading' && parsed.lang !== 'ja') continue;
      const key = `${parsed.canonical}:${parsed.lang}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push({ base: parsed.canonical, lang: parsed.lang });
      }
    }
  }
  return refs;
}

export function extractDynamicFrequencyRefs(templates: Record<string, string>): string[] {
  const seen = new Set<string>();
  const refs: string[] = [];
  const re = /\{\s*frequency\s*:\s*([A-Za-z0-9 _-]+)\s*\}/g;
  for (const tpl of Object.values(templates)) {
    if (!tpl) continue;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(tpl))) {
      const name = m[1].trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      refs.push(name);
    }
  }
  return refs;
}

/**
 * Split a sentence around the mined word for the cloze-* variables. Prefers the
 * exact surface form (食べた) over the dictionary form (食べる), then the reading.
 * If the word can't be located, degrades to just the word (never a broken
 * split) — the full sentence stays available via {sentence}.
 */
export function computeCloze(
  sentence: string,
  surface?: string,
  term?: string,
  reading?: string,
): { before: string; inside: string; after: string } {
  const s = sentence ?? '';
  const candidates = [surface, term, reading].filter(
    (x): x is string => typeof x === 'string' && x.trim().length > 0,
  );
  const fallbackInside = candidates[0] ?? '';
  if (!s) return { before: '', inside: fallbackInside, after: '' };
  for (const needle of candidates) {
    const idx = s.indexOf(needle);
    if (idx !== -1) {
      return { before: s.slice(0, idx), inside: needle, after: s.slice(idx + needle.length) };
    }
  }
  return { before: '', inside: fallbackInside, after: '' };
}

/** True once at least one field carries a non-blank template (5.6 switch). */
export function hasFieldTemplates(templates?: Record<string, string>): boolean {
  if (!templates) return false;
  for (const value of Object.values(templates)) {
    if (typeof value === 'string' && value.trim().length > 0) return true;
  }
  return false;
}
