// The lazy AI pack — zh. See ./en.ts.

import type { Catalog } from '../core';
import { AI_FIX_UI_ZH } from '../aiFixUi/zh';
import { AI_STUDY_UI_ZH } from '../aiStudyUi/zh';
import { AI_PROVIDERS_UI_ZH } from '../aiProvidersUi/zh';
import { AI_AGENT_UI_ZH } from '../aiAgentUi/zh';
import { AI_IMMERSE_UI_ZH } from '../aiImmerseUi/zh';
import { AI_TUTOR_UI_ZH } from '../aiTutorUi/zh';
import { AI_SPEAK_UI_ZH } from '../aiSpeakUi/zh';
import { AI_SPEAK2_UI_ZH } from '../aiSpeak2Ui/zh';
import { AI_STREAM_UI_ZH } from '../aiStreamUi/zh';

export const AI_PACK_ZH: Catalog = {
  ...AI_FIX_UI_ZH,
  ...AI_STUDY_UI_ZH,
  ...AI_PROVIDERS_UI_ZH,
  ...AI_AGENT_UI_ZH,
  ...AI_IMMERSE_UI_ZH,
  ...AI_TUTOR_UI_ZH,
  ...AI_SPEAK_UI_ZH,
  ...AI_SPEAK2_UI_ZH,
  ...AI_STREAM_UI_ZH,
};
