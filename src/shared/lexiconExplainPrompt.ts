// What Contextual Explain asks a model, and how its answer is read back.
//
// Both halves live together on purpose: the prompt states a JSON shape and the
// parser is the thing that has to accept it, and splitting them across two files
// is how a prompt drifts from the reader that was written for it.
//
// The prompt text is model-facing and therefore not translated. What *is*
// selectable is the language the answer is written in — that goes into the
// instruction as a request, and it is also part of the storage key, so an
// English and a Russian explanation of one word are two cached answers.
//
// Nothing here calls anything. The prompt is a string and the reply is a string;
// the transport, the provider policy and the cache all live in main.

import type { AgentProviderPolicy } from './agentWorkspace';
import {
  EXPLANATION_MODEL_MAX_CHARS,
  EXPLANATION_SECTION_KINDS,
  readExplanationIdentity,
  readExplanationInput,
  explanationIsEmpty,
  type LexiconExplanationIdentity,
  type LexiconExplanationInput,
} from './lexiconExplanations';

/**
 * The `model` half of the cache key, derived from the policy rather than typed
 * by a caller.
 *
 * Shared so the surface reading the cache and the handler writing it cannot
 * disagree about what a model is called — a mismatch there is not an error
 * anyone sees, it is a cache that silently never hits and a paid call on every
 * lookup. The backend is in the string because a local `qwen3-4b` and a cloud
 * `qwen3-4b` are different answers.
 */
export function explainModelKey(policy: AgentProviderPolicy): string {
  const target = policy.target;
  const vendor = target.kind === 'cloud' ? target.providerId : target.backend;
  const model = (target.model ?? '').trim() || 'default';
  return `${target.kind}:${vendor}:${model}`.slice(0, EXPLANATION_MODEL_MAX_CHARS);
}

/** A headword's own dictionary material, so the model explains this word rather than a guess at it. */
export interface LexiconExplainGrounding {
  /** Glosses already on screen, in the order the entry shows them. */
  glosses: string[];
  /** Parts of speech, when the entry carries any. */
  partsOfSpeech?: string[];
}

/**
 * How much grounding one request carries.
 *
 * A dictionary entry can run to dozens of senses and the whole point of the
 * grounding is the *first* few — the ones the reader is looking at. Bounding it
 * here rather than at the call site keeps a long JMdict entry from silently
 * turning one explanation into a large paid request.
 */
export const EXPLAIN_MAX_GLOSSES = 12;
export const EXPLAIN_GLOSS_MAX_CHARS = 200;

/**
 * Language names, not tags.
 *
 * A model asked to answer "in ru" answers in English more often than not. These
 * are model-facing and deliberately outside the i18n catalogs. An unknown tag
 * falls through to English rather than being interpolated raw, because a request
 * to answer "in pt-BR" that the prompt cannot name is a request for prose in a
 * language the surface will then label wrongly.
 */
const PROSE_LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ja: 'Japanese',
  zh: 'Chinese',
  ru: 'Russian',
};

export function explanationProseLanguage(glossLang: string): string {
  return PROSE_LANGUAGE_NAMES[glossLang.trim().toLowerCase()] ?? PROSE_LANGUAGE_NAMES.en;
}

/**
 * The word and prose language an untrusted caller asked about.
 *
 * Deliberately *not* `readExplanationKey`: that one requires a model, and the
 * model half of the key is derived from the provider policy rather than sent, so
 * a request carrying one would be describing a cache entry it does not control.
 */
export function readExplainTarget(
  raw: unknown,
): (LexiconExplanationIdentity & { glossLang: string }) | null {
  const identity = readExplanationIdentity(raw);
  if (!identity) return null;
  const record = raw as Record<string, unknown>;
  const glossLang = typeof record.glossLang === 'string'
    ? record.glossLang.trim().toLowerCase().slice(0, 16)
    : '';
  return glossLang ? { ...identity, glossLang } : null;
}

