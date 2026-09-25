// The request half of the workbench's AI additions — ANKI_DECK_WORKBENCH_PLAN.md
// gate 12, the generation side of `ankiAiAdditions.ts`'s review side.
//
// What goes on the wire, what comes back, and what the user is told before any
// of it happens. The plan's exclusions forbid "AI translation or generation
// without visible provider/privacy/cost state and a reviewed diff", so the
// disclosure below is not decoration: `describeAiAdditionsDisclosure` is the
// thing a caller must render before it is allowed to spend the user's money.
//
// Three decisions this module encodes:
//
// **Notes are addressed by index, not by note id.** The provider is asked about
// word 1..n and answers about 1..n. A note id is the user's data and means
// nothing to a model; sending it would leak an identifier for no benefit and
// invite the model to invent one. An index outside the requested range is
// dropped rather than guessed at.
//
// **The gloss is opt-in, and the normalizer enforces it.** Sending the note's
// own meaning field produces better sentences and sends more of the user's deck
// to a third party, so it is a visible choice. `normalizeAiAdditionsRequest`
// strips every gloss when the flag is off, which means a UI that forgets to
// clear them still cannot leak them.
//
// **An unpriced provider reports no cost, never zero.** `agentProviderPricing`
// already refuses to guess; a `$0.00` next to a request that will be billed is
// worse than an honest "not known".

import { estimateAgentProviderCostUsd, agentEstimatedTokens, type AgentProviderPricingTable } from './agentProviderPricing';
import { AI_PROVIDERS, providerById, providerKeyBucket, type AiProviderId } from './aiProviders';
import type { AiAdditionKind } from './ankiAiAdditions';
import { normalizeStudyLang, type StudyLang } from './studyLang';

/** Notes per provider request. Chunked so a cancel lands between calls, not after all of them. */
export const AI_ADDITIONS_CHUNK_SIZE = 8;
/** The largest selection one generation run may request, across all chunks. */
export const AI_ADDITIONS_MAX_NOTES = 200;
export const AI_ADDITIONS_MIN_VARIANTS = 1;
export const AI_ADDITIONS_MAX_VARIANTS = 4;
/** Characters of a term or gloss that reach the prompt. */
const FIELD_CHARS = 200;

export interface AiAdditionRequestNote {
  noteId: string;
  term: string;
  /** The note's own meaning text. Present only when `sendGloss` is on. */
  gloss?: string;
}

export interface AiAdditionsRequest {
  kind: AiAdditionKind;
  notes: AiAdditionRequestNote[];
  /** How many alternatives to ask for per note. The review then picks one. */
  variantCount: number;
  /** Whether the note's meaning field is sent alongside the word. See the module note. */
  sendGloss: boolean;
  /** Language for the explanatory kinds. Study-language output is in the study language regardless. */
  explainLanguage: string;
  /** The deck's language: example sentences are written in it. Japanese when omitted. */
  studyLang?: StudyLang;
}

/** English names the model is told, per study language. */
const STUDY_LANG_ENGLISH: Readonly<Record<StudyLang, string>> = {
  ja: 'Japanese',
  zh: 'Chinese (Mandarin)',
  ru: 'Russian',
};

export const AI_ADDITIONS_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          variants: { type: 'array', items: { type: 'string' } },
        },
        required: ['index', 'variants'],
      },
    },
  },
  required: ['results'],
} as const;

const KIND_INSTRUCTIONS: Record<AiAdditionKind, (language: string) => string> = {
  'example-sentence': (language) =>
    `Write one natural ${language} sentence that uses the word, short enough for a flashcard and unambiguous about the word's meaning.`,
  'sentence-translation': (language) =>
    `Write a natural translation of a short ${language} sentence that uses the word, giving the sentence and its translation on one line separated by " — ".`,
  definition: () =>
    'Write one concise definition of the word, in the requested explanation language, without repeating the word itself as the whole definition.',
  mnemonic: () =>
    'Write one short memory aid for the word\'s form or meaning. Concrete and visual beats clever.',
  'usage-note': () =>
    'Write one short note on register, nuance, or when the word would be the wrong choice.',
  hint: () => 'Write one short clue that helps recall the word without containing the word or its reading.',
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, FIELD_CHARS) : '';
}

