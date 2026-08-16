// Field translation for the Deck Workbench — ANKI_DECK_WORKBENCH_PLAN.md gate 2
// ("translate a Back field to Russian or Japanese into a selected destination
// field, preview individual diffs and provider implications, cancel safely,
// then apply and verify") and recipe 2, which adds "while retaining the
// original".
//
// This is the request half only. The review, the cancel and the write are
// already built and proven for gate 12, so a translation deliberately reuses
// them: `ankiAiAdditions.ts`'s batch holds the proposals, and the
// `apply-ai-additions` tray action writes the approved one into the chosen
// destination field with the chosen conflict rule. A translation is a different
// question to ask a provider, not a different way to review or write an answer.
//
// Four decisions this module encodes:
//
// **What leaves the machine is named by name.** Gate 12's disclosure could say
// "term" and "gloss" because that is all it ever sent. A translation sends a
// whole field's prose for every selected note — far more of the user's deck —
// so the disclosure carries the field's own name and the exact character count,
// not a category.
//
// **The original is retained by construction, not by hope.** Recipe 2 requires
// it, so a destination equal to the source is a blocking problem
// (`same-field`), refused before any request is built. There is no conflict
// rule that makes overwriting the only copy of the source acceptable here.
//
// **A cloze source is refused, never translated.** A model asked to translate
// `{{c1::猫}}が寝ている` will move, duplicate or drop the marker, and a broken
// marker silently changes which cards Anki generates. Gate 6 owns cloze safety;
// this module's honest answer is to skip the note and say so.
//
// **`[sound:…]` never goes on the wire.** It is a media file name, not prose:
// sending it leaks a file name and invites the model to translate it. It is
// stripped from what is sent, and the source field keeps it untouched.

import {
  estimateAgentProviderCostUsd,
  agentEstimatedTokens,
  type AgentProviderPricingTable,
} from './agentProviderPricing';
import { providerById, providerKeyBucket, type AiProviderId } from './aiProviders';
import { normalizeFieldText } from './ankiTextNormalize';

/**
 * Notes per provider request. Smaller than gate 12's eight because a field's
 * prose is an order of magnitude longer than a headword, and the chunk is also
 * the cancel granularity.
 */
export const TRANSLATE_CHUNK_SIZE = 6;
/** The largest selection one translation run may request, across all chunks. */
export const TRANSLATE_MAX_NOTES = 200;
/** Characters of one note's source text that reach the prompt. */
export const TRANSLATE_MAX_FIELD_CHARS = 600;
export const TRANSLATE_MIN_VARIANTS = 1;
export const TRANSLATE_MAX_VARIANTS = 3;

/**
 * The languages the picker offers. A configured language outside this list is
 * still accepted as a code — recipe 2 says "or a configured language" — but
 * these four are the ones the app's own chrome already speaks, so they are the
 * ones a user can read the result in.
 */
export const TRANSLATE_LANGUAGES = ['ja', 'en', 'ru', 'zh'] as const;
export type TranslateLanguage = (typeof TRANSLATE_LANGUAGES)[number];

/** Why a selected note produced no request. Never a translated string. */
export type TranslateSkipReason =
  /** The source field is absent, empty, or holds only markup and media tags. */
  | 'empty-source'
  /** The source carries a cloze marker. See the module note. */
  | 'cloze-source';

export interface TranslateRequestNote {
  noteId: string;
  /** The plain text actually sent: markup stripped, media tags removed, capped. */
  text: string;
}

export interface TranslateSkippedNote {
  noteId: string;
  reason: TranslateSkipReason;
}

export interface TranslateFieldRequest {
  /** The field being read, by name, because the disclosure prints it. */
  fromField: string;
  /** A language code. One of `TRANSLATE_LANGUAGES` or a configured code. */
  targetLanguage: string;
  notes: TranslateRequestNote[];
  /** How many alternative translations to ask for. The review then picks one. */
  variantCount: number;
}

