import { extractTranslationRefs, parseMiningBraceToken, type MiningValues } from './anki';
import type { DictEntry } from './types';
import type {
  ExcludeNamesOptions,
  MiningCandidate,
  TraditionalMiningConfig,
} from './mining';
import { DEFAULT_TRADITIONAL_MINING_CONFIG } from './mining';
import {
  matchesChineseNameHeuristic,
  matchesRussianNameHeuristic,
} from './bundledNameLists';
import {
  hasKana,
  hasMixedScriptWord,
  hiraToKata,
  kataToHira,
  textMatchesLang,
} from './langs';

/** Any language code — see shared/langs.ts. */
export type GlossLang = string;

/** Word-level bases resolved dictionary-first (gloss), Qwen as fail-switch. */
export const WORD_LEVEL_BASES: ReadonlySet<string> = new Set([
  'expression',
  'meaning',
  'translation',
]);

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function glossFromEntry(entry: DictEntry, lang: GlossLang | 'any' = 'en'): string {
  if (entry.glossaryHtml) {
    const plain = stripHtml(entry.glossaryHtml);
    if (plain) return plain;
  }
  const defs = entry.senses.flatMap((s) => s.definitions).filter(Boolean);
  if (!defs.length) return '';
  if (lang === 'any') return defs.slice(0, 3).join(' / ');
  const matching = defs.filter((d) => textMatchesLang(lang, d));
  if (matching.length) return matching.slice(0, 3).join(' / ');
  // English is the historical default when nothing script-matches.
  if (lang === 'en' || lang === 'ja') return defs.slice(0, 3).join(' / ');
  return '';
}

/** Short word-like form of a gloss (first sense) for `{expression:lang}` slots. */
export function firstGlossSegment(gloss: string): string {
  const first = gloss.split(/\s*(?:\/|;|·)\s*/)[0]?.trim() ?? '';
  return first || gloss.trim();
}

export function pickDictEntry(
  entries: DictEntry[],
  expression: string,
  reading?: string,
): DictEntry | undefined {
  if (!entries.length) return undefined;
  const norm = (s: string) => s.trim();
  const exact = entries.find(
    (e) => norm(e.word) === norm(expression) && (!reading || !norm(reading) || norm(e.reading) === norm(reading)),
  );
  if (exact) return exact;
  const wordMatch = entries.find((e) => norm(e.word) === norm(expression));
  if (wordMatch) return wordMatch;
  return entries[0];
}

export function resolveTraditionalTemplates(traditional: TraditionalMiningConfig): {
  front: string;
  back: string;
} {
  const defaults = DEFAULT_TRADITIONAL_MINING_CONFIG.templates;
  if (traditional.templates.resetToAutomatic) {
    return { front: defaults.front, back: defaults.back };
  }
  return {
    front: traditional.templates.front.trim() || defaults.front,
    back: traditional.templates.back.trim() || defaults.back,
  };
}

export interface EnrichmentNeeds {
  glossLangs: GlossLang[];
  translationRefs: { base: string; lang: string }[];
  needsBareTranslation: boolean;
  needsSentenceTranslation: boolean;
}

const GLOSS_LANG_RE = /\{\s*meaning(?::\s*([a-z]{2}))?\s*\}/gi;
const BARE_TRANSLATION_RE = /\{\s*translation\s*\}/i;
const SENTENCE_TRANSLATION_RE = /\{\s*sentence-translation(?::\s*[a-z]{2})?\s*\}/i;

/** `{base:ja}` tokens that are raw mined data — never routed or translated. */
const RAW_JA_BASES = new Set(['expression', 'reading', 'sentence', 'example-sentence']);

/** HTML-safe candidate id for UI selects (no NUL — invalid in option values). */
export function candidateLookupKey(expression: string, reading?: string): string {
  return JSON.stringify([expression, reading ?? '']);
}

/** Overlay export-time enrichment (glosses/translations) onto the full analyzed list. */
export function mergeEnrichedCandidates(
  all: MiningCandidate[],
  enriched: MiningCandidate[],
): MiningCandidate[] {
  const keyOf = (c: MiningCandidate): string => candidateLookupKey(c.expression, c.reading);
  const byKey = new Map(enriched.map((c) => [keyOf(c), c] as const));
  return all.map((c) => byKey.get(keyOf(c)) ?? c);
}

