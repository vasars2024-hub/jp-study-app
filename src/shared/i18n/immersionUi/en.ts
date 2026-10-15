// Immersion browser strings that arrived after the catalogs were frozen for v1:
// coded Reader Mode errors and read-aloud — English source of truth. A lazy pack
// (`components/immersion/immersionUiStrings.ts`): English is bundled as the
// fallback, ja/zh/ru load with the Immersion browser.

import type { Catalog } from '../core';

export const IMMERSION_UI_EN: Catalog = {
  // ---- Why Reader Mode found no article (codes from readabilityArticle.ts) ----
  'immersionUi.error.noArticle': 'No readable article was found on this page. Switch to Live mode to read it as it is.',
  'immersionUi.error.timeout': 'The page took too long to load. Check your connection and try again.',
  'immersionUi.error.http': 'The site answered with error {status}, so there is no article to show.',
  'immersionUi.error.notHtml': 'This address is a file, not a web page, so Reader Mode cannot show it.',
  'immersionUi.error.badUrl': 'Enter a full web address that starts with http:// or https://.',
  'immersionUi.error.network': 'The page could not be reached. Check your connection and the address, then try again.',
  'immersionUi.error.failed': 'This page could not be read. Try again, or switch to Live mode.',

  // ---- Read aloud ----
  'immersionUi.readAloud.aria': 'Read aloud',
  'immersionUi.readAloud.article': 'Read aloud',
  'immersionUi.readAloud.articleTitle': 'Read the whole article aloud, sentence by sentence',
  'immersionUi.readAloud.paragraph': 'This paragraph',
  'immersionUi.readAloud.paragraphTitle': 'Read aloud only the paragraph you are on: the one you selected text in, or the first one on screen',
  'immersionUi.readAloud.pause': 'Pause',
  'immersionUi.readAloud.resume': 'Resume',
  'immersionUi.readAloud.stop': 'Stop',
  'immersionUi.readAloud.speed': 'Reading speed',
  'immersionUi.readAloud.loading': 'Preparing the audio…',
  'immersionUi.readAloud.progress': 'Sentence {current} of {total}',
  'immersionUi.readAloud.nothing': 'There is no text on this page to read aloud.',
  'immersionUi.readAloud.noVoice.ja': 'No offline Japanese voice is installed. On Windows, open Settings > Time & language > Speech, choose Add voices and add Japanese, then try again.',
  'immersionUi.readAloud.noVoice.zh': 'No offline Chinese voice is installed. On Windows, open Settings > Time & language > Speech, choose Add voices and add Chinese (Simplified), then try again.',
  'immersionUi.readAloud.noVoice.ru': 'No offline Russian voice is installed. On Windows, open Settings > Time & language > Speech, choose Add voices and add Russian, then try again.',
  'immersionUi.readAloud.noVoice.en': 'No offline English voice is installed. On Windows, open Settings > Time & language > Speech, choose Add voices and add English, then try again.',
  'immersionUi.readAloud.noSynthesizer': 'This computer has no offline speech synthesizer, so the article cannot be read aloud.',
  'immersionUi.readAloud.failed': 'This sentence could not be read aloud. Press Read aloud to try again.',
};
