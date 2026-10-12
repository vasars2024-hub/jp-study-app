// AI provider layer: Settings > AI provider/model pickers, the local
// OpenAI-compatible server, "Test connection", per-feature cloud opt-ins, AI
// error codes named in the user's language, AI Card Studio errors, and Mirror
// Writing's app-AI / custom-endpoint backends. English source of truth.

import type { Catalog } from '../core';

export const AI_PROVIDERS_UI_EN: Catalog = {
  'aiProv.cancel': 'Cancel',
  'aiProv.saveFailed': 'That change could not be saved. Try again.',

  // Provider and model pickers.
  'aiProv.vendor.local': 'Local server (Ollama, LM Studio)',
  'aiProv.model.label': 'Model',
  'aiProv.model.invalid': 'Model names have no spaces.',
  'aiProv.modelHint.haiku': 'Fast and inexpensive: the best fit for per-line work such as subtitles and quick analysis.',
  'aiProv.modelHint.sonnet': 'Balanced quality for explanations, card generation and corrections.',
  'aiProv.modelHint.opus': 'The most capable and the most expensive. Use it for long essays and hard questions.',
  'aiProv.modelHint.deepseekFlash': 'Economical, with a very long context.',
  'aiProv.modelHint.deepseekPro': 'Higher quality than Flash, at a higher price.',
  'aiProv.modelHint.openai': 'Type any model your OpenAI account can use. Empty uses gpt-5-mini.',
  'aiProv.modelHint.local':
    'Runs on your own computer with Ollama or LM Studio. Nothing is sent to the internet when the server is on this computer.',
  'aiProv.key.optional': 'API key (optional)',
  'aiProv.local.url': 'Server URL',
  'aiProv.local.urlInvalid': 'Enter an http:// or https:// address without a user name or password.',
  'aiProv.local.ready': 'The server URL and model are set.',
  'aiProv.local.notReady': 'Set the server URL and the model to use this server.',

  // Test connection.
  'aiProv.test.button': 'Test connection',
  'aiProv.test.running': 'Testing…',
  'aiProv.test.ok': 'Connected ({ms} ms).',
  'aiProv.test.okModel': 'Connected to {model} ({ms} ms).',
  'aiProv.test.failedStatus': '{reason} (HTTP {status})',
  'aiProv.test.note':
    'The test sends one fixed word, never your text, and asks for a few tokens of reply. Cloud tests count toward your spending like any request.',

  // Per-feature cloud opt-ins.

  'aiProv.rates.none': 'No built-in estimate: enter a rate if this server bills you',

  // AI errors, by code.
  'aiProv.error.ai-off': 'AI features are turned off. Turn them on in Settings → AI.',
  'aiProv.error.cloud-disabled':
    'This feature is not allowed to use the cloud. Allow it in Settings → AI, or switch the engine to Offline.',
  'aiProv.error.missing-credential': 'No API key is saved for this provider (or the local server is not set up).',
  'aiProv.error.authentication': 'The provider rejected the API key. Check the key and its access.',
  'aiProv.error.rate-limit': 'The provider’s rate limit was reached. Wait a moment and try again.',
  'aiProv.error.upstream': 'The provider returned an error. Try again in a moment.',
  'aiProv.error.network': 'Could not reach the provider. Check the connection, or that the local server is running.',
  'aiProv.error.timeout': 'The provider took too long to answer. Try fewer items.',
  'aiProv.error.cancelled': 'Cancelled.',
  'aiProv.error.invalid-response': 'The provider’s answer could not be used. Try again or switch model.',
  'aiProv.error.output-truncated': 'The answer was cut off at the output limit. Try fewer items.',
  'aiProv.error.spend-budget': 'This would go over your monthly AI spending limit (Settings → AI).',
  'aiProv.error.cost-budget': 'This request is over the per-request cost limit.',
  'aiProv.error.vision-unsupported': 'This model cannot read images. Choose one that can.',
  'aiProv.error.unknown-provider': 'This AI provider is not known to this version of the app.',
  'aiProv.error.local-model-missing': 'The offline model is not installed. Install it in Settings → AI.',
  'aiProv.error.generic': 'The AI request failed.',

  // AI Card Studio.
  'aiProv.mining.needKey': 'Add a {provider} API key in Settings → AI before generating cards.',
  'aiProv.mining.needLocalModel': 'The offline model is not installed. Install it in Settings → AI, or switch the engine to Cloud.',
  'aiProv.mining.noTerms': 'Star words in the Dictionary first, or switch to preset generation.',
  'aiProv.mining.noItems': 'The AI returned no vocabulary items for this preset.',
  'aiProv.mining.onlyDuplicates': 'The AI returned only duplicate vocabulary items. Try again or switch provider.',
  'aiProv.mining.noUsable': 'The AI returned items, but none had a usable expression.',

  // Credentials.

  // Mirror Writing.
};
