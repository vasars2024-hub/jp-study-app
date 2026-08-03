export const MEDIA_STUDY_ASSISTANT_MODES = [
  'explain-dialogue',
  'explain-grammar',
  'simplify-japanese',
  'generate-examples',
  'create-study-notes',
] as const;

export type MediaStudyAssistantMode = (typeof MEDIA_STUDY_ASSISTANT_MODES)[number];

export interface MediaStudyAssistantRequest {
  mode: MediaStudyAssistantMode;
  text: string;
  context?: string;
  jlptLevel?: string | null;
}

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

const MODE_INSTRUCTIONS: Record<MediaStudyAssistantMode, string> = {
  'explain-dialogue': 'Explain the dialogue naturally, including implied meaning, tone, and character register.',
  'explain-grammar': 'Focus on grammar structure, particles, conjugation, omitted elements, and likely JLPT levels.',
  'simplify-japanese': 'Rewrite the line in simpler natural Japanese while preserving meaning, then explain the changes.',
  'generate-examples': 'Generate three short natural example sentences that reuse the most useful vocabulary or grammar.',
  'create-study-notes': 'Create concise study notes suitable for later review, prioritizing memorable vocabulary and grammar.',
};

export function isMediaStudyAssistantMode(value: unknown): value is MediaStudyAssistantMode {
  return typeof value === 'string' && (MEDIA_STUDY_ASSISTANT_MODES as readonly string[]).includes(value);
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
  };
}

export function buildMediaStudyAssistantPrompt(request: MediaStudyAssistantRequest): string {
  const normalized = normalizeMediaStudyAssistantRequest(request);
  if (!normalized) throw new Error('A valid Japanese sentence and assistant mode are required.');
  return [
    'You are an optional Japanese immersion study assistant.',
    'Analyze only the supplied Japanese. Be concise, accurate, and useful to a learner.',
    `Task: ${MODE_INSTRUCTIONS[normalized.mode]}`,
    `Japanese: ${normalized.text}`,
    normalized.context ? `Media context: ${normalized.context}` : '',
    normalized.jlptLevel ? `Estimated content level: ${normalized.jlptLevel}` : '',
    'Return JSON matching the supplied schema. Use English for explanations and translations.',
    'Always fill every field; use empty arrays or empty strings when a field is not relevant.',
    'Do not invent plot facts that are not present in the supplied text or context.',
  ].filter(Boolean).join('\n');
}

const clean = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

export function parseMediaStudyAssistantResult(
  raw: string,
  mode: MediaStudyAssistantMode,
): MediaStudyAssistantResult {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
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
