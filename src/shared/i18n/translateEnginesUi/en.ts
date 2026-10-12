// Translate engines pass (xlate2.): engine choice per language pair, cloud
// consent, offline fallback, the result's source line and the glossary —
// English source of truth.

import type { Catalog } from '../core';

export const TRANSLATE_ENGINES_UI_EN: Catalog = {
  // ---- Engine names (local rows; cloud rows are brand names) ----
  'xlate2.provider.local': 'Offline (small model)',
  'xlate2.provider.localLarge': 'Offline, higher quality (larger, slower)',

  // ---- Engine picker ----
  'xlate2.engine.label': 'Engine',
  'xlate2.engine.hint': 'Remembered separately for each language pair ({pair}).',
  'xlate2.engine.needsKey': 'add an API key in Settings',
  'xlate2.engine.notInstalled': 'not installed',
  'xlate2.engine.fallback': 'Use the offline model if a cloud engine fails',
  'xlate2.engine.fallbackHint': 'When a cloud engine is unavailable, rate-limited or over budget, translate offline instead of showing an error.',
  'xlate2.engine.largeMissing': 'No larger model is installed. The app cannot download one: put a larger Qwen3 model such as {file} in the app\'s models folder or in Downloads and it appears here. It needs 8 GB of memory or more and is several times slower.',
  'xlate2.engine.largeReady': 'Using {file}. Expect each sentence to take several times longer than with the small model.',
  'xlate2.engine.cloudActive': 'Text you translate here in this language pair is sent to {provider} ({host}). Reader popups, subtitles and the dictionary keep translating offline.',
  'xlate2.engine.cloudShort': 'Sent to {provider} for translation',

  // ---- Consent ----
  'xlate2.consent.title': 'Send text to {provider}?',
  'xlate2.consent.body': 'To translate with {provider}, the text you translate is sent over the internet to {host} and processed under {provider}\'s terms. It leaves this device.',
  'xlate2.consent.scope': 'Only the passage and the glossary terms that occur in it are sent. Your history, deck and the rest of your glossary stay here.',
  'xlate2.consent.billingMt': 'Uses your DeepL key and its character allowance. Paid usage counts toward the monthly AI spending limit in Settings.',
  'xlate2.consent.billingLlm': 'Uses your API key. Requests count toward the monthly AI spending limit in Settings.',
  'xlate2.consent.allow': 'Allow {provider}',
  'xlate2.consent.decline': 'Keep translating offline',
  'xlate2.consent.revoke': 'Stop sending text to {provider}',

  // ---- Progress and results ----
  'xlate2.progress.sentences': 'Sentences translated: {done} of {total}',
  'xlate2.result.by': 'Translated by {provider}',
  'xlate2.result.fellBack': '{provider} could not translate this ({reason}), so the offline model did.',
  'xlate2.error.cloud': '{provider} could not translate this: {reason}.',
  'xlate2.error.chain': 'No engine could translate this. {details}.',
  'xlate2.error.attempt': '{provider}: {reason}',
  'xlate2.result.cached': 'Instant (translated earlier)',
  'xlate2.result.cachedHint': 'The same text was translated a moment ago with the same engine and settings, so that translation was reused and nothing was sent.',
  'xlate2.result.partial': 'Incomplete: {missing} of {total} sentences came back untranslated (sentence {sentences}), even after asking again. This result was not saved; translate again to retry.',

  // ---- Study: back-translation and keys ----
  'xlate2.back.action': 'Back-translate',
  'xlate2.back.actionAll': 'Back-translate all',
  'xlate2.back.hint': 'Translate this back into {lang} to check that the meaning survived',
  'xlate2.back.label': 'Back into {lang}:',
  'xlate2.back.working': 'Translating back…',
  'xlate2.back.failed': 'Could not translate back: {reason}',
  'xlate2.keysHintMore': 'Esc stops · Alt+B back-translates every sentence',

  // ---- Why a cloud engine did not answer ----
  'xlate2.fallback.consent': 'you have not allowed it to receive text',
  'xlate2.fallback.noKey': 'no API key is saved',
  'xlate2.fallback.auth': 'the API key was rejected',
  'xlate2.fallback.rateLimit': 'too many requests, try again shortly',
  'xlate2.fallback.quota': 'the account\'s quota is used up',
  'xlate2.fallback.spend': 'the monthly spending limit would be exceeded',
  'xlate2.fallback.offline': 'this computer is offline, so nothing was sent',
  'xlate2.fallback.network': 'the service could not be reached',
  'xlate2.fallback.timeout': 'the request timed out',
  'xlate2.fallback.invalid': 'the reply was not a usable translation',
  'xlate2.fallback.tooLong': 'the text is too long to send at once',
  'xlate2.fallback.notInstalled': 'the model is not installed',
  'xlate2.fallback.unsupported': 'this language pair is not supported',
  'xlate2.fallback.other': 'an unexpected error',

  // ---- Glossary ----
  'xlate2.glossary.toggle': 'Glossary ({count})',
  'xlate2.glossary.title': 'Glossary',
  'xlate2.glossary.intro': 'Terms you always want translated the same way, such as names and fixed expressions. They are applied to every translation that contains them.',
  'xlate2.glossary.term': 'Term',
  'xlate2.glossary.rendering': 'Always translate as',
  'xlate2.glossary.pairOnly': 'Only for {pair}',
  'xlate2.glossary.add': 'Save term',
  'xlate2.glossary.saved': 'Saved "{term}".',
  'xlate2.glossary.invalid': 'Enter a term and a different translation, up to 80 characters each.',
  'xlate2.glossary.suggestTitle': 'Suggested from your deck ({count})',
  'xlate2.glossary.useSuggestion': 'Add',
  'xlate2.glossary.empty': 'No glossary terms for {pair} yet.',
  'xlate2.glossary.listLabel': 'Glossary terms for {pair}',
  'xlate2.glossary.allPairs': 'all language pairs',
  'xlate2.glossary.fromDeck': 'from your deck',
  'xlate2.glossary.edit': 'Edit',
  'xlate2.glossary.otherPairs': {
    one: '{count} more term applies to other language pairs.',
    other: '{count} more terms apply to other language pairs.',
  },
  'xlate2.glossary.namesTitle': 'Names in this passage ({count})',
  'xlate2.glossary.namesHint': 'Keep a name spelled the same way in every translation. Check the spelling: it is read from the dictionary reading, not from the text.',
  'xlate2.glossary.report': 'Glossary terms followed: {count} of {total}.',
  'xlate2.glossary.missing': 'Not followed: {terms}.',

  // ---- Credentials row ----
  'xlate2.credential.deeplDesc': 'DeepL\'s machine translation API, an optional engine for the Translate workbench.',
  'xlate2.credential.deeplFreeTier': 'DeepL API Free keys end in ":fx" and include a monthly character allowance; see your DeepL account for the current limit.',
  'xlate2.credential.useTranslate': 'Translate workbench (optional cloud engine)',
};