export function needsEnrichmentLookup(
  frontTemplate: string,
  backTemplate: string,
  options?: { translateSentences?: boolean; translationTargetLang?: string },
): EnrichmentNeeds {
  const combined = `${frontTemplate}\n${backTemplate}`;
  const glossSet = new Set<GlossLang>();
  let m: RegExpExecArray | null;
  GLOSS_LANG_RE.lastIndex = 0;
  while ((m = GLOSS_LANG_RE.exec(combined))) {
    glossSet.add((m[1]?.toLowerCase() ?? 'en') as GlossLang);
  }
  const templates = { front: frontTemplate, back: backTemplate };
  // Translating readings to other languages is meaningless — those refs are
  // dropped entirely (the slot renders empty and collapses). `{base:ja}` raw
  // tokens come straight from mined data and never create jobs either.
  const translationRefs = extractTranslationRefs(templates).filter(
    (r) =>
      !(r.base === 'reading' && r.lang !== 'ja') &&
      !(r.lang === 'ja' && RAW_JA_BASES.has(r.base)),
  );
  // Word-level cross-language tokens are dictionary-first: their languages join
  // the gloss lookup so Qwen only handles words the dictionaries miss. The
  // English gloss is fetched too — it is the pivot source for the fail-switch
  // (Qwen translates an EN gloss far more reliably than a bare JA headword).
  for (const ref of translationRefs) {
    if (WORD_LEVEL_BASES.has(ref.base) && ref.lang !== 'ja') {
      glossSet.add(ref.lang);
      if (ref.lang !== 'en') glossSet.add('en');
    }
  }
  const needsBareTranslation = BARE_TRANSLATION_RE.test(combined);
  if (needsBareTranslation && options?.translationTargetLang) {
    glossSet.add(options.translationTargetLang);
  }
  const needsSentenceTranslation =
    Boolean(options?.translateSentences) && SENTENCE_TRANSLATION_RE.test(combined);
  return {
    glossLangs: [...glossSet],
    translationRefs,
    needsBareTranslation,
    needsSentenceTranslation,
  };
}

export function inferTranslationTargetLang(
  config: TraditionalMiningConfig,
  frontTemplate: string,
  backTemplate: string,
): GlossLang {
  const exp = config.export ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export;
  if (exp.translationTargetLang) return exp.translationTargetLang;
  const combined = `${frontTemplate}\n${backTemplate}`;
  const langMatch = combined.match(/\{\s*translation\s*:\s*([a-z]{2})\s*\}/i);
  if (langMatch) return langMatch[1].toLowerCase() as GlossLang;
  const ref = extractTranslationRefs({ front: frontTemplate, back: backTemplate }).find(
    (r) => r.base === 'translation',
  );
  if (ref) return ref.lang as GlossLang;
  return 'ru';
}

export function isNameExcluded(
  candidate: MiningCandidate,
  excludeNames: ExcludeNamesOptions | undefined,
): boolean {
  if (!excludeNames) return false;
  const tag = candidate.nameTag;
  if (!tag) {
    if (excludeNames.chinese && matchesChineseNameHeuristic(candidate.expression, candidate.reading ?? '')) {
      return true;
    }
    if (excludeNames.russian && matchesRussianNameHeuristic(candidate.expression, candidate.reading ?? '')) {
      return true;
    }
    return false;
  }
  if (excludeNames.japanese && (tag === 'ja-person' || tag === 'ja-proper' || tag === 'ja-org')) return true;
  if (excludeNames.places && tag === 'ja-place') return true;
  if (excludeNames.chinese && tag === 'cn-name') return true;
  if (excludeNames.russian && tag === 'ru-name') return true;
  return false;
}

/**
 * Decide what to feed the translator for a `{base:lang}` slot — or, when the
 * dictionaries already cover the target language, return the gloss itself
 * (source === target, so no LLM job is created).
 *
 * Word-level bases (expression / meaning / translation) are dictionary-first:
 * 1. Gloss in the target language → dictionary value, no Qwen.
 * 2. English gloss → Qwen translates the gloss (far more reliable than a bare
 *    Japanese headword for a small model).
 * 3. Japanese headword → last-resort Qwen source (the fail-switch).
 */
