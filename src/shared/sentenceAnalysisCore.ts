/**
 * Whole-sentence AI annotation — the model behind "AI OCR".
 *
 * The dictionary path answers "what is this word". This one answers "what is
 * this sentence doing": the sentence comes back marked up into spans, each one
 * colour-coded by what it is (grammar point, vocabulary, particle, set phrase)
 * and carrying its own level, meaning, in-depth explanation and examples. The
 * reader clicks a highlight and gets that span explained in place, so the
 * sentence itself stays the interface rather than being replaced by a wall of
 * prose.
 *
 * Two decisions shape everything below:
 *
 *   - Spans are aligned *locally*, never trusted from the model. The model
 *     returns the substring it is talking about; `alignAnnotations` finds where
 *     that substring actually sits and drops anything it cannot place. A model
 *     that hallucinates an offset would otherwise paint a highlight over the
 *     wrong characters, which is worse than no highlight.
 *   - Translations are always en + ja + zh. A learner reading Japanese wants
 *     English, a Chinese speaker wants Chinese, and "the same sentence in easy
 *     Japanese" is its own study aid — asking for all three costs one call.
 *
 * Deliberately pure — no Electron, no Node — so the prompt, the provider schema
 * and the (defensive) parse are unit-testable on their own, exactly like
 * translateAnalysisCore.ts.
 */

import { langLabel } from './langs';
import { cleanLlmOutput } from './translateCore';
import {
  DEFAULT_ANALYSIS_PREFS,
  DEPTH_GUIDANCE,
  hasSection,
  type SentenceAnalysisPrefs,
  type TranslationLang,
} from './sentenceAnalysisPrefs';

/** How long a sentence may be before we refuse to spend a cloud call on it. */
export const MAX_ANALYSIS_CHARS = 600;
/** Below this there is no sentence to analyze, just a word — use the dictionary. */
export const MIN_ANALYSIS_CHARS = 2;

/**
 * What a highlighted span *is*. Drives the highlight colour, so the reader can
 * see the shape of the sentence — where the grammar is, where the content words
 * are — before reading a single explanation.
 */
export type AnnotationCategory =
  | 'grammar'
  | 'vocabulary'
  | 'particle'
  | 'expression'
  | 'idiom'
  | 'name';

export const ANNOTATION_CATEGORIES: readonly AnnotationCategory[] = [
  'grammar',
  'vocabulary',
  'particle',
  'expression',
  'idiom',
  'name',
];

export interface AnnotationExample {
  text: string;
  translation: string;
}

export interface AnnotationVocabNote {
  term: string;
  reading?: string;
  gloss: string;
}

export interface SentenceAnnotation {
  /** The span exactly as it appears in the sentence. */
  text: string;
  /** Character offset into the normalized sentence. Set by `alignAnnotations`. */
  start: number;
  /** Exclusive end offset. Set by `alignAnnotations`. */
  end: number;
  category: AnnotationCategory;
  /**
   * Citation headline for the detail card — 一つ一つが（ひとつひとつが）. Falls
   * back to `text` when the span is already in its citation shape.
   */
  headword?: string;
  /** Kana for Japanese, pinyin for Chinese, stress-marked form for Russian. */
  reading?: string;
  /** Band label for the study language: N5–N1 / HSK 1–6 / A1–C2. */
  level?: string;
  /** Meaning / function — the one-liner under the headword. */
  meaning: string;
  /** The in-depth part: why it is used here, what it contrasts with. */
  explanation: string;
  /** Other sentences using the same point. */
  examples: AnnotationExample[];
  /** Sub-words worth calling out inside this span. */
  vocabulary: AnnotationVocabNote[];
  /** Register note specific to this span, when it carries one. */
  formality?: string;
  /**
   * The grammar library point this span was matched to. Set only by the offline
   * highlighter (`localGrammarAnalysis`), which matches library points by construction;
   * an AI annotation names a pattern, not a library id, and never carries one.
   */
  grammarId?: string;
}

/** The sentence rendered in each supported study/UI language. */
export interface SentenceTranslations {
  en?: string;
  ja?: string;
  zh?: string;
}

export interface SentenceFormality {
  /** Short label: "Casual (plain form)", "Polite (です・ます)", "Humble". */
  level: string;
  /** Who says this to whom, and what switching register would change. */
  note: string;
}

