// Types shared between the Electron main process and the React renderer.

export type LibraryKind = 'book' | 'manga';

export interface Progress {
  /** Current page index for manga (0-based). */
  page?: number;
  /** EPUB CFI location string for books. */
  location?: string;
  /** Overall progress, 0..1. */
  percent?: number;
}

// ----- Dictionary lookup (Jisho) -----------------------------------------

export interface DictSense {
  partsOfSpeech: string[];
  definitions: string[];
  tags: string[];
}

export interface DictEntry {
  /** Primary kanji/expression form (falls back to the reading if kana-only). */
  word: string;
  /** Kana reading. */
  reading: string;
  isCommon: boolean;
  /** e.g. ["N5"]. */
  jlpt: string[];
  senses: DictSense[];
  /** Inline-styled Tokyo pitch pattern HTML (Phase D). */
  pitchHtml?: string;
  /** Corpus frequency rank — lower is more common (Phase D). */
  frequency?: number;
  /** Structured glossary HTML from a Yomitan term bank (Phase D). */
  glossaryHtml?: string;
  /** Title of the dictionary this entry's glossary came from. */
  source?: string;
  /** Gloss language codes of the source dictionary (e.g. ['ru']). */
  sourceLangs?: string[];
}

/** Installed Yomitan dictionary metadata (Settings list). */
export interface YomitanDictInfo {
  id: string;
  title: string;
  revision: string;
  /** Order rank — lower wins. Kept in sync with the registry array order. */
  priority: number;
  hasTerms: boolean;
  hasPitch: boolean;
  hasFreq: boolean;
  importedAt: number;
  bundled?: boolean;
  /** When false, the dictionary is kept but ignored by lookups/mining. */
  enabled?: boolean;
  /** Detected gloss language codes (from index metadata, title, or script sampling). */
  glossLangs?: string[];
  /** Manual language override from Settings — wins over detection. */
  glossLangOverride?: string;
}

export interface DictResult {
  query: string;
  entries: DictEntry[];
  /** Set when the lookup itself failed (e.g. offline). */
  error?: string;
}

// ----- Example sentences (Tatoeba) ---------------------------------------

export interface ExampleSentence {
  /** Japanese sentence. */
  jp: string;
  /** English translation. */
  en: string;
}

export interface ExampleResult {
  query: string;
  examples: ExampleSentence[];
  /** Set when the search itself failed (e.g. offline). */
  error?: string;
}

// ----- Media player -------------------------------------------------------

/** A video/audio file saved in the media library (the file is referenced in
 *  place, never copied). */
export interface MediaItem {
  id: string;
  /** Cleaned, human-readable title (release tags stripped) — also the MAL query. */
  title: string;
  /** Absolute source path on disk. */
  path: string;
  /** Original file name. */
  fileName: string;
  addedAt: number;
  lastPlayedAt?: number;
  /** Resume position in seconds. */
  positionSec?: number;
}

/** Returned when a media file is opened: the library item + a playable URL. */
export interface MediaOpen {
  item: MediaItem;
  /** A playfile:// URL the renderer can put in a <video>/<audio> src. */
  url: string;
}

export interface SubtitlePick {
  name: string;
  /** Raw subtitle file text (.srt/.vtt/.ass), parsed in the renderer. */
  text: string;
}

// ----- Anki (AnkiConnect) -------------------------------------------------

export interface AnkiStatus {
  connected: boolean;
  decks: string[];
  models: string[];
  /** Set when not connected: a short human-readable reason. */
  error?: string;
}

export interface AnkiAddRequest {
  deck: string;
  model: string;
  front: string;
  back: string;
  /** The sentence the word was found in (reader/subtitle), for mining cards. */
  context?: string;
}

export interface AnkiAddResult {
  ok: boolean;
  /** "duplicate" when the note already exists, otherwise an error message. */
  error?: string;
}

export interface LibraryItem {
  id: string;
  title: string;
  kind: LibraryKind;
  createdAt: number;
  lastReadAt?: number;

  /** Absolute path the item was imported from; used to de-duplicate auto-imports. */
  sourcePath?: string;

  /** Book only: relative path to the epub inside the item folder. */
  epubFile?: string;

  /** Manga only: number of pages. */
  pageCount?: number;
  /** Relative path to the cover image inside the item folder (book or manga). */
  coverPath?: string;

  /** User-made library folder this item is filed under (undefined = unfiled). */
  folder?: string;

  progress?: Progress;
}
