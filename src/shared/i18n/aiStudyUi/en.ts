// Optional AI study helpers (docs/AI_AUDIT.md N1, N2, N3, N5): "Why was I
// wrong?", i+1 example sentences, leech rescue and "Explain in context".
// English source of truth.

import type { Catalog } from '../core';

export const AI_STUDY_UI_EN: Catalog = {
  // ---- Settings > AI: per-feature cloud opt-ins ----

  // ---- shared ----
  'aiStudy.badge': 'AI suggestion',
  'aiStudy.busy': 'Asking the AI…',
  'aiStudy.cancel': 'Cancel',
  'aiStudy.askAgain': 'Ask again',
  'aiStudy.retry': 'Try again',
  'aiStudy.cached': 'Saved answer — nothing was sent.',
  'aiStudy.needsKey': 'This optional helper needs an AI provider key or the offline model.',
  'aiStudy.needsLocalModel': 'The offline AI model is not installed yet.',
  'aiStudy.needsConsent': 'This helper is not allowed to use the cloud. Allow it in Settings > AI, or switch the engine to Offline.',
  'aiStudy.openSettings': 'Open Settings > AI',

  // ---- N1 Why was I wrong? ----
  'aiStudy.whyWrong.button': 'Why was I wrong?',
  'aiStudy.whyWrong.title': 'Why was I wrong?',
  'aiStudy.whyWrong.fromDeck': 'From your deck',
  'aiStudy.whyWrong.busy': 'Looking at what went wrong…',
  'aiStudy.whyWrong.ask': 'Ask the AI',
  'aiStudy.whyWrong.tip': 'Tip: {tip}',
  'aiStudy.whyWrong.acceptable': 'The AI thinks your answer is also correct: {reason}',
  'aiStudy.whyWrong.accept': 'Accept "{answer}" as correct',
  'aiStudy.whyWrong.accepted': '"{answer}" will be accepted for this card from now on.',
  'aiStudy.whyWrong.note.typo': 'Looks like a typo: "{typed}" is very close to "{expected}".',
  'aiStudy.whyWrong.note.other-card': '"{typed}" is the answer to another card in your deck: {word} — {meaning}.',
  'aiStudy.whyWrong.note.typed-shares-kanji': '"{typed}" shares {chars} with "{expected}" but is a different word.',
  'aiStudy.whyWrong.note.homophone': 'Same reading as {word} ({reading}) — {meaning}.',
  'aiStudy.whyWrong.note.shared-kanji': 'Shares {chars} with {word} — {meaning}.',
  'aiStudy.whyWrong.note.similar-meaning': 'Similar meaning to {word} — {meaning}.',
  'aiStudy.whyWrong.note.no-clue': 'No similar card in your deck. Re-read {word} with its example sentence.',

  // ---- card extras ----
  'aiStudy.extras.mnemonic': 'Memory aid:',
  'aiStudy.extras.distinction': 'Not to confuse with:',
  'aiStudy.extras.examples': 'Example sentences',
  'aiStudy.extras.originAi': 'AI-written',
  'aiStudy.extras.originCorpus': 'From the example corpus',
  'aiStudy.extras.remove': 'Remove example "{text}"',
  'aiStudy.extras.empty': 'Nothing saved for this card yet: no memory aid, notes or example sentences.',
  'aiStudy.extras.accepted': 'Also accepted as correct',
  'aiStudy.extras.acceptedRemove': 'Stop accepting "{answer}"',
  'aiStudy.extras.edit': 'Edit',
  'aiStudy.extras.save': 'Save',
  'aiStudy.extras.cancelEdit': 'Cancel',
  'aiStudy.extras.removeMnemonic': 'Remove the memory aid',
  'aiStudy.extras.removeDistinction': 'Remove the "not to confuse with" note',

  // ---- N2 i+1 example sentences ----
  'aiStudy.examples.button': 'i+1 example sentences',
  'aiStudy.examples.title': 'Example sentences you can read',
  'aiStudy.examples.about': 'Sentences are checked against the words you know: any with more than one unknown word are discarded. Nothing is added until you choose.',
  'aiStudy.examples.generate': 'Write with AI',
  'aiStudy.examples.corpus': 'Find in the example corpus',
  'aiStudy.examples.busy': 'Writing example sentences…',
  'aiStudy.examples.checking': 'Checking the sentences against the words you know…',
  'aiStudy.examples.corpusEmpty': 'The example corpus has no new sentence for this word.',
  'aiStudy.examples.corpusError': 'The example corpus could not be searched.',
  'aiStudy.examples.offered': 'Choose which to add',
  'aiStudy.examples.unchecked': 'Could not be checked against your known words.',
  'aiStudy.examples.coverage': '{percent}% known · {unknown} unknown',
  'aiStudy.examples.discarded': { one: '{count} sentence discarded (too many unknown words)', other: '{count} sentences discarded (too many unknown words)' },
  'aiStudy.examples.noneLeft': 'No sentence passed the check. Try again or use the example corpus.',
  'aiStudy.examples.add': 'Add to card',
  'aiStudy.examples.added': { one: '{count} example added to the card.', other: '{count} examples added to the card.' },

  // ---- N3 leech rescue ----
  'aiStudy.leech.button': 'Suggest rescue',
  'aiStudy.leech.batchButton': { one: 'Suggest rescue for {count} leech', other: 'Suggest rescue for {count} leeches' },
  'aiStudy.leech.title': 'Leech rescue',
  'aiStudy.leech.batchTitle': { one: 'Leech rescue · {count} card', other: 'Leech rescue · {count} cards' },
  'aiStudy.leech.about': 'Suggestions are only written to a card when you approve them.',
  'aiStudy.leech.suggestAll': 'Suggest for all',
  'aiStudy.leech.suggestOne': 'Suggest',
  'aiStudy.leech.stop': 'Stop',
  'aiStudy.leech.busy': 'Thinking of a rescue…',
  'aiStudy.leech.clearerMeaning': 'Clearer meaning:',
  'aiStudy.leech.currentMeaning': 'Replaces the current meaning: {meaning}',
  'aiStudy.leech.replaces': 'An approved memory aid or note replaces the one the card has now.',
  'aiStudy.leech.approve': 'Approve',
  'aiStudy.leech.reject': 'Reject',
  'aiStudy.leech.applied': 'Applied to the card.',
  'aiStudy.leech.rejected': 'Rejected — nothing was changed.',
  'aiStudy.leech.fallback': 'Without AI:',
  'aiStudy.leech.hint': 'hint "{hint}".',
  'aiStudy.leech.noHint': 'the reading is too short for a hint.',
  'aiStudy.leech.compare': 'Compare with: {words}.',
  'aiStudy.leech.useHint': 'Use the hint as memory aid',
  'aiStudy.leech.retry': 'Try the AI again',

  // ---- N5 explain in context ----
  'aiStudy.context.button': 'Explain in context',
  'aiStudy.context.title': 'In this sentence',
  'aiStudy.context.busy': 'Finding the sense this sentence uses…',
  'aiStudy.context.fits': 'fits here',
  'aiStudy.context.mostCommon': 'most common',
  'aiStudy.context.noneFits': 'None of the listed senses quite fits this sentence.',
  'aiStudy.context.confidence.high': 'Confidence: high',
  'aiStudy.context.confidence.medium': 'Confidence: medium',
  'aiStudy.context.confidence.low': 'Confidence: low',
  'aiStudy.context.fallbackNote': 'Without AI the first sense is marked: dictionaries list the most common sense first.',
};