export interface SentenceAnalysisResult {
  /** Echo of the sentence that was analyzed, after normalization. */
  sentence: string;
  /** en / ja / zh renderings. The sentence's own language gets a plain paraphrase. */
  translations: SentenceTranslations;
  /** Structure-preserving gloss, so the mapping to the original is visible. */
  literal?: string;
  formality?: SentenceFormality;
  /** Overall band for the sentence. */
  difficulty?: string;
  /** Clause-by-clause walkthrough of how the sentence is built. */
  structure?: string;
  /** Colour-coded spans over `sentence`, aligned and non-overlapping. */
  annotations: SentenceAnnotation[];
  /** Nuance, connotation, cultural context. */
  nuance: string[];
  /** Mistakes a learner predictably makes with this sentence. */
  pitfalls: string[];
}

export interface SentenceAnalyzeRequest {
  /** The sentence to analyze — OCR output, a selection, or a typed line. */
  text: string;
  /** Study language the sentence is written in. */
  lang: string;
  /** Language the prose explanations come back in. Defaults to English. */
  explainIn?: string;
  /** Surrounding text, when the caller has it — page title, previous line. */
  context?: string;
  /** Learner level, so explanations can be pitched. Free-form ("N4"). */
  learnerLevel?: string;
  /**
   * What to ask for. Omitted at untrusted boundaries (the extension's HTTP
   * route), where the main process substitutes the user's stored preferences —
   * so a caller can never quietly opt out of them.
   */
  prefs?: SentenceAnalysisPrefs;
}

/** Where the analysis was triggered from. */
export type SentenceAnalysisSource = 'lens' | 'extension-ocr' | 'extension-selection' | 'app';

// ---- level bands -----------------------------------------------------------

const LEVEL_BANDS: Record<string, readonly string[]> = {
  ja: ['N5', 'N4', 'N3', 'N2', 'N1'],
  zh: ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6'],
};

const CEFR_BANDS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

/** The band labels the model must choose from for `lang`. */
export function levelBands(lang: string): readonly string[] {
  return LEVEL_BANDS[lang.toLowerCase()] ?? CEFR_BANDS;
}

/**
 * Normalize a sentence for analysis, alignment and caching.
 *
 * OCR output arrives with line breaks wherever the recognizer found a box, and
 * a selection drags along the page's indentation. Both collapse to single
 * spaces. This is also the string every annotation offset indexes into, so it
 * must be applied once, up front, and never again — normalizing twice after
 * alignment would shift every highlight.
 */
export function normalizeAnalysisText(raw: string): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFKC')
    .slice(0, MAX_ANALYSIS_CHARS);
}

/** Is there enough here to be worth a cloud call? */
export function isAnalyzableText(raw: string): boolean {
  return normalizeAnalysisText(raw).length >= MIN_ANALYSIS_CHARS;
}

// ---- alignment -------------------------------------------------------------

/** An annotation before it has been placed on the sentence. */
export type UnalignedAnnotation = Omit<SentenceAnnotation, 'start' | 'end'>;

/**
 * Place each annotation on the sentence and drop what cannot be placed.
 *
 * A cursor walks forward so that a span repeated in the sentence (particles,
 * above all — は appearing three times) maps to successive occurrences rather
 * than all landing on the first. When a span is not found ahead of the cursor
 * the whole sentence is searched, because the model does not reliably return
 * annotations in reading order.
 *
 * Overlaps are then resolved greedily by (earliest start, longest span): the
 * longer span wins because it is the more specific claim — 一つ一つが as one
 * grammar point beats 一つ plus が as two fragments. Rendering requires
 * non-overlapping spans, so a loser is dropped entirely rather than truncated,
 * which would silently misattribute its explanation to the wrong characters.
 */
export function alignAnnotations(
  sentence: string,
  annotations: readonly UnalignedAnnotation[],
): SentenceAnnotation[] {
  const placed: SentenceAnnotation[] = [];
  let cursor = 0;
  for (const annotation of annotations) {
    const text = annotation.text;
    if (!text) continue;
    let start = sentence.indexOf(text, cursor);
    if (start === -1) start = sentence.indexOf(text);
    if (start === -1) continue;
    placed.push({ ...annotation, start, end: start + text.length });
    cursor = start + text.length;
  }

  placed.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: SentenceAnnotation[] = [];
  let lastEnd = 0;
  for (const annotation of placed) {
    if (annotation.start < lastEnd) continue; // overlaps a span we already kept
    kept.push(annotation);
    lastEnd = annotation.end;
  }
  return kept;
}

