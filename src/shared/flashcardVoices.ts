/**
 * Which offline voices exist on this machine, and which one a card is spoken in.
 *
 * Until now the synthesizer took whatever the operating system listed first for
 * the culture. That is fine when exactly one Japanese voice is installed and
 * indefensible when three are: the user could hear a voice they dislike with no
 * way to see the alternatives, and the "no offline voice is installed" error
 * named a problem without naming a single thing to do about it.
 *
 * The enumeration itself is per-platform and lives in `main/flashcardAudio.ts`.
 * Everything here is pure so the selection rules — which are where a wrong
 * answer would be silently wrong — are testable without an operating system.
 */

/** One installed system voice, as every back end can describe it. */
export interface FlashcardVoice {
  /** What the platform's synthesizer accepts back: a name on Windows/macOS, a voice id on Linux. */
  id: string;
  /** Shown to the user. Equal to `id` where the platform has no separate label. */
  name: string;
  /** BCP-47-ish culture, e.g. `ja-JP`. Empty when the back end reports only a language. */
  culture: string;
  /** The primary subtag of `culture`, lowercased: `ja`, `zh`, `ru`, `en`. */
  language: string;
  /** Omitted on older persisted inventories; those entries are operating-system voices. */
  engine?: 'system' | 'neural';
}

export interface FlashcardVoiceInventory {
  /** False when the enumeration itself failed; `voices` is then empty and `error` is set. */
  ok: boolean;
  voices: FlashcardVoice[];
  /** `process.platform` of whoever enumerated, so the renderer can word its advice. */
  platform: string;
  /** Raw detail for diagnostics; never shown to the user in place of a translated string. */
  error?: string;
}

export const EMPTY_VOICE_INVENTORY: FlashcardVoiceInventory = {
  ok: true,
  voices: [],
  platform: 'unknown',
};

/** The primary subtag, lowercased. `ja-JP` and `JA` both give `ja`. */
export function voiceLanguageOf(culture: string): string {
  return (culture || '').split(/[-_]/, 1)[0].toLowerCase();
}

/** Every installed voice that can speak `language`, in the order the OS listed them. */
export function voicesForLanguage(
  voices: readonly FlashcardVoice[],
  language: string,
): FlashcardVoice[] {
  const wanted = voiceLanguageOf(language);
  return voices.filter((voice) => voice.language === wanted);
}

/**
 * How the voice about to speak was arrived at.
 *
 * `preferred` — the saved choice is installed. `language` — it is not, so
 * another voice of the same language spoke instead, which the caller must
 * report rather than pass off as the user's choice. `none` — nothing on this
 * machine speaks the language, and no audio may be produced.
 */
export type VoiceResolution = 'preferred' | 'language' | 'none';

export interface ResolvedVoice {
  voice: FlashcardVoice | null;
  resolution: VoiceResolution;
  /** The saved id that was asked for and is missing. Set only for `language`. */
  requested?: string;
}

/**
 * Pick the voice for one card.
 *
 * The rule that matters: a missing preference falls back **within the language
 * only**. A Japanese sentence read by an English voice is not a degraded result,
 * it is a wrong one, and it is exactly the kind of thing that would be reported
 * as working. When nothing speaks the language the answer is `none` and the
 * caller must fail honestly.
 */
export function resolveVoice(
  voices: readonly FlashcardVoice[],
  language: string,
  preferredId?: string,
): ResolvedVoice {
  const candidates = voicesForLanguage(voices, language);
  if (!candidates.length) return { voice: null, resolution: 'none' };
  const wanted = (preferredId ?? '').trim();
  if (wanted) {
    const exact = candidates.find((voice) => voice.id === wanted);
    if (exact) return { voice: exact, resolution: 'preferred' };
    return { voice: candidates[0], resolution: 'language', requested: wanted };
  }
  // No preference is not a fallback: the first voice for the language is what
  // the synthesizer has always used, and saying otherwise would make an
  // untouched setting look like a failure.
  return { voice: candidates[0], resolution: 'preferred' };
}

/** The per-language voice choices a profile has saved, keyed by primary subtag. */
export type FlashcardVoicePreferences = Record<string, string>;

export function normalizeVoicePreferences(
  value?: Partial<FlashcardVoicePreferences> | null,
): FlashcardVoicePreferences {
  const out: FlashcardVoicePreferences = {};
  if (!value || typeof value !== 'object') return out;
  for (const [language, id] of Object.entries(value)) {
    const key = voiceLanguageOf(language);
    if (key && typeof id === 'string' && id.trim()) out[key] = id.trim();
  }
  return out;
}
