// Novel reader extras (in-book search, link import, coded web-import and Jiten
// errors) — a lazy pack: English is bundled with the reader, ja/zh/ru load on
// first use (renderer/novelReaderUiStrings.ts), so none of it is in the boot
// catalogs. English source of truth
import type { Catalog } from '../core';

export const NOVEL_READER_UI_EN: Catalog = {
  'novelReaderUi.translate.autoFailed': 'Automatic translation failed. Press Translate to try again.',
  'novelReaderUi.link.importing': 'Importing the page as a book…',
  'novelReaderUi.link.saved': 'Saved to your library: {title}',
  'novelReaderUi.link.openedInBrowser': '{reason} The page was opened in your browser instead.',
  'novelReaderUi.import.noArticle': 'No readable article was found on this page, so there is nothing to import.',
  'novelReaderUi.import.failed': 'This page could not be imported. Try again in a moment.',
  'novelReaderUi.import.wikiFailed': 'Wikipedia did not send an article. Try again in a moment.',
  'novelReaderUi.novels.jitenNetwork': 'Jiten could not be reached. Check your connection and try again.',
  'novelReaderUi.novels.jitenHttp': 'Jiten answered with error {status}. Try again later.',
  'novelReaderUi.novels.jitenFailed': 'The Jiten catalogue could not be loaded. Try again later.',
  'novelReaderUi.novels.sourcesFailed': 'The source settings could not be saved. Check the address and key, then try again.',
  'novelReaderUi.search.open': 'Search in book (Ctrl+F)',
  'novelReaderUi.search.aria': 'Search in this book',
  'novelReaderUi.search.placeholder': 'Search this book',
  'novelReaderUi.search.prev': 'Previous match',
  'novelReaderUi.search.next': 'Next match',
  'novelReaderUi.search.count': '{current} of {total}',
  'novelReaderUi.search.none': 'No matches',
  'novelReaderUi.search.capped': 'Only the first {max} matches are listed.',
  'novelReaderUi.search.ignoreWidth': 'Kana and width',
  'novelReaderUi.search.ignoreWidthTitle': 'Match hiragana with katakana, and full-width letters and digits with half-width ones',
  'novelReaderUi.search.results': 'Matches',
  'novelReaderUi.search.chapter': 'Part {n}',
};