export function isAiAdditionKind(value: unknown): value is AiAdditionKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(KIND_INSTRUCTIONS, value);
}

/**
 * The request as it may actually be sent, or `null` when there is nothing to
 * ask. Notes without a word are dropped here rather than sent as a blank
 * question — a variant generated for an empty term answers about nothing.
 */
export function normalizeAiAdditionsRequest(value: unknown): AiAdditionsRequest | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<AiAdditionsRequest>;
  if (!isAiAdditionKind(raw.kind)) return null;
  const sendGloss = raw.sendGloss === true;
  const notes: AiAdditionRequestNote[] = [];
  for (const entry of Array.isArray(raw.notes) ? raw.notes : []) {
    if (!entry || typeof entry !== 'object') continue;
    const note = entry as Partial<AiAdditionRequestNote>;
    const noteId = typeof note.noteId === 'string' ? note.noteId : '';
    const term = text(note.term);
    if (!noteId || !term) continue;
    // The privacy flag is enforced here, not at the call site — see the module note.
    const gloss = sendGloss ? text(note.gloss) : '';
    notes.push(gloss ? { noteId, term, gloss } : { noteId, term });
    if (notes.length >= AI_ADDITIONS_MAX_NOTES) break;
  }
  if (notes.length === 0) return null;
  const requested = typeof raw.variantCount === 'number' && Number.isFinite(raw.variantCount)
    ? Math.round(raw.variantCount)
    : AI_ADDITIONS_MIN_VARIANTS;
  return {
    kind: raw.kind,
    notes,
    variantCount: Math.min(AI_ADDITIONS_MAX_VARIANTS, Math.max(AI_ADDITIONS_MIN_VARIANTS, requested)),
    sendGloss,
    explainLanguage: typeof raw.explainLanguage === 'string' && raw.explainLanguage.trim()
      ? raw.explainLanguage.trim().slice(0, 16)
      : 'en',
    studyLang: normalizeStudyLang(raw.studyLang),
  };
}

/**
 * The prompt for one chunk. `notes` is the chunk, and the indices it numbers are
 * chunk-relative — the caller maps them back, so a chunk that fails takes no
 * other chunk's answers with it.
 */
export function buildAiAdditionsPrompt(
  request: AiAdditionsRequest,
  notes: ReadonlyArray<AiAdditionRequestNote>,
): string {
  const lines = notes.map((note, index) => (
    note.gloss ? `${index + 1}. ${note.term} (${note.gloss})` : `${index + 1}. ${note.term}`
  ));
  return [
    `You generate study material for ${STUDY_LANG_ENGLISH[request.studyLang ?? 'ja']} flashcards.`,
    `Task for every word: ${KIND_INSTRUCTIONS[request.kind](STUDY_LANG_ENGLISH[request.studyLang ?? 'ja'])}`,
    `Give exactly ${request.variantCount} distinct alternative(s) per word; a user picks one.`,
    `Explanations and translations use language code: ${request.explainLanguage}.`,
    'Words:',
    ...lines,
    'Return JSON matching the supplied schema, with one result per numbered word, using that same number as "index".',
    'Do not add commentary, numbering, or quotation marks inside a variant.',
    'If you cannot answer for a word, return that index with an empty variants array rather than inventing one.',
  ].join('\n');
}

export interface AiAdditionAnswer {
  noteId: string;
  variants: string[];
}

/**
 * Map a provider response back onto the chunk that produced it.
 *
 * Every requested note appears in the result exactly once, with an empty
 * `variants` for the ones the model skipped — the caller turns those into
 * `failed`, because a note the provider did not answer for is not a note the
 * user reviewed. An index outside the chunk is dropped: it names a word this
 * request never asked about.
 */