/** One piece of the rendered sentence: either a highlight or plain text. */
export type SentencePiece =
  | { kind: 'plain'; text: string }
  | { kind: 'annotation'; text: string; annotation: SentenceAnnotation; index: number };

/**
 * Cut the sentence into render-ready pieces.
 *
 * Every caller — the React view, the extension's DOM builder — needs exactly
 * this walk, and getting it subtly wrong drops characters from the sentence.
 * Doing it once here means the two surfaces cannot disagree about what the
 * sentence says.
 */
export function sentencePieces(
  sentence: string,
  annotations: readonly SentenceAnnotation[],
): SentencePiece[] {
  const pieces: SentencePiece[] = [];
  let at = 0;
  annotations.forEach((annotation, index) => {
    if (annotation.start > at) {
      pieces.push({ kind: 'plain', text: sentence.slice(at, annotation.start) });
    }
    pieces.push({
      kind: 'annotation',
      text: sentence.slice(annotation.start, annotation.end),
      annotation,
      index,
    });
    at = annotation.end;
  });
  if (at < sentence.length) pieces.push({ kind: 'plain', text: sentence.slice(at) });
  return pieces;
}

// ---- provider schema -------------------------------------------------------

const EXAMPLE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      translation: { type: 'string' },
    },
    required: ['text', 'translation'],
  },
};

const VOCAB_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      term: { type: 'string' },
      reading: { type: 'string' },
      gloss: { type: 'string' },
    },
    required: ['term', 'gloss'],
  },
};

function annotationSchema(prefs: SentenceAnalysisPrefs): unknown {
  const properties: Record<string, unknown> = {
    text: { type: 'string' },
    category: { type: 'string', enum: ANNOTATION_CATEGORIES as unknown as string[] },
    headword: { type: 'string' },
    reading: { type: 'string' },
    level: { type: 'string' },
    meaning: { type: 'string' },
    explanation: { type: 'string' },
  };
  if (hasSection(prefs, 'formality')) properties.formality = { type: 'string' };
  if (hasSection(prefs, 'examples')) properties.examples = EXAMPLE_SCHEMA;
  if (hasSection(prefs, 'vocabulary')) properties.vocabulary = VOCAB_SCHEMA;
  return {
    type: 'array',
    items: {
      type: 'object',
      properties,
      required: ['text', 'category', 'meaning', 'explanation'],
    },
  };
}

/**
 * The provider schema for these preferences.
 *
 * Built rather than constant so a switched-off section is genuinely not
 * requested: Gemini's `responseSchema` constrains generation, so omitting a
 * property is what actually stops the model spending tokens on it. Hiding the
 * field renderer-side would pay for it on every call.
 */
export function buildSentenceAnalysisSchema(
  prefs: SentenceAnalysisPrefs = DEFAULT_ANALYSIS_PREFS,
): unknown {
  const properties: Record<string, unknown> = { annotations: annotationSchema(prefs) };
  const required: string[] = ['annotations'];

  const wantsTranslations = hasSection(prefs, 'translations') && prefs.translations.length > 0;
  if (wantsTranslations) {
    const langs: Record<string, unknown> = {};
    for (const code of prefs.translations) langs[code] = { type: 'string' };
    properties.translations = {
      type: 'object',
      properties: langs,
      required: [...prefs.translations],
    };
    required.push('translations');
  }
  if (hasSection(prefs, 'literal')) properties.literal = { type: 'string' };
  if (hasSection(prefs, 'formality')) {
    properties.formality = {
      type: 'object',
      properties: { level: { type: 'string' }, note: { type: 'string' } },
      required: ['level', 'note'],
    };
  }
  if (hasSection(prefs, 'structure')) properties.structure = { type: 'string' };
  if (hasSection(prefs, 'nuance')) properties.nuance = { type: 'array', items: { type: 'string' } };
  if (hasSection(prefs, 'pitfalls')) {
    properties.pitfalls = { type: 'array', items: { type: 'string' } };
  }
  // The band is a single short token and is what the sentence card's difficulty
  // badge reads, so it is not worth a toggle of its own.
  properties.difficulty = { type: 'string' };

  return { type: 'object', properties, required };
}

// ---- prompt ----------------------------------------------------------------

/** Reading field wording differs per script, and a wrong ask produces romaji. */
function readingInstruction(lang: string): string {
  switch (lang.toLowerCase()) {
    case 'ja':
      return 'hiragana/katakana';
    case 'zh':
      return 'pinyin with tone marks';
    case 'ru':
      return 'the form with the stressed vowel marked (e.g. "молоко́")';
    case 'ko':
      return 'Revised Romanization';
    default:
      return 'a pronunciation guide';
  }
}

