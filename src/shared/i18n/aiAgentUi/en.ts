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

  // The planner's refusals, by the code main returns (agentPlanFailureKeys.ts).
  'aiAgent.planError.invalidRequest': 'Describe what the Agent should do first.',
  'aiAgent.planError.aiOff': 'AI features are turned off in Settings → AI.',
  'aiAgent.planError.agentDisabled': 'The Agent is turned off. Turn it on in Settings → AI.',
  'aiAgent.planError.modelMissing':
    'No offline model is installed and no cloud key is saved, so no plan could be made. Set one up in Settings → AI.',
  'aiAgent.planError.cloudKeyMissing': 'The cloud planner has no API key. Add one in Settings → AI.',
  'aiAgent.planError.spendBudget': 'Making this plan in the cloud would exceed the monthly spending limit.',
  'aiAgent.planError.cloudDisabled':
    'The Agent may not use the cloud. Allow it in Settings → AI → What may use the cloud, or install an offline model.',
  'aiAgent.planError.objectiveTooLong': 'Plans take a request of 500 characters or fewer. Shorten it and try again.',
  'aiAgent.planError.contextOverflow':
    "This request does not fit the offline model's context. Raise the context size in Settings → AI, or shorten the request and what is attached to it.",
  'aiAgent.planError.timeout': 'The model took too long to make a plan. Try again, or ask for less at once.',
  'aiAgent.planError.planInvalid':
    "The model's answer was not a plan the Agent can run. Try again, or rephrase the request.",
  'aiAgent.planError.plannerFailed': 'The plan could not be made. Try again, or check Settings → AI.',

  // The tool-result loop, under the plan queue.
  'aiAgent.loop.planned': 'Planned the next steps from the results (round {round} of {max}).',
  'aiAgent.loop.done': 'Done: nothing more is needed for this request.',
  'aiAgent.loop.doneSummary': 'Done: {summary}',

  // flashcard.schedule-reviews.
  'aiAgent.reviews.changedSince':
    'Some of these cards were reviewed or rescheduled since, so nothing was changed.',
  'aiAgent.reviews.folderNotFound': 'There is no deck folder named “{folder}”.',
};
