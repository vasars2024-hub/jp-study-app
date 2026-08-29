/**
 * The voice this profile has chosen for each study language.
 *
 * Stored renderer-side next to the other card-audio preferences rather than in
 * main's settings file: it is a per-profile taste, it must survive a main
 * process that cannot enumerate voices at all, and an unreadable store has to
 * degrade to "let the operating system pick", which is exactly what happened
 * before this existed.
 */

import {
  normalizeVoicePreferences,
  voiceLanguageOf,
  type FlashcardVoicePreferences,
} from '../shared/flashcardVoices';

const PREF_KEY = 'jp-flashcard-voice-v1';
export const VOICE_PREFERENCE_EVENT = 'flashcard-voice-preference';

export function loadVoicePreferences(): FlashcardVoicePreferences {
  try {
    return normalizeVoicePreferences(JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null'));
  } catch {
    return {};
  }
}

/** The saved voice id for a language, or undefined to let the back end choose. */
export function preferredVoiceFor(language: string): string | undefined {
  return loadVoicePreferences()[voiceLanguageOf(language)];
}

/**
 * Save, or clear when `voiceId` is empty.
 *
 * Clearing is the reverse path the "System default" option needs: without it a
 * chosen voice could never be un-chosen, only swapped.
 */
export function saveVoicePreference(
  language: string,
  voiceId: string,
): FlashcardVoicePreferences {
  const key = voiceLanguageOf(language);
  const next = { ...loadVoicePreferences() };
  if (voiceId.trim()) next[key] = voiceId.trim();
  else delete next[key];
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(next));
  } catch {
    /* A locked store still gets session-local behaviour. */
  }
  window.dispatchEvent(new CustomEvent<FlashcardVoicePreferences>(
    VOICE_PREFERENCE_EVENT,
    { detail: next },
  ));
  return next;
}
