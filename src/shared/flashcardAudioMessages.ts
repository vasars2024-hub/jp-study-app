/**
 * Why offline flashcard audio could not be produced, and which translated string
 * says so.
 *
 * The classification is made in main (`main/flashcardAudio.ts`) because only main
 * sees what PowerShell / `say` / `espeak` actually printed. The wording is chosen
 * here because only the renderer knows the user's language. Before this split the
 * renderer showed the synthesizer's raw English sentence verbatim, in every locale.
 */
export type FlashcardAudioFailure =
  /** Nothing to speak. */
  | 'empty-text'
  /** A synthesizer is present but has no installed voice for that language. */
  | 'no-voice'
  /** No offline synthesizer at all — Linux without espeak, or a locked-down host. */
  | 'no-synthesizer'
  /** The path is not inside the managed flashcard-audio directory, or is gone. */
  | 'not-managed'
  /** The user stopped a synthesis request before it completed. */
  | 'cancelled'
  /** It ran and failed for some other reason; the raw detail is kept for diagnostics. */
  | 'failed';

const KEYS: Record<FlashcardAudioFailure, string> = {
  'empty-text': 'flash.audioError.emptyText',
  'no-voice': 'flash.audioError.noVoice',
  'no-synthesizer': 'flash.audioError.noSynthesizer',
  'not-managed': 'flash.audioError.notManaged',
  cancelled: 'flash.audioError.cancelled',
  failed: 'flash.audioGenerationFailed',
};

export function isFlashcardAudioFailure(value: unknown): value is FlashcardAudioFailure {
  return typeof value === 'string' && value in KEYS;
}

/**
 * The i18n key for a reason. An unclassified result — an older main process, or a
 * channel that never set one — falls back to the generic key rather than to the
 * raw English detail, which is what a user would otherwise be shown.
 */
export function flashcardAudioErrorKey(reason?: unknown): string {
  return isFlashcardAudioFailure(reason) ? KEYS[reason] : KEYS.failed;
}