const CLOZE = /\{\{c\d+::/iu;
const SOUND_TAG = /\[sound:[^\]]*\]/giu;

/**
 * Turn raw field values into the text that may be sent, and say which notes were
 * left out and why.
 *
 * The skip list is a return value rather than a silent filter: a run that
 * requested 60 notes and got 47 answers has to be able to explain the other 13,
 * and "the provider did not answer" is a different statement from "we never
 * asked".
 */
export function prepareTranslateNotes(
  raws: ReadonlyArray<{ noteId: string; raw: string }>,
): { notes: TranslateRequestNote[]; skipped: TranslateSkippedNote[] } {
  const notes: TranslateRequestNote[] = [];
  const skipped: TranslateSkippedNote[] = [];
  for (const entry of raws) {
    const noteId = typeof entry?.noteId === 'string' ? entry.noteId : '';
    if (!noteId) continue;
    const raw = typeof entry.raw === 'string' ? entry.raw : '';
    // Checked on the raw value: a marker split across markup is still a marker.
    if (CLOZE.test(raw)) {
      skipped.push({ noteId, reason: 'cloze-source' });
      continue;
    }
    const text = normalizeFieldText(raw.replace(SOUND_TAG, ' '), ['strip-html', 'collapse-space'])
      .slice(0, TRANSLATE_MAX_FIELD_CHARS)
      .trim();
    if (!text) {
      skipped.push({ noteId, reason: 'empty-source' });
      continue;
    }
    notes.push({ noteId, text });
  }
  return { notes, skipped };
}

/**
 * The request as it may actually be sent, or `null` when there is nothing to
 * ask. Callers hand this the output of `prepareTranslateNotes`; anything that
 * slipped through with an empty text is dropped again here, so a UI that builds
 * its own note list still cannot send a blank question.
 */
export function normalizeTranslateRequest(value: unknown): TranslateFieldRequest | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<TranslateFieldRequest>;
  const fromField = typeof raw.fromField === 'string' ? raw.fromField.trim().slice(0, 64) : '';
  if (!fromField) return null;
  const targetLanguage = typeof raw.targetLanguage === 'string'
    ? raw.targetLanguage.trim().slice(0, 16)
    : '';
  if (!targetLanguage) return null;
  const notes: TranslateRequestNote[] = [];
  for (const entry of Array.isArray(raw.notes) ? raw.notes : []) {
    if (!entry || typeof entry !== 'object') continue;
    const note = entry as Partial<TranslateRequestNote>;
    const noteId = typeof note.noteId === 'string' ? note.noteId : '';
    const text = typeof note.text === 'string'
      ? note.text.trim().slice(0, TRANSLATE_MAX_FIELD_CHARS)
      : '';
    if (!noteId || !text) continue;
    notes.push({ noteId, text });
    if (notes.length >= TRANSLATE_MAX_NOTES) break;
  }
  if (notes.length === 0) return null;
  const requested = typeof raw.variantCount === 'number' && Number.isFinite(raw.variantCount)
    ? Math.round(raw.variantCount)
    : TRANSLATE_MIN_VARIANTS;
  return {
    fromField,
    targetLanguage,
    notes,
    variantCount: Math.min(TRANSLATE_MAX_VARIANTS, Math.max(TRANSLATE_MIN_VARIANTS, requested)),
  };
}

/**
 * Whether the chosen source/destination pair may be translated at all.
 *
 * `same-field` is the retention rule from recipe 2 and it is checked here rather
 * than in the panel so a test can hold it: the tray's conflict rules include
 * `overwrite`, which would otherwise let a translation destroy the only copy of
 * the text it was made from.
 */
export function translateDestinationProblem(
  fromField: string,
  toField: string,
): 'no-source' | 'no-destination' | 'same-field' | null {
  const from = fromField.trim();
  const to = toField.trim();
  if (!from) return 'no-source';
  if (!to) return 'no-destination';
  return from === to ? 'same-field' : null;
}

