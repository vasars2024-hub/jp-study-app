export const MEDIA_STUDY_ASSISTANT_MODES = [
  'explain-dialogue',
  'explain-grammar',
  'simplify-japanese',
  'generate-examples',
  'create-study-notes',
] as const;

export type MediaStudyAssistantMode = (typeof MEDIA_STUDY_ASSISTANT_MODES)[number];

/** The language being studied, which decides the prompt template. */
export type MediaStudyAssistantStudyLang = 'ja' | 'zh' | 'ru';

/** The language explanations and translations are written in: the UI language. */
export type MediaStudyAssistantAnswerLang = 'en' | 'ja' | 'zh' | 'ru';

export interface MediaStudyAssistantRequest {
  mode: MediaStudyAssistantMode;
  text: string;
  context?: string;
  jlptLevel?: string | null;
  /** Defaults to `ja` (what every request meant before the field existed). */
  studyLang?: MediaStudyAssistantStudyLang;
  /** Defaults to `en`. */
  answerLang?: MediaStudyAssistantAnswerLang;
  /** Skip the cache (the answer still refreshes it): "ask again". */
  refresh?: boolean;
}

/**
 * Bumped whenever the prompt or the parse changes. Part of the assistant's cache
 * key (main/mediaStudyAssistant.ts), so an answer cached under an older prompt
 * is asked for again instead of served forever.
 *
 * 3: per-study-language templates and an answer language.
 */
export const MEDIA_STUDY_ASSISTANT_PROMPT_VERSION = 3;

export interface MediaStudyAssistantResult {
  mode: MediaStudyAssistantMode;
  summary: string;
  translation: string;
  simplifiedJapanese: string;
  grammar: Array<{ pattern: string; explanation: string; level: string }>;
  vocabulary: Array<{ word: string; reading: string; meaning: string }>;
  examples: Array<{ japanese: string; translation: string }>;
  notes: string[];
}

export const MEDIA_STUDY_ASSISTANT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    translation: { type: 'string' },
    simplifiedJapanese: { type: 'string' },
    grammar: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          explanation: { type: 'string' },
          level: { type: 'string' },
        },
        required: ['pattern', 'explanation', 'level'],
      },
    },
    vocabulary: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          word: { type: 'string' },
          reading: { type: 'string' },
          meaning: { type: 'string' },
        },
        required: ['word', 'reading', 'meaning'],
      },
    },
    examples: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          japanese: { type: 'string' },
          translation: { type: 'string' },
        },
        required: ['japanese', 'translation'],
      },
    },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'summary',
    'translation',
    'simplifiedJapanese',
    'grammar',
    'vocabulary',
    'examples',
    'notes',
  ],
} as const;

/**
 * One template per study language. The prompt used to hard-code Japanese (and
 * JLPT, particles, kana) for every learner, so a Chinese learner's line was
 * analysed as if it were Japanese (audit E6). The schema keys keep their old
 * names (`simplifiedJapanese`, `examples[].japanese`) because they are stored
 * in caches and notes; the prompt says what goes in them.
 */
interface StudyLanguageTemplate {
  name: string;
  levelScale: string;
  grammarFocus: string;
  readingNote: string;
}

const STUDY_LANGUAGE_TEMPLATES: Record<MediaStudyAssistantStudyLang, StudyLanguageTemplate> = {
  ja: {
    name: 'Japanese',
    levelScale: 'JLPT (N5-N1)',
    grammarFocus: 'particles, conjugation, politeness and register (keigo), and omitted subjects or objects',
    readingNote: 'Give readings in kana.',
  },
  zh: {
    name: 'Chinese',
    levelScale: 'HSK (1-6)',
    grammarFocus: 'word order, measure words, aspect particles (了, 过, 着), complements, and sentence-final particles',
    readingNote: 'Give readings in pinyin with tone marks.',
  },
  ru: {
    name: 'Russian',
    levelScale: 'CEFR (A1-C2)',
    grammarFocus: 'case endings, verb aspect, motion verbs, and word order',
    readingNote: 'Mark word stress in readings.',
  },
};

const ANSWER_LANGUAGE_NAMES: Record<MediaStudyAssistantAnswerLang, string> = {
  en: 'English',
  ja: 'Japanese',
  zh: 'Simplified Chinese',
  ru: 'Russian',
};

function modeInstruction(mode: MediaStudyAssistantMode, lang: StudyLanguageTemplate): string {
  switch (mode) {
    case 'explain-dialogue':
      return 'Explain the dialogue naturally, including implied meaning, tone, and character register.';
    case 'explain-grammar':
      return `Focus on grammar structure — ${lang.grammarFocus} — and likely ${lang.levelScale} levels.`;
    case 'simplify-japanese':
      return `Rewrite the line in simpler natural ${lang.name} while preserving meaning, put it in "simplifiedJapanese", then explain the changes.`;
    case 'generate-examples':
      return `Generate three short natural ${lang.name} example sentences (in "examples[].japanese") that reuse the most useful vocabulary or grammar.`;
    case 'create-study-notes':
      return 'Create concise study notes suitable for later review, prioritizing memorable vocabulary and grammar.';
    default:
      return '';
  }
}

