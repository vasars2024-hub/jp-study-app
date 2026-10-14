// The lazy AI pack — every string of the optional AI features, merged into the
// loaded catalogs the first time an AI surface needs it (`../catalogs.ts`,
// "Lazily merged packs"). Kept out of the eager catalogs because the English
// one is static in every window: these ~50 KB were Blanc's boot cost for
// features a Blanc session may never open.
//
// Only the loader (by dynamic `import()`), `src/main/i18n.ts` (main has no boot
// budget and throws AI errors through `mt()`), the tooling aggregate
// `../catalogs/all.ts` and the test setup may import this —
// `src/shared/__tests__/i18nSplit.test.ts` enforces it.
//
// Keys here must start with one of `AI_PACK_PREFIXES` (../catalogs.ts), or also
// be in the eager catalog: a key the loader cannot attribute to the pack would
// render raw until something else loaded it. `i18nLazyPacks.test.ts` checks.

import type { Catalog } from '../core';
import { AI_FIX_UI_EN } from '../aiFixUi/en';
import { AI_STUDY_UI_EN } from '../aiStudyUi/en';
import { AI_PROVIDERS_UI_EN } from '../aiProvidersUi/en';
import { AI_AGENT_UI_EN } from '../aiAgentUi/en';
import { AI_IMMERSE_UI_EN } from '../aiImmerseUi/en';
import { AI_TUTOR_UI_EN } from '../aiTutorUi/en';
import { AI_SPEAK_UI_EN } from '../aiSpeakUi/en';
import { AI_SPEAK2_UI_EN } from '../aiSpeak2Ui/en';
import { AI_STREAM_UI_EN } from '../aiStreamUi/en';

export const AI_PACK_EN: Catalog = {
  ...AI_FIX_UI_EN,
  ...AI_STUDY_UI_EN,
  ...AI_PROVIDERS_UI_EN,
  ...AI_AGENT_UI_EN,
  ...AI_IMMERSE_UI_EN,
  ...AI_TUTOR_UI_EN,
  ...AI_SPEAK_UI_EN,
  ...AI_SPEAK2_UI_EN,
  ...AI_STREAM_UI_EN,
};
