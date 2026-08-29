/**
 * Run offline speech for freshly mined cards, when the user has asked for it.
 *
 * The decision lives in `shared/flashcardAutoAudio`; this file is the run: read
 * the preference, ask main for one clip per card, and write the paths back
 * through the same deck primitive the manual "add audio" button uses. No second
 * card store, and no new audio field — an auto-narrated card is indistinguishable
 * from one narrated by hand, because it is the same thing.
 *
 * Failure is reported, never swallowed and never faked: a missing voice fails
 * every card in the batch for one reason, and that reason is what the listener
 * receives.
 */

import {
  DEFAULT_AUTO_AUDIO_PREFERENCES,
  normalizeAutoAudioPreferences,
  selectAutoAudioCards,
  autoAudioTextFor,
  type AutoAudioPreferences,
} from '../shared/flashcardAutoAudio';
import { updateDeckCardAudioBatch, type DeckFlashcard } from './flashcardDeck';

const PREF_KEY = 'jp-flashcard-auto-audio-v1';
export const AUTO_AUDIO_EVENT = 'flashcard-auto-audio';

export interface AutoAudioReport {
  /** Cards that gained a clip. */
  added: number;
  /** Cards the synthesizer refused or failed on. */
  failed: number;
  /** Eligible cards the per-batch cap left for later. */
  deferred: number;
  /** The first failure's classification, for an actionable message. */
  reason?: unknown;
}

export function loadAutoAudioPreferences(): AutoAudioPreferences {
  try {
    return normalizeAutoAudioPreferences(JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null'));
  } catch {
    return DEFAULT_AUTO_AUDIO_PREFERENCES;
  }
}

export function saveAutoAudioPreferences(next: AutoAudioPreferences): AutoAudioPreferences {
  const normalized = normalizeAutoAudioPreferences(next);
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(normalized));
  } catch {
    /* A locked store still gets session-local preferences. */
  }
  return normalized;
}

/**
 * Attach audio to whichever of `created` the preference covers.
 *
 * Callers fire and forget: mining must not wait on a voice device. Returns null
 * when nothing was eligible, so a caller can tell "off" from "ran and found
 * nothing to do".
 */
export async function narrateNewCards(
  created: readonly DeckFlashcard[],
  preferences: AutoAudioPreferences = loadAutoAudioPreferences(),
): Promise<AutoAudioReport | null> {
  const selection = selectAutoAudioCards(created, preferences);
  if (!selection.chosen.length) return null;

  const updates: Array<{ id: string; audioPath: string }> = [];
  const report: AutoAudioReport = { added: 0, failed: 0, deferred: selection.deferred };
  // Sequential on purpose: the OS synthesizer owns one voice device, and
  // parallel requests there deadlock rather than go faster.
  for (const card of selection.chosen) {
    let result: { ok: boolean; path?: string; reason?: unknown };
    try {
      result = await window.api.flashcardSynthesizeAudio(autoAudioTextFor(card), 'ja');
    } catch (error) {
      result = { ok: false, reason: error };
    }
    if (result.ok && result.path) updates.push({ id: card.id, audioPath: result.path });
    else {
      report.failed += 1;
      if (report.reason === undefined) report.reason = result.reason;
    }
  }
  if (updates.length) {
    updateDeckCardAudioBatch(updates);
    report.added = updates.length;
  }
  window.dispatchEvent(new CustomEvent<AutoAudioReport>(AUTO_AUDIO_EVENT, { detail: report }));
  return report;
}

/** Subscribe to what the last automatic run actually did. */
export function onAutoAudioReport(cb: (report: AutoAudioReport) => void): () => void {
  const handler = (event: Event): void => cb((event as CustomEvent<AutoAudioReport>).detail);
  window.addEventListener(AUTO_AUDIO_EVENT, handler);
  return () => window.removeEventListener(AUTO_AUDIO_EVENT, handler);
}