const TRANSLATION_LABELS: Record<TranslationLang, string> = {
  en: 'English',
  ja: 'Japanese',
  zh: 'Simplified Chinese',
};

/**
 * How to phrase the translation ask.
 *
 * Asking a model to "translate" a Japanese sentence into Japanese produces the
 * sentence back verbatim, which is worthless. For the sentence's own language
 * the ask becomes a simplification instead — an easy-Japanese restatement is a
 * genuine study aid, and it is the field a learner reads second.
 */
function translationInstruction(lang: string, targets: readonly TranslationLang[]): string {
  const code = lang.toLowerCase();
  return targets
    .map((target) =>
      code === target
        ? `"${target}": the sentence restated in simple ${TRANSLATION_LABELS[target]} — same meaning, easier words and grammar.`
        : `"${target}": a natural, idiomatic ${TRANSLATION_LABELS[target]} translation.`,
    )
    .join(' ');
}

export function buildSentenceAnalysisPrompt(
  req: SentenceAnalyzeRequest,
  prefs: SentenceAnalysisPrefs = DEFAULT_ANALYSIS_PREFS,
): string {
  const sentence = normalizeAnalysisText(req.text);
  const source = langLabel(req.lang);
  const explain = langLabel(req.explainIn || 'en');
  const bands = levelBands(req.lang).join(', ');
  const context = normalizeAnalysisText(req.context || '');
  const learnerLevel = req.learnerLevel || prefs.learnerLevel;

  const parts: string[] = [
    `You are an expert ${source} teacher annotating one sentence for a learner. ` +
      `Write every explanation in ${explain}. Be specific and concrete — explain why this ` +
      'sentence is built the way it is, not what the words mean in isolation.',
    `${source} sentence: ${sentence}`,
  ];
  if (context && context !== sentence) {
    parts.push(`Surrounding text (context only — do NOT analyze it): ${context}`);
  }
  if (learnerLevel) {
    parts.push(
      `The learner is around ${learnerLevel}. Assume anything below that level is known ` +
        'and spend the explanation on what is actually new to them.',
    );
  }
  parts.push(
    DEPTH_GUIDANCE[prefs.depth],
    'The text may come from OCR and may contain a recognition error. If a character is ' +
      'clearly wrong, analyze the sentence you believe was intended and say so.',
    'Return a single JSON object with exactly these fields:',
  );

  if (hasSection(prefs, 'translations') && prefs.translations.length) {
    parts.push(
      `"translations": an object with these keys. ${translationInstruction(req.lang, prefs.translations)}`,
    );
  }
  if (hasSection(prefs, 'literal')) {
    parts.push(
      '"literal": a word-order-preserving literal rendering, so the learner can map it back ' +
        'onto the original. Use "/" between glosses where the languages disagree on order.',
    );
  }
  if (hasSection(prefs, 'formality')) {
    parts.push(
      '"formality": {"level", "note"}. "level" is a short label such as "Casual (plain form)", ' +
        '"Polite (です・ます)", "Formal / written" or "Humble". "note" says who would say this ' +
        'to whom, in what setting, and what would change if the register moved up or down.',
    );
  }
  parts.push(`"difficulty": one band from: ${bands}. Pick the band the sentence as a whole sits at.`);
  if (hasSection(prefs, 'structure')) {
    parts.push(
      '"structure": a clause-by-clause walkthrough of how the sentence is assembled — main ' +
        'clause, subordinate clauses, what modifies what, and where the topic/subject sits.',
    );
  }
  parts.push(buildAnnotationInstruction(req.lang, bands, prefs));
  if (hasSection(prefs, 'nuance')) {
    parts.push(
      '"nuance": array of short notes on connotation, implication, politeness or cultural ' +
        'context that a translation cannot carry. Empty array when there is nothing.',
    );
  }
  if (hasSection(prefs, 'pitfalls')) {
    parts.push(
      '"pitfalls": array of short notes on mistakes a learner predictably makes with this ' +
        'sentence — false friends, a particle they would get wrong, a pattern they would ' +
        'confuse with a similar one. Empty array when there is nothing.',
    );
  }
  if (prefs.customInstructions) {
    // Last, so an explicit instruction overrides the defaults above rather than
    // being overridden by them — this is the user's escape hatch.
    parts.push(`Additional instructions from the learner (follow these): ${prefs.customInstructions}`);
  }
  parts.push('Do not add fields that are not listed. Do not wrap the JSON in markdown.');
  return parts.join('\n\n');
}

