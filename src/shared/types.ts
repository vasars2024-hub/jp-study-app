// Types shared between the Electron main process and the React renderer.

export type LibraryKind = 'book' | 'manga';

export interface Progress {
  /** Current page index for manga (0-based). */
  page?: number;
  /**
   * Saved position for books, in the novel reader's own format:
   * `p:<partIndex>:<fractionWithinPart>` (NovelReader.tsx `saveNow` / `parseLoc`).
   * Very old saves are a bare number — a fraction of the whole book.
   * Despite the name this has never been an EPUB CFI.
   */
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
  /**
   * IPA transcriptions from an installed Yomitan IPA dictionary, in the order
   * the dictionary lists them. Absent when no IPA source covers the word.
   */
  ipa?: string[];
  /** Corpus frequency rank — lower is more common (Phase D). */
  frequency?: number;
  /**
   * Title of the frequency dictionary `frequency` came from.
   *
   * Several installed banks can rank the same word and the lowest number wins
   * the merge, so the rank on its own does not say who counted. Absent on
   * entries produced before this field existed, and on any rank the merge
   * cannot attribute — a surface must then present the number unattributed
   * rather than name a source it does not have.
   */
  frequencySource?: string;
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
  /** Carries a Yomitan kanji bank (character readings / meanings / stats). */
  hasKanji?: boolean;
  /** Carries Yomitan `ipa` term_meta rows (IPA transcriptions). */
  hasIpa?: boolean;
  importedAt: number;
  bundled?: boolean;
  /** When false, the dictionary is kept but ignored by lookups/mining. */
  enabled?: boolean;
  /** Detected gloss language codes (from index metadata, title, or script sampling). */
  glossLangs?: string[];
  /** Manual language override from Settings — wins over detection. */
  glossLangOverride?: string;
}

/** Conjugation trace when the query was matched via de-inflection (see shared/deinflect.ts). */
export interface DeinflectionInfo {
  /** The surface form the user looked up (e.g. 食べさせられた). */
  source: string;
  /** The dictionary form matched (e.g. 食べる). */
  term: string;
  /** Reasons inner→outer (e.g. ['causative', 'passive/potential', 'past']). */
  reasons: string[];
}

export interface DictResult {
  query: string;
  entries: DictEntry[];
  /** Grounded metadata for an exact one-character lookup, when available. */
  character?: {
    lang: string;
    char: string;
    strokes?: number;
    radical?: string;
    components: string[];
    readings: string[];
    meanings: string[];
    jlpt?: string;
    hsk?: string;
    grade?: number;
    frequency?: number;
    sources: Array<{
      dictId: string;
      dictTitle: string;
      licence?: string;
      attribution?: string;
    }>;
  };
  /** Present when `entries` were found by de-inflecting a conjugated `query`. */
  deinflection?: DeinflectionInfo;
  /**
   * Every entry is a close spelling of `query`, not a match for it.
   *
   * Only ever set on a result that had no exact match at all, so a surface can
   * say so plainly instead of presenting near-misses as if the user's word had
   * been found.
   */
  approximate?: boolean;
  /**
   * `entries` is a page, not the whole answer — more matches were cut off.
   *
   * Set only by the database path, which is the only lookup that knows it
   * truncated; a legacy or network result leaves it absent rather than
   * guessing. Surfaces must say so, because a truncated list rendered as a
   * complete one is indistinguishable from "that is all this word has".
   */
  truncated?: true;
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
  /** Phase 5b: video vs audio vs long-form audio. */
  kind?: import('./mediaKind').MediaKind;
  /** Optional duration from probe (seconds). */
  durationSec?: number;
  /** Detected / user language tag (e.g. ja, zh). */
  lang?: string;
  /** Per-file subtitle sync offset in seconds (Phase 5b). */
  subOffsetSec?: number;
  /** Original remote URL when imported from YouTube / web. */
  sourceUrl?: string;
  /** YouTube video id when known (playlist manager / yt-dlp). */
    youtubeId?: string;
    /** User/metadata classification used by the Media Hub. */
    // From the leaf taxonomy module, not from `mediaHub` (which imports this file):
    // pointing at mediaHub here is what used to make types.ts part of a cycle.
    category?: import('./mediaCategories').MediaCategory;
    artist?: string;
    /** Album name — the middle level of the Media Hub's /Music/Artist/Album/ tree. */
    album?: string;
    genres?: string[];
    actors?: string[];
    year?: number;
    jlptLevel?: string;
    vocabularyCount?: number;
  kanjiCount?: number;
  lastStudiedAt?: number;
  listenCount?: number;
  metadataSource?: string;
  metadataUpdatedAt?: number;