/** The grounding an untrusted caller supplied, bounded to what one request may carry. */
export function readExplainGrounding(raw: unknown): LexiconExplainGrounding {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const strings = (value: unknown, limit: number, max: number): string[] =>
    (Array.isArray(value) ? value : [])
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim().slice(0, max))
      .filter(Boolean)
      .slice(0, limit);
  return {
    glosses: strings(record.glosses, EXPLAIN_MAX_GLOSSES, EXPLAIN_GLOSS_MAX_CHARS),
    partsOfSpeech: strings(record.partsOfSpeech, 8, 40),
  };
}

/**
 * The instruction, verbatim.
 *
 * `lexiconExplainPrompt.test.ts` pins this string. That is not busywork: the
 * cache is keyed on `EXPLANATION_PROMPT_VERSION`, so editing the prompt without
 * bumping the version leaves every previously cached answer being served for a
 * question that is no longer being asked. The failing assertion is the reminder.
 */
/** "a Japanese / Chinese / Russian learner" — the word's language, not always Japanese. */
const LEARNER_OF: Readonly<Record<string, string>> = { ja: 'Japanese', zh: 'Chinese', ru: 'Russian' };

export function buildExplanationPrompt(
  word: string,
  reading: string,
  glossLang: string,
  grounding: LexiconExplainGrounding,
  /** The word's language. The Japanese prompt is unchanged (and so is the cache version). */
  wordLang = 'ja',
): string {
  const glosses = grounding.glosses
    .map((gloss) => gloss.trim().slice(0, EXPLAIN_GLOSS_MAX_CHARS))
    .filter(Boolean)
    .slice(0, EXPLAIN_MAX_GLOSSES);
  const pos = (grounding.partsOfSpeech ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 8);
  const headword = reading.trim() && reading.trim() !== word.trim()
    ? `${word.trim()} (${reading.trim()})`
    : word.trim();
  const lines = [
    `Explain the word ${headword} to a ${LEARNER_OF[wordLang] ?? 'Japanese'} learner.`,
    `Write every value in ${explanationProseLanguage(glossLang)}.`,
    '',
    'Dictionary material already shown to the reader:',
    ...(glosses.length ? glosses.map((gloss) => `- ${gloss}`) : ['- (none)']),
    ...(pos.length ? ['', `Parts of speech: ${pos.join(', ')}`] : []),
    '',
    'Return one JSON object and nothing else:',
    '{"summary": "...", "sections": [{"kind": "...", "body": "..."}]}',
    '',
    `"kind" must be one of: ${EXPLANATION_SECTION_KINDS.join(', ')}.`,
    'Use a kind at most once. Include only the ones you have something real to say about.',
    'Do not repeat the dictionary glosses back; say what they leave out.',
    'Keep "summary" to one or two sentences and each "body" under 120 words.',
    'If you are not confident about a point, leave that section out rather than guessing.',
  ];
  return lines.join('\n');
}

/**
 * The JSON object inside a model reply, as raw text.
 *
 * Models wrap JSON in ``` fences, prefix it with "Here you go:", or both, and a
 * strict `JSON.parse` of the whole reply then fails on an answer that is
 * perfectly good. The fence is stripped when present; otherwise the first `{`
 * through the last `}` is taken. Deliberately not a brace-matching scan — a
 * reply with trailing prose containing a `}` is rare, and the cost of getting it
 * wrong is a parse failure that surfaces as "ask again", not a wrong answer.
 */
export function extractJsonBlock(reply: string): string {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : reply;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return '';
  return body.slice(start, end + 1);
}

/**
 * A model reply read back as an explanation, or `null` when it is not one.
 *
 * `null` is the honest answer for an unparsable reply and the caller stores
 * nothing: a cached failure would serve an instant blank to every later reader
 * with nothing saying why. `readExplanationInput` does the bounding and drops
 * any heading the surface has no label for, so a model that invents a kind loses
 * that section rather than the whole answer.
 */
export function parseExplanationReply(reply: unknown): LexiconExplanationInput | null {
  if (typeof reply !== 'string' || !reply.trim()) return null;
  const block = extractJsonBlock(reply);
  if (!block) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch {
    return null;
  }
  const input = readExplanationInput(parsed);
  return explanationIsEmpty(input) ? null : input;
}