/**
 * The annotation ask, kept separate because it carries the one constraint the
 * whole feature depends on: `text` must be a verbatim, non-overlapping substring
 * of the sentence. Anything else cannot be painted onto it.
 */
function buildAnnotationInstruction(
  lang: string,
  bands: string,
  prefs: SentenceAnalysisPrefs,
): string {
  const lines = [
    '"annotations": the heart of the response — the sentence cut into the pieces worth ' +
      'explaining, IN THE ORDER THEY APPEAR. Cover the whole sentence: every grammar point, ' +
      'every content word, every particle that does real work. Fields:',
    '  "text": the span copied EXACTLY, character for character, from the sentence above. ' +
      'It must appear verbatim in the sentence, and spans must NOT overlap each other. ' +
      'Do not normalize, re-space, or re-punctuate it — a span that is not an exact substring ' +
      'is discarded.',
    '  "category": one of "grammar" (a pattern or conjugation), "vocabulary" (a content ' +
      'word), "particle" (a grammatical particle or marker), "expression" (a set phrase or ' +
      'collocation), "idiom" (a figurative fixed phrase), "name" (a proper noun).',
    '  "headword": the citation form with its reading, e.g. 一つ一つが（ひとつひとつが）. ' +
      'Omit when the span is already in citation shape.',
    `  "reading": the span in ${readingInstruction(lang)}. Omit when it adds nothing.`,
    `  "level": one band from: ${bands}.`,
    '  "meaning": the meaning or grammatical function in one line, as it works HERE.',
    '  "explanation": the in-depth part — why this form, what it implies, what it contrasts ' +
      'with, when a learner should reach for it.',
  ];
  if (prefs.depth === 'brief') {
    // The depth guidance already leads the prompt, but the annotation list is
    // where a model most reliably over-writes, so it is repeated at the point of use.
    lines.push('  Keep "explanation" to a single sentence for every span.');
  }
  if (hasSection(prefs, 'examples')) {
    lines.push(
      '  "examples": one or two DIFFERENT sentences using the same point, each ' +
        '{"text", "translation"}. Empty array when an example would not help.',
    );
  }
  if (hasSection(prefs, 'vocabulary')) {
    lines.push(
      '  "vocabulary": sub-words inside this span worth calling out, each {"term", "reading", ' +
        '"gloss"}. Empty array when the span is a single word already covered by "meaning".',
    );
  }
  if (hasSection(prefs, 'formality')) {
    lines.push('  "formality": a register note for this span alone, only when it carries one.');
  }
  return lines.join('\n');
}

// ---- parse -----------------------------------------------------------------

function asString(v: unknown, max = 2000): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function asStringList(v: unknown, maxItems: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => asString(item, 600))
    .filter(Boolean)
    .slice(0, maxItems);
}

const MAX_ANNOTATIONS = 60;
const MAX_EXAMPLES = 3;
const MAX_VOCAB = 8;
const MAX_NOTES = 8;

function parseCategory(v: unknown): AnnotationCategory {
  const raw = asString(v, 20).toLowerCase();
  return (ANNOTATION_CATEGORIES as readonly string[]).includes(raw)
    ? (raw as AnnotationCategory)
    : 'vocabulary';
}

function parseExamples(v: unknown): AnnotationExample[] {
  if (!Array.isArray(v)) return [];
  const out: AnnotationExample[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    const text = asString(obj.text, 300);
    if (!text) continue;
    out.push({ text, translation: asString(obj.translation, 400) });
    if (out.length >= MAX_EXAMPLES) break;
  }
  return out;
}

function parseVocabulary(v: unknown): AnnotationVocabNote[] {
  if (!Array.isArray(v)) return [];
  const out: AnnotationVocabNote[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    const term = asString(obj.term, 60);
    const gloss = asString(obj.gloss, 300);
    if (!term || !gloss) continue;
    out.push({ term, reading: asString(obj.reading, 80) || undefined, gloss });
    if (out.length >= MAX_VOCAB) break;
  }
  return out;
}

