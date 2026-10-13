// onb3: first-run setup follow-ups (the built-in dictionary being set up, the
// Blanc look and the tour), plus translated replacements for raw English error
// text in the manga reader and the visual-novel panels. — English source of truth.

import type { Catalog } from '../core';

export const ONB3_UI_EN: Catalog = {
  // First-run setup, downloads step: the bundled JMdict while main imports it.
  'onb3.dl.builtInSettingUpDesc':
    'The Japanese-English dictionary ships with the app and is being set up now. There is nothing to download.',
  'onb3.dl.builtInSettingUp': 'Setting up, {percent}%',
  'onb3.dl.builtInSettingUpIndeterminate': 'Setting up…',
  // First-run setup, finish step, when the Blanc look was picked.
  'onb3.finish.blancTour':
    'The guided tour walks through the Study OS desktop. Blanc opens in its own window, so the tour waits in Help for whenever you want it.',

  // Manga reader OCR.
  'onb3.manga.pageMissing': 'This page is no longer in the library. Reopen the manga and scan again.',
  'onb3.manga.regionTooSmall': 'That area is too small to read. Drag a larger box around the text.',
  'onb3.manga.phase.ocr': 'Reading text',
  'onb3.manga.phase.translate': 'Translating',

  // Visual novels.
  'onb3.vn.scanFailed': 'Could not scan that folder.',
  'onb3.vn.analyzeFailed': 'Could not analyze this line.',
  'onb3.vn.agent.addFailed': 'Could not add the visual novel.',
  'onb3.vn.agent.routesFailed': 'Could not save the route.',
  'onb3.vn.agent.captureFailed': 'Could not save the captured line.',
};
