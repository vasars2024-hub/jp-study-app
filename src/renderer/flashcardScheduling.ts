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
  schedulingConfigForFolder,
  type SchedulingConfig,
} from '../shared/flashcardScheduling';
import { setStudyDayStartHour } from '../shared/studyDay';
import { writeLocalStorage } from './localStorageWrite';

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
    // The study day's start hour is read by pure code (stats day keys, the
    // review-log summaries) that is not handed the config: keep it current.
    setStudyDayStartHour(config.dayStartHour);
    return config;
  } catch {
    setStudyDayStartHour(DEFAULT_SCHEDULING_CONFIG.dayStartHour);
    return DEFAULT_SCHEDULING_CONFIG;
  }
}

/**
 * The hour a study day starts (Settings → Scheduling, 4 am by default). Stats,
 * the streak and the new-card budget key their days on it.
 */
export function studyDayStartHour(): number {
  return loadSchedulingConfig().dayStartHour;
}

export function saveSchedulingConfig(next: Partial<SchedulingConfig>): SchedulingConfig {
  const normalized = normalizeSchedulingConfig({ ...loadSchedulingConfig(), ...next });
  // `fsrsWeights: undefined` in `next` is how a caller clears a personal fit,
  // and `ankiFsrsImport: undefined` how it dismisses imported Anki parameters.
  if ('fsrsWeights' in next && next.fsrsWeights === undefined) delete normalized.fsrsWeights;
  if ('ankiFsrsImport' in next && next.ankiFsrsImport === undefined) delete normalized.ankiFsrsImport;
  return writeSchedulingConfig(normalized);
}

/**
 * Store a whole config, as the preset helpers in `shared/flashcardScheduling`
 * return it (they build the next config from the current one).
 */
export function replaceSchedulingConfig(next: SchedulingConfig): SchedulingConfig {
  return writeSchedulingConfig(normalizeSchedulingConfig(next));
}

function writeSchedulingConfig(normalized: SchedulingConfig): SchedulingConfig {
  // A refused write is reported (toast + log) by the guarded writer; the
  // session still gets the setting.
  writeLocalStorage(CONFIG_KEY, JSON.stringify(normalized));
  memo = null;
  setStudyDayStartHour(normalized.dayStartHour);
  return normalized;
}

/**
 * The settings one card is scheduled with: its deck folder's preset over the
 * shared ones. Every review of a deck card goes through this, so a preset
 * cannot be a label that the scheduler ignores.
 */
export function schedulingConfigForCard(card: { folder?: string | null }): SchedulingConfig {
  return schedulingConfigForFolder(loadSchedulingConfig(), card.folder);
}