export function resolveTranslationSource(
  candidate: MiningCandidate,
  base: string,
  targetLang: string,
): { source: GlossLang; text: string } {
  const glosses = candidate.glosses ?? {};
  if (base === 'sentence' || base === 'example-sentence' || base === 'sentence-translation') {
    return { source: 'ja', text: candidate.sampleSentence };
  }
  if (base === 'reading') {
    // Non-JA reading refs are filtered out upstream; keep JA passthrough sane.
    return { source: 'ja', text: candidate.reading?.trim() || candidate.expression };
  }
  if (WORD_LEVEL_BASES.has(base)) {
    const direct = glosses[targetLang]?.trim();
    if (direct) {
      return {
        source: targetLang,
        text: base === 'expression' ? firstGlossSegment(direct) : direct,
      };
    }
    const en = glosses.en?.trim();
    if (en && targetLang !== 'en') return { source: 'en', text: en };
    const ja = glosses.ja?.trim();
    if (base === 'meaning' && ja) return { source: 'ja', text: ja };
    return { source: 'ja', text: candidate.expression };
  }
  return { source: 'ja', text: candidate.expression };
}

/** Reject untranslated copy-paste (e.g. JA headword stored as `{expression:zh}`). */
export function isValidCrossLangTranslation(
  sourceLang: string,
  targetLang: string,
  sourceText: string,
  translated: string,
): boolean {
  const src = sourceText.trim();
  const out = translated.trim();
  if (!out) return false;
  if (sourceLang === targetLang) return true;
  if (out === src) return false;
  // Batch-job id echoed back as the "translation" (the stray "t0" card bug).
  if (/^t\d+$/i.test(out)) return false;

  // Inspect the OUTPUT, not the source: a leaked reading (人間 → ニンゲン) or an
  // untranslated echo (友 → 友) shows up as Japanese script in the result even
  // when the source is kanji-only — which a source-based kana check would miss.
  if (targetLang !== 'ja' && hasKana(out)) return false;
  // Single words mixing Cyrillic and Latin ("сacrificed") are LLM garbage.
  if (hasMixedScriptWord(out)) return false;
  // Each target must actually be written in its own script (unknown scripts
  // pass — they already survived the kana/echo/mixed-script checks).
  return textMatchesLang(targetLang, out);
}

/** Whether a rendered template slot holds real data (not a JA leak into a foreign tag). */
export function isUsableTemplateValue(
  token: string,
  value: string,
  candidate: MiningCandidate,
): boolean {
  if (!value.trim()) return false;
  if (token.endsWith(':ja') || token === 'expression' || token === 'reading' || token === 'sentence') {
    return true;
  }
  if (!token.includes(':')) return true;
  const lang = token.split(':').pop() ?? '';
  if (lang === 'ja') return true;
  if (value.trim() === candidate.expression.trim()) return false;
  if (hasKana(value)) return false;
  if (hasMixedScriptWord(value)) return false;
  return true;
}

/** Insert separators between adjacent `{var}` tokens so users need not type them. */
export function normalizeEpubTemplateSeparators(template: string, separator = '\n'): string {
  const sep = separator || '\n';
  return template.replace(/\}\s*\{/g, `}${sep}{`);
}

/**
 * Drop empty slots after rendering so an unfilled token never leaves a blank
 * line (or doubled custom separator) in the exported card.
 */
export function collapseEmptySegments(rendered: string, separator = '\n'): string {
  const sep = separator || '\n';
  const parts = rendered.split(sep).filter((part) => part.trim() !== '');
  const joined = parts.join(sep);
  // Custom separators still leave blank template lines (explicit \n) behind.
  if (sep !== '\n') {
    return joined
      .split('\n')
      .filter((line) => line.trim() !== '')
      .join('\n');
  }
  return joined;
}

/** Unique canonical template keys from front/back (e.g. `expression:zh`, `meaning`). */
export function extractTemplateTokens(front: string, back: string): string[] {
  const combined = `${front}\n${back}`;
  const seen = new Set<string>();
  const tokens: string[] = [];
  const re = /\{\s*([A-Za-z][A-Za-z0-9-]*)(?::([a-z]{2}))?\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(combined))) {
    const parsed = parseMiningBraceToken(m[1], m[2]);
    if (!parsed) continue;
    const key = parsed.lang ? `${parsed.canonical}:${parsed.lang}` : parsed.canonical;
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(key);
  }
  return tokens;
}