  // ----- Release identity, read out of the file name on import --------------
  // Populated by `parseMediaFileName` (shared/mediaFileIdentity) so the library
  // can group a folder of files into one series without re-parsing every render.
  /** Folded grouping key shared with the §7 identity engine. */
  seriesKey?: string;
  /** Display name of the series this file belongs to. */
  seriesTitle?: string;
  season?: number;
  episode?: number;
  /**
   * `episode` for a normal entry; openings/endings/OVAs shelve separately.
   * From the leaf taxonomy module, not from `mediaFileIdentity` (which imports
   * this file) — pointing there is what would make types.ts part of a cycle.
   */
  episodeKind?: import('./mediaReleaseKind').MediaReleaseKind;
  /**
   * Which release-name parser wrote `seriesKey` / `season` / `episode` /
   * `episodeKind`, so a later parser can repair what an earlier one misread.
   * Absent on everything imported before the stamp existed, which is exactly the
   * set that needs the first repass. See `RELEASE_IDENTITY_VERSION`.
   */
  releaseIdentityVersion?: number;
  /** Scene / fansub group, when the name carries one. */
  releaseGroup?: string;
  /** Vertical resolution in lines (1080 for `1080p`). */
  resolution?: number;
  /** Original air date in epoch ms, once a metadata provider supplies one. */
  airedAt?: number;
  /** Audiobook narrator, when known. */
  narrator?: string;
  /** Provider synopsis / description shown in the detail drawer. */
  synopsis?: string;

  // ----- Artwork ------------------------------------------------------------
  // Paths RELATIVE TO userData, not URLs. `playfile://` tokens are minted per
  // session into an in-memory map, so a persisted token URL would be dead on the
  // next launch; `media:artwork` mints one from these at request time instead.
  /** Provider poster (2:3), e.g. `artwork/poster-<key>.jpg`. */
  posterPath?: string;
  /**
   * The best wide hero image, used by the detail drawer's hero: AniList's banner
   * strip for anime, otherwise the 16:9 backdrop below. Always set when either is.
   */
  bannerPath?: string;
  /** 16:9 backdrop (TMDB backdrop / TVmaze background), when a provider has one. */
  backdropPath?: string;
  /** This file's own episode still (TVmaze), served by `media:artwork` 'still'. */
  stillPath?: string;

  // ----- Provider metadata (Phase 2) ---------------------------------------
  /** Original-language title, shown under the display title in the drawer. */
  nativeTitle?: string;
  /** Total episodes the provider says the run has, which may exceed the files. */
  episodeCount?: number;
  /** Per-episode title keyed by episode number, from the provider. */
  episodeTitles?: Record<string, string>;
  /** Provider score out of 10. */
  rating?: number;
  /** Rank on the provider's popularity chart, when it publishes one. */
  rank?: number;
  studio?: string;
  /** Airing status as the provider words it (`Finished Airing`, …). */
  status?: string;
  /** `TV`, `Movie`, `OVA` — the provider's own format label. */
  format?: string;
  relatedTitles?: string[];
  /**
   * The same relations with their AniList ids and episode counts, which is what
   * makes them answerable. `relatedTitles` is display text — a folder holding
   * two seasons cannot ask a provider about episode 26 with a string. See
   * `shared/mediaSeasons.ts` (D266).
   */
  relatedWorks?: import('./mediaSeasons').RelatedWork[];
  malId?: number;
  anilistId?: number;
  /**
   * How confident the title match was, 0–1. Below the accept threshold the item
   * keeps whatever was found but the card flags it for review rather than
   * pretending a guess is a fact.
   */
  metadataConfidence?: number;
  /** TVmaze show id, when TVmaze identified the series. */
  tvmazeId?: number;
  /** TMDB id; `tmdbType` names its namespace, because movie and TV ids collide. */
  tmdbId?: number;
  tmdbType?: 'movie' | 'tv';
  /** IMDb id (`tt0123456`), from TVmaze's externals or TMDB. */
  imdbId?: string;
  /** Minutes: the film's running time, or a typical episode's for a series. */
  runtimeMin?: number;
  /** Broadcaster or streaming service (TVmaze network / web channel). */
  network?: string;
  /**
   * The series' full episode run from the provider, including episodes the
   * library lacks. Same list on every file of the series; capped at
   * `EPISODE_GUIDE_LIMIT`. A file's own title stays in `episodeTitles`.
   */
  episodeGuide?: import('./mediaMetadataIpc').MediaEpisodeGuideEntry[];
  /** What the last lookup tried — drives the `unmatched` retry window. */
  metadataAttempt?: import('./mediaMetadataIpc').MediaMetadataAttempt;

