// Grammar strings that arrived after the catalogs were frozen for v1: example
// audio, the end-of-test "add to reviews" offer and the content-language note —
// English source of truth. A lazy pack (`components/grammar/grammarUiStrings.ts`):
// English is bundled as the fallback, ja/zh/ru load with the Grammar window.

import type { Catalog } from '../core';

export const GRAMMAR_UI_EN: Catalog = {
  // ---- Content language (decision D6: grammar content is English for v1) ----
  'grammarUi.contentLang': 'Explanations in English',
  'grammarUi.contentLangHint': 'Grammar explanations and translations are written in English. Examples are in the language you study.',

  // ---- Example audio ----
  'grammarUi.audio.play': 'Listen to this example',
  'grammarUi.audio.stop': 'Stop the example',
  'grammarUi.audio.loading': 'Preparing the audio…',
  'grammarUi.audio.noVoice.ja': 'No offline Japanese voice is installed. On Windows, open Settings > Time & language > Speech, choose Add voices and add Japanese, then try again.',
  'grammarUi.audio.noVoice.zh': 'No offline Chinese voice is installed. On Windows, open Settings > Time & language > Speech, choose Add voices and add Chinese (Simplified), then try again.',
  'grammarUi.audio.noVoice.ru': 'No offline Russian voice is installed. On Windows, open Settings > Time & language > Speech, choose Add voices and add Russian, then try again.',
  'grammarUi.audio.noSynthesizer': 'This computer has no offline speech synthesizer, so examples cannot be read aloud.',
  'grammarUi.audio.failed': 'This example could not be read aloud. Try again in a moment.',

  // ---- Practice test: unscheduled points ----
  'grammarUi.test.offerHint': {
    one: 'You answered {count} point that is not in your reviews. A practice test does not schedule new points by itself.',
    other: 'You answered {count} points that are not in your reviews. A practice test does not schedule new points by itself.',
  },
  'grammarUi.test.offerAdd': {
    one: 'Add {count} new point to reviews',
    other: 'Add {count} new points to reviews',
  },
  'grammarUi.test.offerDone': {
    one: 'Added {count} point to reviews. It comes back when it is due.',
    other: 'Added {count} points to reviews. They come back when they are due.',
  },
};
