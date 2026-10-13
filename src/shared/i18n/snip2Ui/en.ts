// Snip to cards, round 2 (snip2.) — the first-run notice, review mode, word and
// text corrections, merging into existing cards, per-snip deck, engine and
// confidence, and the Undo window. English source of truth.

import type { Catalog } from '../core';

export const SNIP2_UI_EN: Catalog = {
  // ---- First-run notice (shown once, after the learner turns it on; the default is off) ----
  'snip2.notice.title': 'Snip to cards is on',
  'snip2.notice.body': 'Every picture you snip with Win+Shift+S is read, and its new words become cards. Keep it, or turn it off (the tray and the Snips app can turn it back on).',
  'snip2.notice.turnOff': 'Turn off',
  'snip2.notice.keep': 'Keep on',
  'snip2.notice.turnedOff': 'Snip to cards is off. Turn it on again from the tray or the Snips app.',

  // ---- Toasts ----
  'snip2.toast.review': {
    one: '{count} new word is ready to review.',
    other: '{count} new words are ready to review.',
  },
  'snip2.toast.reviewUnsure': {
    one: 'The OCR was unsure ({percent}%): check {count} word before adding it.',
    other: 'The OCR was unsure ({percent}%): check {count} words before adding them.',
  },
  'snip2.toast.reviewAction': 'Review',
  'snip2.toast.mergedOnly': {
    one: 'No new words; this sentence was added as an example to {count} card you already had.',
    other: 'No new words; this sentence was added as an example to {count} cards you already had.',
  },
  'snip2.toast.mergedToo': {
    one: 'Also a new example on {count} existing card.',
    other: 'Also a new example on {count} existing cards.',
  },
  'snip2.toast.examplesRemoved': {
    one: 'Removed the example it added to {count} card.',
    other: 'Removed the examples it added to {count} cards.',
  },
  'snip2.toast.undoLater': 'Closes in {seconds} s. Undo stays in Snips after that.',
  'snip2.toast.readBy': 'Read by {engine}',
  'snip2.toast.readByConfidence': 'Read by {engine} ({percent}%)',

  // ---- Review mode ----
  'snip2.review.manual': 'Review mode: nothing was added yet. Tick the words you want (fix any that were misread), then add them.',
  'snip2.review.uncertain': 'The OCR was unsure ({percent}%), so nothing was added. Check the words, fix any that were misread, then add the ones you want.',
  'snip2.review.addSelected': {
    one: 'Add {count} selected word',
    other: 'Add {count} selected words',
  },
  'snip2.review.select': 'Choose {word}',
  'snip2.review.pickColumn': 'Choose',
  'snip2.history.review': {
    one: '{count} to review',
    other: '{count} to review',
  },
  'snip2.history.via': 'via {engine}',

  // ---- Word corrections ----
  'snip2.word.edit': 'Correct {word}',
  'snip2.word.editShort': 'Fix',
  'snip2.word.formWord': 'Word (dictionary form)',
  'snip2.word.formReading': 'Reading',
  'snip2.word.save': 'Save',
  'snip2.word.cancel': 'Cancel',
  'snip2.word.edited': 'corrected',
  'snip2.word.merge': 'Add this sentence as an example to the card for {word}',
  'snip2.word.mergeShort': 'Add example',
  'snip2.word.unmerge': 'Remove the example this snip added to the card for {word}',
  'snip2.wstatus.merged': 'Example added',

  // ---- Text correction ----
  'snip2.text.fix': 'Fix the text',
  'snip2.text.label': 'Corrected text',
  'snip2.text.reanalyze': 'Read the words again',
  'snip2.text.undoFirst': 'Undo this snip first to correct its text: its cards must match its words.',
  'snip2.text.original': 'The OCR read: {text}',

  // ---- Per-snip deck ----
  'snip2.deck.label': 'Deck for this snip',
  'snip2.deck.placeholder': 'Default: {deck}',
  'snip2.deck.hint': 'Cards this snip adds go here, and the cards it already added move here.',

  // ---- Undo ----
  'snip2.detail.undoExamples': {
    one: 'Undo: remove the example from {count} card',
    other: 'Undo: remove the examples from {count} cards',
  },
  'snip2.detail.undoHint': 'Undo stays available here for as long as this snip is in your history.',

  // ---- Settings ----
  'snip2.settings.autoAddHint': 'Off: review mode. Each snip lists its new words for you to correct and choose before anything is added. An unsure OCR read always waits for review.',
  'snip2.settings.mergeExisting': 'Add the sentence as an example to words that are already cards',
};
