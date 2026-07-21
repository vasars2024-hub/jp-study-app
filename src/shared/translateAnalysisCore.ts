// Pure schema/prompt/parse helpers for the Translate view's linguistic-analysis
// panels (formality variants, Japanese particle notes, Russian declension,
// Chinese measure words / aspect particles). No Electron or Node dependencies —
// mirrors translateCore.ts so everything here is unit-testable.

import { langLabel } from './langs';
import { cleanLlmOutput } from './translateCore';

export type RussianCase =
  | 'nominative'
  | 'genitive'
  | 'dative'
  | 'accusative'
  | 'instrumental'
  | 'prepositional';

export const RUSSIAN_CASES: readonly RussianCase[] = [
  'nominative',
  'genitive',
  'dative',
  'accusative',
  'instrumental',
  'prepositional',
];

export interface FormalityVariants {
  casual: string;
  polite: string;
  businessSafe: string;
}

export interface DeclensionItem {
  word: string;
  dictionaryForm: string;
  pos: 'noun' | 'adjective' | 'pronoun' | 'numeral' | 'verb';
  gender?: 'masculine' | 'feminine' | 'neuter' | 'plural-only';
  caseUsed?: RussianCase;
  singular?: Partial<Record<RussianCase, string>>;
  plural?: Partial<Record<RussianCase, string>>;
  verbAspect?: 'perfective' | 'imperfective';
  verbTense?: 'past' | 'present' | 'future';
  /** Past-tense gender/number agreement, e.g. "feminine singular (-ла)". */
  verbAgreement?: string;
}

export interface MeasureWordItem {
  noun: string;
  classifier: string;
  pinyin: string;
  reason: string;
}

export interface AspectNoteItem {
  particle: '了' | '着' | '过';
  afterWord: string;
  reason: string;
}

export interface TranslateAnalysisResult {
  formality?: FormalityVariants;
  /** Parallel array, aligned to the request's jaParticleTokens order. */
  particleNotes?: string[];
  declension?: DeclensionItem[];
  measureWords?: MeasureWordItem[];
  aspectNotes?: AspectNoteItem[];
}

export interface AnalysisFlags {
  formality: boolean;
  particlesJa: boolean;
  declensionRu: boolean;
  measureWordZh: boolean;
}

export interface TranslateAnalyzeRequest {
  sourceText: string;
  translatedText: string;
  source: string;
  target: string;
  /** Ordered particle surface forms, computed offline by the renderer. */
  jaParticleTokens?: string[];
}

export function computeAnalysisFlags(source: string, target: string): AnalysisFlags {
  return {
    formality: true,
    particlesJa: source === 'ja' || target === 'ja',
    declensionRu: target === 'ru',
    measureWordZh: target === 'zh',
  };
}

// ----- schema -------------------------------------------------------------
// Built in the Gemini responseSchema dialect (type/properties/items/enum) —
// the same subset mining.ts's buildSchema uses; DeepSeek receives it as a
// JSON-text hint instead.

const FORMALITY_SCHEMA = {
  type: 'object',
  properties: {
    casual: { type: 'string' },
    polite: { type: 'string' },
    businessSafe: { type: 'string' },
  },
  required: ['casual', 'polite', 'businessSafe'],
};

const CASE_FORMS_SCHEMA = {
  type: 'object',
  properties: {
    nominative: { type: 'string' },
    genitive: { type: 'string' },
    dative: { type: 'string' },
    accusative: { type: 'string' },
    instrumental: { type: 'string' },
    prepositional: { type: 'string' },
  },
};

const DECLENSION_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      word: { type: 'string' },
      dictionaryForm: { type: 'string' },
      pos: { type: 'string', enum: ['noun', 'adjective', 'pronoun', 'numeral', 'verb'] },
      gender: { type: 'string', enum: ['masculine', 'feminine', 'neuter', 'plural-only'] },
      caseUsed: {
        type: 'string',
        enum: ['nominative', 'genitive', 'dative', 'accusative', 'instrumental', 'prepositional'],
      },
      singular: CASE_FORMS_SCHEMA,
      plural: CASE_FORMS_SCHEMA,
      verbAspect: { type: 'string', enum: ['perfective', 'imperfective'] },
      verbTense: { type: 'string', enum: ['past', 'present', 'future'] },
      verbAgreement: { type: 'string' },
    },
    required: ['word', 'dictionaryForm', 'pos'],
  },
};