function parseAnnotations(v: unknown): UnalignedAnnotation[] {
  if (!Array.isArray(v)) return [];
  const out: UnalignedAnnotation[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    // `text` is not trimmed: it has to stay a verbatim substring for alignment,
    // and trimming would break a span the model deliberately ended on a space.
    const text = typeof obj.text === 'string' ? obj.text.slice(0, 120) : '';
    const meaning = asString(obj.meaning, 400);
    if (!text || !meaning) continue;
    out.push({
      text,
      category: parseCategory(obj.category),
      headword: asString(obj.headword, 120) || undefined,
      reading: asString(obj.reading, 120) || undefined,
      level: asString(obj.level, 12) || undefined,
      meaning,
      explanation: asString(obj.explanation, 2000),
      examples: parseExamples(obj.examples),
      vocabulary: parseVocabulary(obj.vocabulary),
      formality: asString(obj.formality, 300) || undefined,
    });
    if (out.length >= MAX_ANNOTATIONS) break;
  }
  return out;
}

function parseTranslations(v: unknown): SentenceTranslations {
  if (!v || typeof v !== 'object') return {};
  const obj = v as Record<string, unknown>;
  return {
    en: asString(obj.en, 1200) || undefined,
    ja: asString(obj.ja, 1200) || undefined,
    zh: asString(obj.zh, 1200) || undefined,
  };
}

function parseFormality(v: unknown): SentenceFormality | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const obj = v as Record<string, unknown>;
  const level = asString(obj.level, 80);
  const note = asString(obj.note, 800);
  if (!level && !note) return undefined;
  return { level: level || note.slice(0, 80), note };
}

/**
 * Unwrap a ```json fence. DeepSeek's JSON mode is asked for an object and
 * usually returns bare JSON, but a fenced block still shows up often enough
 * that failing the whole analysis over it would be a self-inflicted error.
 */
function stripJsonFence(text: string): string {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text.trim());
  return fenced ? fenced[1] : text;
}

/**
 * Parse a provider response into an aligned, render-ready result.
 *
 * Every field is optional-by-construction: a provider that drops half the
 * schema still yields a renderable analysis rather than an exception, which
 * matters because this runs on a floating overlay where a thrown error would
 * leave the user with a blank panel and no way back.
 *
 * Throws only when there is no translation *and* nothing was annotated — at
 * that point there is genuinely nothing to show, and the caller should surface
 * a retry instead of an empty panel.
 */
export function parseSentenceAnalysis(raw: string, sentence: string): SentenceAnalysisResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(cleanLlmOutput(raw)));
  } catch {
    throw new Error('The AI returned malformed JSON. Try again.');
  }
  const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const normalized = normalizeAnalysisText(sentence);
  const translations = parseTranslations(obj.translations);
  const result: SentenceAnalysisResult = {
    sentence: normalized,
    translations,
    literal: asString(obj.literal, 1200) || undefined,
    formality: parseFormality(obj.formality),
    difficulty: asString(obj.difficulty, 12) || undefined,
    structure: asString(obj.structure, 2000) || undefined,
    annotations: alignAnnotations(normalized, parseAnnotations(obj.annotations)),
    nuance: asStringList(obj.nuance, MAX_NOTES),
    pitfalls: asStringList(obj.pitfalls, MAX_NOTES),
  };
  const hasTranslation = !!(translations.en || translations.ja || translations.zh);
  if (!hasTranslation && !result.annotations.length) {
    throw new Error('The AI returned an empty analysis. Try again.');
  }
  return result;
}

/**
 * Pick the translation to lead with for a reader whose UI is in `uiLang`,
 * skipping the sentence's own language — showing a Japanese learner the
 * Japanese paraphrase as the headline answer tells them nothing they can use.
 * The paraphrase is still available; it just is not the headline.
 */
export function primaryTranslation(
  result: SentenceAnalysisResult,
  uiLang: string,
  sourceLang: string,
): string {
  const { translations } = result;
  const order = [uiLang, 'en', 'ja', 'zh'].filter((code) => code !== sourceLang);
  for (const code of order) {
    const value = translations[code as keyof SentenceTranslations];
    if (value) return value;
  }
  return translations.en || translations.ja || translations.zh || '';
}

/**
 * Rough token budget for the call, expressed in the "item count" unit
 * aiProviderClient uses. Cost scales with how many spans the sentence has, and
 * every span carries an explanation, examples and vocabulary notes; the floor
 * keeps a short sentence from being cut off mid-annotation.
 */
export function analysisItemCount(sentence: string): number {
  const chars = normalizeAnalysisText(sentence).length;
  // CJK packs roughly one word per two characters; scripts with spaces are
  // counted the same way and simply land on a slightly generous budget.
  return Math.max(16, Math.min(48, Math.ceil(chars / 2)));
}
