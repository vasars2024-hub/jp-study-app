/**
 * Where the scheduling choice is kept.
 *
 * The decision arithmetic is `shared/flashcardScheduling`; the deck-wide
 * conversion and reset live in `flashcardDeck.ts`, which owns the store. This
 * file is only the setting, so a panel can read and write it without either.
 *
 * The setting is deliberately NOT applied on read. A card is adapted when it is
 * next reviewed, or in one explicit deck-wide pass the user asks for; nothing
 * silently rewrites thousands of cards because a toggle was flipped and flipped
 * back.
 */
import {
  DEFAULT_SCHEDULING_CONFIG,
  normalizeSchedulingConfig,
  type SchedulingConfig,
} from '../shared/flashcardScheduling';

const CONFIG_KEY = 'jp-flashcard-scheduling-v1';

/**
 * The parsed setting, keyed on the raw stored text. The leech predicate reads
 * the threshold once per card in a deck-wide filter, and re-parsing the JSON for
 * each of 10,000 cards is the kind of cost this repo keeps measuring.
 */
let memo: { raw: string | null; config: SchedulingConfig } | null = null;

export function loadSchedulingConfig(): SchedulingConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (memo && memo.raw === raw) return memo.config;
    const config = normalizeSchedulingConfig(JSON.parse(raw ?? 'null'));
    memo = { raw, config };
    return config;
  } catch {
    return DEFAULT_SCHEDULING_CONFIG;
  }
}

export function saveSchedulingConfig(next: Partial<SchedulingConfig>): SchedulingConfig {
  const normalized = normalizeSchedulingConfig({ ...loadSchedulingConfig(), ...next });
  // `fsrsWeights: undefined` in `next` is how a caller clears a personal fit.
  if ('fsrsWeights' in next && next.fsrsWeights === undefined) delete normalized.fsrsWeights;
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(normalized));
  } catch {
    /* A locked store still gets session-local settings. */
  }
  memo = null;
  return normalized;
}