const MEASURE_WORDS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      noun: { type: 'string' },
      classifier: { type: 'string' },
      pinyin: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['noun', 'classifier', 'pinyin', 'reason'],
  },
};

const ASPECT_NOTES_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      particle: { type: 'string', enum: ['了', '着', '过'] },
      afterWord: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['particle', 'afterWord', 'reason'],
  },
};

export function buildAnalysisSchema(flags: AnalysisFlags): unknown {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  if (flags.formality) {
    properties.formality = FORMALITY_SCHEMA;
    required.push('formality');
  }
  if (flags.particlesJa) {
    properties.particleNotes = { type: 'array', items: { type: 'string' } };
  }
  if (flags.declensionRu) {
    properties.declension = DECLENSION_SCHEMA;
  }
  if (flags.measureWordZh) {
    properties.measureWords = MEASURE_WORDS_SCHEMA;
    properties.aspectNotes = ASPECT_NOTES_SCHEMA;
  }
  return { type: 'object', properties, required };
}

// ----- prompt ---------------------------------------------------------------

export function buildAnalysisPrompt(req: TranslateAnalyzeRequest, flags: AnalysisFlags): string {
  const source = langLabel(req.source);
  const target = langLabel(req.target);
  const jaText = req.source === 'ja' ? req.sourceText : req.translatedText;
  const parts: string[] = [
    `You are a linguistics tutor. A ${source} sentence was translated into ${target}.`,
    `${source} sentence: ${req.sourceText}`,
    `${target} translation: ${req.translatedText}`,
    'Return a single JSON object with the fields described below. Do not add other fields.',
  ];
  if (flags.formality) {
    parts.push(
      `"formality": rewrite the ${target} translation in three registers — ` +
        '"casual" (friends/family), "polite" (neutral, safe with strangers), and ' +
        '"businessSafe" (formal business writing). Keep the meaning identical; each value is the full sentence.',
    );
  }
  if (flags.particlesJa) {
    const tokens = req.jaParticleTokens ?? [];
    if (tokens.length) {
      parts.push(
        `"particleNotes": the Japanese sentence (${jaText}) contains these grammatical particles in order: ` +
          tokens.map((t, i) => `${i + 1}. ${t}`).join(' ') +
          `. Return an array of exactly ${tokens.length} strings, one per particle in the same order, ` +
          'each briefly explaining (in English) what that particle does in THIS sentence — ' +
          'e.g. topic vs. subject emphasis, direction, means, contrast.',
      );
    } else {
      parts.push('"particleNotes": return an empty array (no particles were detected).');
    }
  }
  if (flags.declensionRu) {
    parts.push(
      '"declension": for each declinable word in the Russian translation (nouns, adjectives, pronouns, numerals) ' +
        'and each verb, return an object with "word" (form used in the sentence), "dictionaryForm", "pos". ' +
        'For declinables add "gender", "caseUsed", and full "singular"/"plural" case tables ' +
        '(nominative, genitive, dative, accusative, instrumental, prepositional). ' +
        'For verbs add "verbAspect", "verbTense", and "verbAgreement" (gender/number agreement, e.g. "feminine singular (-ла)"). ' +
        'Skip words that never decline.',
    );
  }
  if (flags.measureWordZh) {
    parts.push(
      '"measureWords": for each countable noun in the Chinese translation, return {"noun", "classifier", "pinyin", "reason"} ' +
        'giving the correct measure word (e.g. 只 vs 条) with the classifier\'s pinyin and a one-line reason for the choice.',
      '"aspectNotes": for each aspect particle 了/着/过 present (or clearly needed) in the Chinese translation, ' +
        'return {"particle", "afterWord", "reason"} explaining the aspectual meaning. Empty array if none apply.',
    );
  }
  return parts.join('\n\n');
}

// ----- parse ----------------------------------------------------------------

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function parseFormality(v: unknown): FormalityVariants | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const obj = v as Record<string, unknown>;
  const casual = asString(obj.casual);
  const polite = asString(obj.polite);
  const businessSafe = asString(obj.businessSafe);
  if (!casual || !polite || !businessSafe) return undefined;
  return { casual, polite, businessSafe };
}