export function parseAiAdditionsResponse(
  raw: string,
  notes: ReadonlyArray<AiAdditionRequestNote>,
  variantCount: number,
): AiAdditionAnswer[] {
  const byIndex = new Map<number, string[]>();
  const parsed = JSON.parse(raw) as { results?: unknown };
  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  for (const entry of results) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as { index?: unknown; variants?: unknown };
    const index = typeof row.index === 'number' ? Math.round(row.index) : NaN;
    if (!Number.isFinite(index) || index < 1 || index > notes.length) continue;
    if (byIndex.has(index)) continue;
    const variants: string[] = [];
    for (const variant of Array.isArray(row.variants) ? row.variants : []) {
      const value = typeof variant === 'string' ? variant.trim() : '';
      if (!value || variants.includes(value)) continue;
      variants.push(value);
      if (variants.length >= Math.max(1, variantCount)) break;
    }
    byIndex.set(index, variants);
  }
  return notes.map((note, index) => ({
    noteId: note.noteId,
    variants: byIndex.get(index + 1) ?? [],
  }));
}

// ----- what the generation run reports back -----------------------------------

/** One note's outcome, in the shape `recordAiResult` consumes. */
export type AiAdditionsNoteResult =
  | { noteId: string; ok: true; variants: string[] }
  | { noteId: string; ok: false; error: string };

export interface AiAdditionsRunResult {
  ok: boolean;
  batchId: string;
  /** The key bucket that received the request; empty when nothing was sent. */
  provider: string;
  model: string;
  results: AiAdditionsNoteResult[];
  /** True when the run stopped early; the notes it never reached are simply absent. */
  cancelled: boolean;
  /** Set only when nothing ran at all. Never a translated string. */
  error?: string;
}

// ----- what the user is told before the run -----------------------------------

/**
 * A field name that leaves the machine, as a translation key suffix. The list is
 * what the disclosure prints, so it must stay exactly what the prompt builder
 * actually writes.
 */
export type AiAdditionsSentField = 'term' | 'gloss';

export interface AiAdditionsDisclosure {
  /** The key bucket, i.e. the company that receives the request. */
  provider: string;
  /** The model id, which is also the provider id this app routes on. */
  model: string;
  providerLabel: string;
  noteCount: number;
  requests: number;
  sent: AiAdditionsSentField[];
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  /** Absent when the user has entered no price for this provider. Never zero as a stand-in. */
  estimatedCostUsd?: number;
}

/** Output-token allowance per variant. A flashcard line, not an essay. */
const OUTPUT_TOKENS_PER_VARIANT = 40;

/**
 * Everything the user must see before the first request goes out: who receives
 * it, which of their fields it contains, how many calls it is, and what it may
 * cost.
 */
export function describeAiAdditionsDisclosure(
  request: AiAdditionsRequest,
  providerId: AiProviderId,
  pricing?: AgentProviderPricingTable,
): AiAdditionsDisclosure {
  const definition = providerById(providerId);
  const chunks: AiAdditionRequestNote[][] = [];
  for (let i = 0; i < request.notes.length; i += AI_ADDITIONS_CHUNK_SIZE) {
    chunks.push(request.notes.slice(i, i + AI_ADDITIONS_CHUNK_SIZE));
  }
  const chars = chunks.reduce((sum, chunk) => sum + buildAiAdditionsPrompt(request, chunk).length, 0);
  const estimatedInputTokens = agentEstimatedTokens(chars);
  const estimatedOutputTokens = Math.max(
    1,
    request.notes.length * request.variantCount * OUTPUT_TOKENS_PER_VARIANT,
  );
  const sent: AiAdditionsSentField[] = request.notes.some((note) => note.gloss)
    ? ['term', 'gloss']
    : ['term'];
  return {
    provider: providerKeyBucket(providerId),
    model: providerId,
    providerLabel: definition.label,
    noteCount: request.notes.length,
    requests: chunks.length,
    sent,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedCostUsd: estimateAgentProviderCostUsd(
      estimatedInputTokens,
      estimatedOutputTokens,
      pricing?.[providerId],
    ),
  };
}

/** Whether an id names a provider this app can route a generation to. */
export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && AI_PROVIDERS.some((provider) => provider.id === value);
}
