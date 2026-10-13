// The lazy AI pack — ru. See ./en.ts.

import type { Catalog } from '../core';
import { AI_FIX_UI_RU } from '../aiFixUi/ru';
import { AI_STUDY_UI_RU } from '../aiStudyUi/ru';
import { AI_PROVIDERS_UI_RU } from '../aiProvidersUi/ru';
import { AI_AGENT_UI_RU } from '../aiAgentUi/ru';
import { AI_IMMERSE_UI_RU } from '../aiImmerseUi/ru';
import { AI_TUTOR_UI_RU } from '../aiTutorUi/ru';
import { AI_SPEAK_UI_RU } from '../aiSpeakUi/ru';
import { AI_SPEAK2_UI_RU } from '../aiSpeak2Ui/ru';

export const AI_PACK_RU: Catalog = {
  ...AI_FIX_UI_RU,
  ...AI_STUDY_UI_RU,
  ...AI_PROVIDERS_UI_RU,
  ...AI_AGENT_UI_RU,
  ...AI_IMMERSE_UI_RU,
  ...AI_TUTOR_UI_RU,
  ...AI_SPEAK_UI_RU,
  ...AI_SPEAK2_UI_RU,
};