function parseParticleNotes(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const notes = v.map(asString);
  return notes.some(Boolean) ? notes : undefined;
}

function parseCaseForms(v: unknown): Partial<Record<RussianCase, string>> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const obj = v as Record<string, unknown>;
  const out: Partial<Record<RussianCase, string>> = {};
  let any = false;
  for (const c of RUSSIAN_CASES) {
    const form = asString(obj[c]);
    if (form) {
      out[c] = form;
      any = true;
    }
  }
  return any ? out : undefined;
}

const DECLENSION_POS = ['noun', 'adjective', 'pronoun', 'numeral', 'verb'];
const GENDERS = ['masculine', 'feminine', 'neuter', 'plural-only'];
const VERB_ASPECTS = ['perfective', 'imperfective'];
const VERB_TENSES = ['past', 'present', 'future'];

function parseDeclension(v: unknown): DeclensionItem[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const items: DeclensionItem[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    const word = asString(obj.word);
    const dictionaryForm = asString(obj.dictionaryForm);
    const pos = asString(obj.pos);
    if (!word || !dictionaryForm || !DECLENSION_POS.includes(pos)) continue;
    const item: DeclensionItem = {
      word,
      dictionaryForm,
      pos: pos as DeclensionItem['pos'],
    };
    const gender = asString(obj.gender);
    if (GENDERS.includes(gender)) item.gender = gender as DeclensionItem['gender'];
    const caseUsed = asString(obj.caseUsed);
    if ((RUSSIAN_CASES as readonly string[]).includes(caseUsed)) item.caseUsed = caseUsed as RussianCase;
    const singular = parseCaseForms(obj.singular);
    if (singular) item.singular = singular;
    const plural = parseCaseForms(obj.plural);
    if (plural) item.plural = plural;
    const verbAspect = asString(obj.verbAspect);
    if (VERB_ASPECTS.includes(verbAspect)) item.verbAspect = verbAspect as DeclensionItem['verbAspect'];
    const verbTense = asString(obj.verbTense);
    if (VERB_TENSES.includes(verbTense)) item.verbTense = verbTense as DeclensionItem['verbTense'];
    const verbAgreement = asString(obj.verbAgreement);
    if (verbAgreement) item.verbAgreement = verbAgreement;
    items.push(item);
  }
  return items.length ? items : undefined;
}

function parseMeasureWords(v: unknown): MeasureWordItem[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const items: MeasureWordItem[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    const noun = asString(obj.noun);
    const classifier = asString(obj.classifier);
    if (!noun || !classifier) continue;
    items.push({ noun, classifier, pinyin: asString(obj.pinyin), reason: asString(obj.reason) });
  }
  return items.length ? items : undefined;
}

const ASPECT_PARTICLES = ['了', '着', '过'];

function parseAspectNotes(v: unknown): AspectNoteItem[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const items: AspectNoteItem[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    const particle = asString(obj.particle);
    if (!ASPECT_PARTICLES.includes(particle)) continue;
    items.push({
      particle: particle as AspectNoteItem['particle'],
      afterWord: asString(obj.afterWord),
      reason: asString(obj.reason),
    });
  }
  return items.length ? items : undefined;
}

/**
 * Tolerant parse: malformed JSON yields {}, and each field is validated
 * independently — a bad field is omitted, never thrown on.
 */
export function parseAnalysisResponse(raw: string, flags: AnalysisFlags): TranslateAnalysisResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanLlmOutput(raw));
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};
  const obj = parsed as Record<string, unknown>;
  const result: TranslateAnalysisResult = {};
  if (flags.formality) {
    const formality = parseFormality(obj.formality);
    if (formality) result.formality = formality;
  }
  if (flags.particlesJa) {
    const particleNotes = parseParticleNotes(obj.particleNotes);
    if (particleNotes) result.particleNotes = particleNotes;
  }
  if (flags.declensionRu) {
    const declension = parseDeclension(obj.declension);
    if (declension) result.declension = declension;
  }
  if (flags.measureWordZh) {
    const measureWords = parseMeasureWords(obj.measureWords);
    if (measureWords) result.measureWords = measureWords;
    const aspectNotes = parseAspectNotes(obj.aspectNotes);
    if (aspectNotes) result.aspectNotes = aspectNotes;
  }
  return result;
}
