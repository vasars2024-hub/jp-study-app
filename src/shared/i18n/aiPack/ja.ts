// The lazy AI pack — ja. See ./en.ts.

import type { Catalog } from '../core';
import { AI_FIX_UI_JA } from '../aiFixUi/ja';
import { AI_STUDY_UI_JA } from '../aiStudyUi/ja';
import { AI_PROVIDERS_UI_JA } from '../aiProvidersUi/ja';
import { AI_AGENT_UI_JA } from '../aiAgentUi/ja';
import { AI_IMMERSE_UI_JA } from '../aiImmerseUi/ja';
import { AI_TUTOR_UI_JA } from '../aiTutorUi/ja';
import { AI_SPEAK_UI_JA } from '../aiSpeakUi/ja';
import { AI_SPEAK2_UI_JA } from '../aiSpeak2Ui/ja';
import { AI_STREAM_UI_JA } from '../aiStreamUi/ja';
import { AI_OCR_UI_JA } from '../aiOcrUi/ja';

export const AI_PACK_JA: Catalog = {
  ...AI_FIX_UI_JA,
  ...AI_STUDY_UI_JA,
  ...AI_PROVIDERS_UI_JA,
  ...AI_AGENT_UI_JA,
  ...AI_IMMERSE_UI_JA,
  ...AI_TUTOR_UI_JA,
  ...AI_SPEAK_UI_JA,
  ...AI_SPEAK2_UI_JA,
  ...AI_STREAM_UI_JA,
  ...AI_OCR_UI_JA,
};