export function isMediaStudyAssistantMode(value: unknown): value is MediaStudyAssistantMode {
  return typeof value === 'string' && (MEDIA_STUDY_ASSISTANT_MODES as readonly string[]).includes(value);
}

function studyLangOf(value: unknown): MediaStudyAssistantStudyLang {
  return value === 'zh' || value === 'ru' ? value : 'ja';
}

function answerLangOf(value: unknown): MediaStudyAssistantAnswerLang {
  return value === 'ja' || value === 'zh' || value === 'ru' ? value : 'en';
}

export function normalizeMediaStudyAssistantRequest(value: unknown): MediaStudyAssistantRequest | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<MediaStudyAssistantRequest>;
  if (!isMediaStudyAssistantMode(raw.mode) || typeof raw.text !== 'string') return null;
  const text = raw.text.trim().slice(0, 4000);
  if (!text) return null;
  return {
    mode: raw.mode,
    text,
    context: typeof raw.context === 'string' ? raw.context.trim().slice(0, 4000) : '',
    jlptLevel: typeof raw.jlptLevel === 'string' && raw.jlptLevel.trim()
      ? raw.jlptLevel.trim()
      : null,
    studyLang: studyLangOf(raw.studyLang),
    answerLang: answerLangOf(raw.answerLang),
    ...(raw.refresh === true ? { refresh: true } : {}),
  };
}

export function buildMediaStudyAssistantPrompt(request: MediaStudyAssistantRequest): string {
  const normalized = normalizeMediaStudyAssistantRequest(request);
  if (!normalized) throw new Error('A valid sentence and assistant mode are required.');
  const lang = STUDY_LANGUAGE_TEMPLATES[studyLangOf(normalized.studyLang)];
  const answer = ANSWER_LANGUAGE_NAMES[answerLangOf(normalized.answerLang)];
  return [
    `You are an optional ${lang.name} immersion study assistant.`,
    `Analyze only the supplied ${lang.name}. Be concise, accurate, and useful to a learner.`,
    `Task: ${modeInstruction(normalized.mode, lang)}`,
    `${lang.name}: ${normalized.text}`,
    normalized.context ? `Media context: ${normalized.context}` : '',
    normalized.jlptLevel ? `Estimated content level: ${normalized.jlptLevel}` : '',
    lang.readingNote,
    `Return JSON matching the supplied schema. Write summaries, explanations, meanings, notes and translations in ${answer}; keep the ${lang.name} itself in ${lang.name}.`,
    'Always fill every field; use empty arrays or empty strings when a field is not relevant.',
    'Do not invent plot facts that are not present in the supplied text or context.',
  ].filter(Boolean).join('\n');
}

const clean = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

export function parseMediaStudyAssistantResult(
  raw: string,
  mode: MediaStudyAssistantMode,
): MediaStudyAssistantResult {
  let parsed: Record<string, unknown>;
  try {
    const text = raw.trim();
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
    const value: unknown = JSON.parse(fenced ? fenced[1] : text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    parsed = value as Record<string, unknown>;
  } catch {
    // Coded, so the panel says it in the UI language; never cached.
    throw Object.assign(new Error('The AI returned malformed JSON.'), { code: 'invalid' });
  }
  const objects = (value: unknown): Record<string, unknown>[] => (
    Array.isArray(value)
      ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
      : []
  );
  return {
    mode,
    summary: clean(parsed.summary),
    translation: clean(parsed.translation),
    simplifiedJapanese: clean(parsed.simplifiedJapanese),
    grammar: objects(parsed.grammar).slice(0, 12).map((entry) => ({
      pattern: clean(entry.pattern),
      explanation: clean(entry.explanation),
      level: clean(entry.level),
    })).filter((entry) => entry.pattern || entry.explanation),
    vocabulary: objects(parsed.vocabulary).slice(0, 20).map((entry) => ({
      word: clean(entry.word),
      reading: clean(entry.reading),
      meaning: clean(entry.meaning),
    })).filter((entry) => entry.word),
    examples: objects(parsed.examples).slice(0, 8).map((entry) => ({
      japanese: clean(entry.japanese),
      translation: clean(entry.translation),
    })).filter((entry) => entry.japanese),
    notes: Array.isArray(parsed.notes) ? parsed.notes.map(clean).filter(Boolean).slice(0, 20) : [],
  };
}

/**
 * Whether an answer holds what its mode asked for. Only a complete answer is
 * cached: a reply with every field empty (which the schema still accepts) used
 * to be stored and served for that line forever.
 */
export function isCompleteMediaStudyAssistantResult(result: MediaStudyAssistantResult): boolean {
  if (!result.summary && !result.translation) return false;
  switch (result.mode) {
    case 'simplify-japanese':
      return Boolean(result.simplifiedJapanese);
    case 'generate-examples':
      return result.examples.length > 0;
    case 'explain-grammar':
      return result.grammar.length > 0;
    case 'create-study-notes':
      return result.notes.length > 0 || result.vocabulary.length > 0;
    default:
      return true;
  }
}