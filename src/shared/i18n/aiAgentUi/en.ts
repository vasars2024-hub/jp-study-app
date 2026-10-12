// Agent and media-assistant AI fixes: the Agent's provider targets (Claude,
// OpenAI, a local OpenAI-compatible server), the per-feature cloud opt-ins for
// the Agent, the media/VN assistant, subtitle fusion and Anki AI additions, the
// Agent's theme tools outside Blanc, and the assistant's study-language labels.
// English source of truth.

import type { Catalog } from '../core';

export const AI_AGENT_UI_EN: Catalog = {
  // Agent target picker.
  'aiAgent.target.claudeHaiku': 'Claude Haiku 5.5',
  'aiAgent.target.claudeSonnet': 'Claude Sonnet 5.5',
  'aiAgent.target.claudeOpus': 'Claude Opus 5.5',
  'aiAgent.target.openai': 'OpenAI',
  'aiAgent.target.compatible': 'Local server (Ollama, LM Studio)',

  // Settings > AI > What may use the cloud.

  // Agent theme tools in Study OS, Aero and Wired.
  'aiAgent.theme.unknown': 'Name a theme the app offers: {themes}.',
  'aiAgent.theme.cssBlancOnly':
    'Custom CSS styles only the Blanc toolbox. Ask for it from Blanc, or choose a theme here instead.',

  // Media / VN assistant, for a learner whose study language is not Japanese.
  'aiAgent.assistant.mode.simplify': 'Simplify the line',
  'aiAgent.assistant.simplified': 'Simpler version',
};