export function candidateNeedsEnrichment(
  candidate: MiningCandidate,
  config: TraditionalMiningConfig,
): boolean {
  const { front, back } = resolveTraditionalTemplates(config);
  const needs = needsEnrichmentLookup(front, back, {
    translateSentences: config.export?.translateSentences,
    translationTargetLang: config.export?.translationTargetLang,
  });
  const tokens = extractTemplateTokens(front, back);
  const values = buildEpubMiningValues(candidate, config);
  const translationKeys = new Set(needs.translationRefs.map((r) => `${r.base}:${r.lang}`));
  const glossLangs = new Set(needs.glossLangs);

  for (const token of tokens) {
    // Removed as fluff — never a reason to enrich.
    if (token.startsWith('reading:') && !token.endsWith(':ja')) continue;

    const val = values[token]?.trim();
    if (val && isUsableTemplateValue(token, val, candidate)) continue;

    if (token === 'translation' && needs.needsBareTranslation) return true;

    if (token.startsWith('sentence-translation') && needs.needsSentenceTranslation) return true;

    if (translationKeys.has(token)) return true;

    if (token.startsWith('meaning')) {
      const lang: GlossLang =
        token === 'meaning' ? 'en' : (token.slice('meaning:'.length) as GlossLang);
      if (glossLangs.has(lang) || translationKeys.has(token)) return true;
    }
  }
  return false;
}

function applyReadingStyle(reading: string, style: 'hiragana' | 'katakana' | undefined): string {
  if (!reading) return reading;
  return style === 'katakana' ? hiraToKata(reading) : kataToHira(reading);
}

export function buildEpubMiningValues(
  candidate: MiningCandidate,
  config: TraditionalMiningConfig,
): MiningValues {
  const { front, back } = resolveTraditionalTemplates(config);
  const targetLang = inferTranslationTargetLang(config, front, back);
  const exp = config.export ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export;
  const sentence = candidate.sampleSentence;
  const expression = candidate.expression;
  const reading = applyReadingStyle(candidate.reading ?? '', exp.readingStyle);
  const glosses = candidate.glosses ?? {};
  const translations = candidate.translations ?? {};

  const pickMeaning = (lang: GlossLang): string => {
    const g = glosses[lang]?.trim();
    if (g) return g;
    const t = translations[`meaning:${lang}`]?.trim();
    if (t && isUsableTemplateValue(`meaning:${lang}`, t, candidate)) return t;
    return '';
  };

  const meaningEn = pickMeaning('en');
  const meaningJa = pickMeaning('ja');

  const values: MiningValues = {
    expression,
    reading,
    sentence,
    meaning: meaningEn,
    'meaning-ja': meaningJa,
    translation: '',
    'expression:ja': expression,
    'reading:ja': reading,
    'sentence:ja': sentence,
    'meaning:en': meaningEn,
    'meaning:ja': meaningJa,
  };

  // Every language a dictionary or the translator produced a meaning for.
  const meaningLangs = new Set<string>();
  for (const lang of Object.keys(glosses)) meaningLangs.add(lang);
  for (const key of Object.keys(translations)) {
    if (key.startsWith('meaning:')) meaningLangs.add(key.slice('meaning:'.length));
  }
  for (const lang of meaningLangs) {
    if (lang === 'en' || lang === 'ja') continue;
    const v = pickMeaning(lang);
    if (v) values[`meaning:${lang}`] = v;
  }

  for (const [name, rank] of Object.entries(candidate.frequencies.byDictionary)) {
    values[`frequency:${name}`] = String(rank);
  }
  if (candidate.frequencies.primary != null) {
    values.frequency = String(candidate.frequencies.primary);
  } else {
    values.frequency = String(candidate.count);
  }

  // Non-ja lang-tagged fields must come from valid translations only. Non-JA
  // reading slots are fluff and stay empty (they collapse at render time).
  for (const [key, text] of Object.entries(translations)) {
    if (!text?.trim()) continue;
    if (/^(expression|reading|sentence):ja$/.test(key)) continue;
    if (key.startsWith('reading:')) continue;
    if (!isUsableTemplateValue(key, text, candidate)) continue;
    values[key] = text;
  }

  // Dictionary-first for word-level slots: a gloss in the target language fills
  // `{expression:lang}` directly, no translator needed. Qwen values (written
  // into `translations`) only apply above when the dictionary had nothing.
  for (const [lang, gloss] of Object.entries(glosses)) {
    const g = gloss?.trim();
    if (!g || lang === 'ja') continue;
    const expKey = `expression:${lang}`;
    if (!values[expKey]?.trim()) values[expKey] = firstGlossSegment(g);
  }

  const bareTranslation =
    translations.translation?.trim() ||
    translations[`translation:${targetLang}`]?.trim() ||
    translations[`expression:${targetLang}`]?.trim() ||
    glosses[targetLang]?.trim() ||
    '';
  if (bareTranslation) {
    values.translation = bareTranslation;
    if (!values[`translation:${targetLang}`]?.trim()) {
      values[`translation:${targetLang}`] = bareTranslation;
    }
  }

  return values;
}
