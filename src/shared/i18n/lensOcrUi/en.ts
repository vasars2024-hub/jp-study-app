// Reading Lens scan progress, cancel, result cache and the bundled offline
// recognizer (lensOcr.) — English source of truth.

import type { Catalog } from '../core';

export const LENS_OCR_UI_EN: Catalog = {
  // ---- Scan progress ----
  'lensOcr.stage.refining': 'Reading the small text more closely…',
  'lensOcr.stage.basic': 'Reading with the built-in recognizer… {percent}%',
  'lensOcr.cancel': 'Cancel',
  'lensOcr.cancelHint': 'Stop this scan and draw a new region. Esc closes the Lens.',

  // ---- Result cache ----
  'lensOcr.cached': 'Instant',
  'lensOcr.cachedHint': 'The same picture was read a moment ago, so that read was reused.',

  // ---- Bundled offline recognizer ----
  'lensOcr.basic.badge': 'Basic OCR',
  'lensOcr.basic.badgeHint': 'Read by the recognizer built into the app, with no download.',
  'lensOcr.basic.notice': 'Read with the built-in offline recognizer because the accurate model is not installed. It reads clear text well; install the model for stylised, tiny or blurry text.',

  // ---- Watch region ----
  'lensOcr.watch.start': 'Watch',
  'lensOcr.watch.startHint': 'Keep this region: read it again by itself whenever its text changes (a visual novel or game text box).',
  'lensOcr.watch.selectHint': 'Drag over the text box to watch',
  'lensOcr.watch.panel': 'Watched region',
  'lensOcr.watch.active': 'Watching this region',
  'lensOcr.watch.reading': 'Reading the new text…',
  'lensOcr.watch.empty': 'No text in the region right now.',
  'lensOcr.watch.waiting': 'The text appears here each time it changes.',
  'lensOcr.watch.stop': 'Stop watching',
  'lensOcr.watch.stopHint': 'Stop re-reading this region. The last read stays here until you close the Lens.',
};
