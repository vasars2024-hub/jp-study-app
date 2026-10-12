/**
 * A Gum deck card's saved extras on their way out of the app: the memory aid and
 * "not to confuse with" note of a leech rescue, the example sentences the learner
 * kept, and the answers they accepted. Every export used to drop them. The HTML a
 * note field carries (sanitized, generated text marked) is `./cardAiExtrasHtml.ts`;
 * this light half is in the boot graph via the mining queue, so it stays small.
 */
import type { CardExampleSentence } from './aiExampleSentences';

export interface CardAiExtras {
  mnemonic?: string;
  distinction?: string;
  exampleSentences?: readonly CardExampleSentence[];
  acceptedAnswers?: { meaning?: readonly string[]; target?: readonly string[] };
}

/** Bounds for a value that crossed IPC: the card caps are smaller, these only stop abuse. */
const MAX_TEXT = 1_000;
const MAX_EXAMPLES = 10;
const MAX_ANSWERS = 16;

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '';
}

function cleanList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(clean).filter(Boolean).slice(0, max);
}

/**
 * The extras of `card`, normalized and bounded, or `undefined` when it has none.
 * Also the validator for a request that came over IPC: anything malformed is
 * dropped rather than passed on.
 */
export function pickCardAiExtras(card: unknown): CardAiExtras | undefined {
  if (!card || typeof card !== 'object') return undefined;
  const source = card as Record<string, unknown>;
  const out: CardAiExtras = {};
  const mnemonic = clean(source.mnemonic);
  if (mnemonic) out.mnemonic = mnemonic;
  const distinction = clean(source.distinction);
  if (distinction) out.distinction = distinction;
  if (Array.isArray(source.exampleSentences)) {
    const examples: CardExampleSentence[] = [];
    for (const raw of source.exampleSentences.slice(0, MAX_EXAMPLES)) {
      if (!raw || typeof raw !== 'object') continue;
      const entry = raw as Record<string, unknown>;
      const text = clean(entry.text);
      if (!text) continue;
      const translation = clean(entry.translation);
      examples.push({ text, ...(translation ? { translation } : {}), origin: entry.origin === 'corpus' ? 'corpus' : 'ai' });
    }
    if (examples.length) out.exampleSentences = examples;
  }
  const accepted = source.acceptedAnswers as Record<string, unknown> | undefined;
  if (accepted && typeof accepted === 'object') {
    const meaning = cleanList(accepted.meaning, MAX_ANSWERS);
    const target = cleanList(accepted.target, MAX_ANSWERS);
    if (meaning.length || target.length) {
      out.acceptedAnswers = { ...(meaning.length ? { meaning } : {}), ...(target.length ? { target } : {}) };
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export function hasCardAiExtras(card: unknown): boolean {
  return pickCardAiExtras(card) !== undefined;
}
