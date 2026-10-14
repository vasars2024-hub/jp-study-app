// Streaming AI replies (docs/AI_AUDIT.md F9): the draft shown while a reply is
// being written, and what is kept after a Cancel. English source of truth. Part
// of the lazy AI pack (`../aiPack`), under its `aiStudy.` prefix.

import type { Catalog } from '../core';

export const AI_STREAM_UI_EN: Catalog = {
  'aiStudy.stream.drafting': 'Writing…',
  'aiStudy.stream.stopped': 'Stopped. This is as far as the answer got.',
  'aiStudy.stream.stop': 'Stop',
  'aiStudy.stream.cards': 'Cards being written',
};