  // ----- Subtitles (Phase 3) ------------------------------------------------
  /**
   * Every subtitle file the app holds for this item — embedded, sidecar,
   * downloaded, or Whisper-generated. From the leaf record module, not from the
   * §8 provider model, which imports nothing from here and must stay that way.
   */
  subtitles?: import('./subtitleRecord').SubtitleRecord[];
  /** Searches that came back empty, so they are not repeated every launch. */
  subtitleFailures?: import('./subtitleRecord').SubtitleSearchFailure[];
  /** Epoch ms of the last discovery pass, successful or not. */
  subtitlesCheckedAt?: number;

  // ----- Per-item user state (persisted; drives the library rail counts) ----
  favorite?: boolean;
  studyQueue?: boolean;
  note?: string;
  /** Free-form collection names the user has filed this item under. */
  collections?: string[];
  /**
   * The subtitle record the user chose for this item in the library, by id.
   *
   * Persisted rather than held in the player: the library and the player are
   * different windows (and, with the media workspace present, different players
   * entirely), so a choice that lives in one player's state is a choice the
   * surface that actually renders never hears about. `pickPlaybackSubtitle`
   * honours this over its own ranking; an id whose record has since been removed
   * falls back to the ranking.
   */
  preferredSubtitleId?: string;
  /**
   * Subtitle automation's own state: the study/helper tracks it picked, when the
   * episode was last prepared, and what it tried (so a failed translation is not
   * retried on every play). See `main/subtitleDiscoveryAuto.ts`.
   */
  subtitleAuto?: import('./subtitleDiscoveryStatus').SubtitleAutoState;
  }

/**
 * Which dub actually landed. MINING gate 1's receipt: `language` is the tag the
 * video's own manifest carries on the chosen format, and `usedFormatId` is what
 * yt-dlp reported it downloaded — so the two can be compared rather than the
 * request being taken as its own proof.
 */
export interface YouTubeAudioTrackReceipt {
  requestedLang: YouTubeAudioLang;
  language: string;
  formatId: string;
  usedFormatId: string | null;
}

/** Returned when a media file is opened: the library item + a playable URL. */
export interface MediaOpen {
  item: MediaItem;
  /** A playfile:// URL the renderer can put in a <video>/<audio> src. */
  url: string;
  /** Optional subtitle file downloaded beside remote media. */
  subtitle?: SubtitlePick;
  /** Present only when a specific audio language was requested. */
  audioTrack?: YouTubeAudioTrackReceipt;
}

/**
 * A download that refused. `errorKey` carries the i18n key for refusals that
 * have one, so the renderer localises them; `error` stays populated for every
 * caller (and every log) that has no catalogue.
 */
export interface MediaDownloadError {
  error: string;
  errorKey?: string;
  errorParams?: Record<string, string>;
}

export interface SubtitlePick {
  name: string;
  /** Raw subtitle file text (.srt/.vtt/.ass), parsed in the renderer. */
  text: string;
}

/**
 * A CJK-capable system font handed to the libass subtitle renderer.
 *
 * libass is built with Roboto Medium and whatever the container attached, so a sidecar
 * `.ass`/`.srt` — every Jimaku or nyaa track — has no Japanese face at all and draws
 * boxes. `main/subtitleFallbackFont.ts` carries the measurement and the ordered choice.
 */
export interface SubtitleFallbackFont {
  /** The face the file carries, for reporting. Not what libass matches on. */
  family: string;
  /** A `localfile://` URL. Never bytes — the face is 9–13 MB. */
  url: string;
}

/**
 * What happened when a finished acquisition was brought into the library.
 *
 * `found` and `added` are reported separately on purpose: "0 added" means two
 * unrelated things — every file is already in the library, or the folder holds
 * no media at all — and a caller with only one number has to guess which. The
 * transfer surface says the difference out loud.
 */
export interface MediaAcquiredImport {
  items: MediaItem[];
  /** Media files discovered under the path, whether or not they were new. */
  found: number;
  /** Of those, how many were not already library items. */
  added: number;
  outcome: 'ok' | 'no-media' | 'missing' | 'invalid-path';
}

