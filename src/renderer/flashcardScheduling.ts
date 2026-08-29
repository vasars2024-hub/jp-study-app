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

export function loadSchedulingConfig(): SchedulingConfig {
  try {
    return normalizeSchedulingConfig(JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null'));
  } catch {
    return DEFAULT_SCHEDULING_CONFIG;
  }
}

export function saveSchedulingConfig(next: Partial<SchedulingConfig>): SchedulingConfig {
  const normalized = normalizeSchedulingConfig({ ...loadSchedulingConfig(), ...next });
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(normalized));
  } catch {
    /* A locked store still gets session-local settings. */
  }
  return normalized;
}
