// Novel/manga reader, dictionary popup and reader mining chrome (round-2 reader pass). — English source of truth.

import type { Catalog } from '../core';

export const READER_UI_EN: Catalog = {
  'readerUi.dictPopup.aria': 'Dictionary: {query}',
  'readerUi.dictPopup.levels': 'How well you know this word',
  'readerUi.dictPopup.mine': 'Mine',
  'readerUi.dictPopup.mineTitle': 'Save this word and its sentence to the reader collection',
  'readerUi.lookup.noSelection': 'Select a word, or point at one in the text, then press the shortcut again to look it up.',
  'readerUi.gloss.langs': 'Definition languages',
  'readerUi.gloss.otherHidden': 'Definitions in other languages are hidden. Turn a language on above to show them.',
  'readerUi.translate.popupAria': 'Translation: {text}',
  'readerUi.translate.preparing': 'Preparing translator…',
  'readerUi.translate.loadingModel': 'Loading model… {pct}%',
  'readerUi.translate.translating': 'Translating…',
  'readerUi.translate.to': 'Translate to',
  'readerUi.translate.openAiSettings': 'Open AI settings',
  'readerUi.study.askAgent': 'Ask Agent',
  'readerUi.study.askPassage': 'Ask about paragraph',
  'readerUi.study.collection': 'Collection',
  'readerUi.manga.ocrAuto': 'Auto',
  'readerUi.manga.ocrAutoTitle': 'Read vertical or horizontal text from the shape of the page or box',
  'readerUi.manga.drawBox': 'Draw box',
  'readerUi.manga.drawBoxTitle': 'Drag a box around text on the page to read it',
  'readerUi.manga.drawBoxHint': 'Drag a box around the text you want to read.',
  'readerUi.manga.handwriting': 'Handwriting',
  'readerUi.manga.handwritingTitle': 'Draw a character by hand to look it up',
};
