// AI fixes pass: AI failures said as codes in the UI language
// (`shared/aiErrorCodes.ts`), the translate-analysis consent note, partial
// answers, and the Whisper multilingual-model refusal. English source of truth.

import type { Catalog } from '../core';

export const AI_FIX_UI_EN: Catalog = {
  // ---- AI failure codes (shared/aiErrorCodes.ts) ----
  'aiError.ai-off': 'AI features are turned off in Settings → AI.',
  'aiError.no-key': 'No API key is saved for the AI provider. Add one in Settings → AI.',
  'aiError.consent': 'This AI provider has not been allowed to receive text.',
  'aiError.auth': 'The AI provider rejected the API key.',
  'aiError.rate-limit': 'The AI provider is rate-limiting requests. Try again in a moment.',
  'aiError.spend': 'This would exceed the AI spending limit set in Settings → AI.',
  'aiError.too-long': 'The text is too long to send in one request.',
  'aiError.offline': 'This computer is offline, so nothing was sent.',
  'aiError.network': 'The AI provider could not be reached.',
  'aiError.timeout': 'The AI request timed out.',
  'aiError.invalid': 'The AI answer could not be read. Try again.',
  'aiError.truncated': 'The AI answer was cut off before it finished. Try a shorter request.',
  'aiError.no-local-model': 'The offline AI model is not installed. Install it in Settings → AI.',
  'aiError.refused': 'The request was not sent because it contained sensitive data.',
  'aiError.empty-input': 'There is nothing to send.',
  'aiError.no-answer': 'The AI skipped this item. Retry to ask again.',
  'aiError.ipc-failed': 'The app could not reach its background process. Try again.',
  'aiError.cancelled': 'Cancelled.',
  'aiError.other': 'The AI request failed.',

  // ---- Translate analysis ----
  'aiFix.analysis.needsConsent': 'The grammar analysis sends this sentence and its translation to {provider}. It runs once you allow {provider} to receive translate text.',
  'aiFix.analysis.partial': 'Some sections did not come back. This analysis was not saved; Re-analyze to try again.',

  // ---- Media study assistant ----
  'aiFix.assistant.partial': 'The answer is incomplete and was not saved. Choose the same mode again to retry.',

  // ---- Whisper ----
  'aiFix.whisper.multilingualRequired': 'The selected Whisper model only understands Japanese. Download a multilingual model (Whisper small, base or large-v3-turbo) in Settings → Transcription to transcribe this language.',
};