export type YouTubeSubtitleLang = 'none' | 'ja' | 'zh' | 'en' | 'ru';

/**
 * Which dub to fetch. `'original'` — not `'none'` — is the neutral value: a
 * video download always has audio, so declining to choose means "the uploader's
 * primary track", never "omit it". See `shared/ytAudioLang.ts`.
 */
export type YouTubeAudioLang = 'original' | 'ja' | 'zh' | 'en' | 'ru';

export interface YouTubeDownloadOptions {
  audioOnly?: boolean;
  /**
   * The audio track's language. Resolved to an exact yt-dlp format id by
   * probing the video first, and REFUSED by name when the video has no such
   * dub — never silently satisfied with the default track.
   */
  audioLang?: YouTubeAudioLang;
  /** Download existing creator-provided subtitles only; auto captions are not requested. */
  subtitleLang?: YouTubeSubtitleLang;
  /** Multiple official subtitle langs (playlist manager preferSubs). */
  subtitleLangs?: Array<Exclude<YouTubeSubtitleLang, 'none'>>;
  /**
   * Fetch every subtitle track the video ships with, in all languages,
   * including YouTube's auto-generated captions. Overrides subtitleLang(s).
   * Used by extension-initiated downloads so nothing is missed.
   */
  allSubs?: boolean;
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

  /**
   * Set once a page-image item (manga, image archive, scanned PDF) has been
   * converted to text by book OCR. Conversion is reversible: this is how the
   * item was shelved before, so it can be switched back to its original pages
   * at any time. The page images and the original file are never deleted.
   */
  ocrOriginal?: {
    kind: LibraryKind;
    /** The original's `epubFile` (a scanned PDF's `original.pdf`); absent for page images. */
    epubFile?: string;
  };
  /** The EPUB book OCR built, relative to the item folder. */
  ocrEpubFile?: string;
  /**
   * Reading position kept per view, so switching between the original pages and
   * the converted text does not hand one format the other's locator.
   */
  ocrViewProgress?: { original?: Progress; text?: Progress };
  /**
   * Provider provenance for a manga chapter downloaded into the local
   * library. The page bytes are local, so the retained reader/OCR path treats
   * it like any other manga; these fields preserve the canonical work/edition
   * identity instead of re-deriving it from the display title.
   */
  readingSource?: {
    kind: 'seanime-manga-chapter';
    mediaId: number;
    malId?: number;
    workId: string;
    workTitle: string;
    workTitleNative?: string;
    editionId: string;
    providerId: string;
    providerLabel: string;
    chapterId: string;
    chapterNumber: string;
    chapterTitle: string;
    language: string;
  };
  /** Relative path to the cover image inside the item folder (book or manga). */
  coverPath?: string;

  /** User-made library folder this item is filed under (undefined = unfiled). */
  folder?: string;

  /**
   * Chrome-extension Inbox metadata (Phase 9). Present on articles sent via
   * the loopback bridge; omitted for normal file imports.
   */
  inboxMeta?: {
    sourceUrl: string;
    contentHash: string;
    lang: 'ja' | 'zh' | 'en' | 'unknown';
    charCount: number;
    estMinutes: number;
    /** 0..1 — filled by renderer enrich pass. */
    knownRatio: number;
    levelEstimate: 1 | 2 | 3 | 4 | 5 | 6 | 7 | null;
    receivedAt: number;
    /** Plain-text sample for comprehensibility enrich (capped). */
    textSample?: string;
  };

  /**
   * Level stats for file-imported EPUBs (no inboxMeta). Filled by the same
   * known-ratio enrich path used for Inbox articles so sort/filter/chips work.
   */
  levelMeta?: {
    lang: 'ja' | 'zh' | 'en' | 'unknown';
    knownRatio: number;
    levelEstimate: 1 | 2 | 3 | 4 | 5 | 6 | 7 | null;
  };

  /**
   * Manga OCR / translate volume status (denormalized for library cover badges).
   * Source of truth for page data remains under `<item>/_ocr/`.
   */
  ocrMeta?: {
    /** Pages with an OCR cache file. */
    ocrPages: number;
    /** Pages with a persisted translation for `targetLang`. */
    translatedPages: number;
    targetLang?: string;
    /** Set when the volume is fully OCR'd and (if requested) translated. */
    completedAt?: number;
    updatedAt: number;
  };

  progress?: Progress;
}