export const TRANSLATE_SCHEMA = {
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

/**
 * The prompt for one chunk. Indices are chunk-relative, exactly as gate 12's
 * are, so a chunk that fails takes no other chunk's answers with it and no note
 * id is ever put on the wire.
 */
export function buildTranslatePrompt(
  request: TranslateFieldRequest,
  notes: ReadonlyArray<TranslateRequestNote>,
): string {
  const lines = notes.map((note, index) => `${index + 1}. ${note.text}`);
  return [
    'You translate flashcard field text for a Japanese study application.',
    `Translate every numbered text into the language with code: ${request.targetLanguage}.`,
    `Give exactly ${request.variantCount} distinct alternative translation(s) per text; a user picks one.`,
    'Translate meaning, not word order. Keep it short enough to read on a flashcard.',
    'Return the translation only: no commentary, no numbering, no quotation marks, no original text.',
    'Texts:',
    ...lines,
    'Return JSON matching the supplied schema, with one result per numbered text, using that same number as "index".',
    'If you cannot translate a text, return that index with an empty variants array rather than repeating the original.',
  ].join('\n');
}

export interface TranslateAnswer {
  noteId: string;
  variants: string[];
}

/**
 * Map a provider response back onto the chunk that produced it.
 *
 * A "translation" identical to its own source is dropped: the model echoed the
 * input rather than translating it, and writing the source text into the
 * destination field under a generated-content marker would claim a translation
 * happened. Every requested note still appears exactly once, so a note left with
 * no variants becomes a `failed` the caller can retry.
 */
export function parseTranslateResponse(
  raw: string,
  notes: ReadonlyArray<TranslateRequestNote>,
  variantCount: number,
): TranslateAnswer[] {
  const byIndex = new Map<number, string[]>();
  const parsed = JSON.parse(raw) as { results?: unknown };
  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  for (const entry of results) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as { index?: unknown; variants?: unknown };
    const index = typeof row.index === 'number' ? Math.round(row.index) : NaN;
    if (!Number.isFinite(index) || index < 1 || index > notes.length) continue;
    if (byIndex.has(index)) continue;
    const source = notes[index - 1].text;
    const variants: string[] = [];
    for (const variant of Array.isArray(row.variants) ? row.variants : []) {
      const value = typeof variant === 'string' ? variant.trim() : '';
      if (!value || value === source || variants.includes(value)) continue;
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

// ----- what the user is told before the run -----------------------------------

export interface TranslateDisclosure {
  /** The key bucket, i.e. the company that receives the request. */
  provider: string;
  /** The model id, which is also the provider id this app routes on. */
  model: string;
  providerLabel: string;
  /** The field whose contents leave the machine, by its own name. */
  fromField: string;
  targetLanguage: string;
  noteCount: number;
  requests: number;
  /** Characters of the user's own deck text in the prompts. Not an estimate. */
  charsSent: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  /** Absent when the user has entered no price for this provider. Never zero as a stand-in. */
  estimatedCostUsd?: number;
}

/**
 * Everything the user must see before the first request goes out.
 *
 * The output allowance is the input length rather than a fixed per-item budget:
 * a translation is about as long as its source, and gate 12's flat 40 tokens
 * would understate a 600-character field by an order of magnitude.
 */
export function describeTranslateDisclosure(
  request: TranslateFieldRequest,
  providerId: AiProviderId,
  pricing?: AgentProviderPricingTable,
): TranslateDisclosure {
  const definition = providerById(providerId);
  const chunks: TranslateRequestNote[][] = [];
  for (let i = 0; i < request.notes.length; i += TRANSLATE_CHUNK_SIZE) {
    chunks.push(request.notes.slice(i, i + TRANSLATE_CHUNK_SIZE));
  }
  const chars = chunks.reduce((sum, notes) => sum + buildTranslatePrompt(request, notes).length, 0);
  const charsSent = request.notes.reduce((sum, note) => sum + note.text.length, 0);
  const estimatedInputTokens = agentEstimatedTokens(chars);
  const estimatedOutputTokens = Math.max(
    1,
    agentEstimatedTokens(charsSent) * request.variantCount,
  );
  return {
    provider: providerKeyBucket(providerId),
    model: providerId,
    providerLabel: definition.label,
    fromField: request.fromField,
    targetLanguage: request.targetLanguage,
    noteCount: request.notes.length,
    requests: chunks.length,
    charsSent,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedCostUsd: estimateAgentProviderCostUsd(
      estimatedInputTokens,
      estimatedOutputTokens,
      pricing?.[providerId],
    ),
  };
}
