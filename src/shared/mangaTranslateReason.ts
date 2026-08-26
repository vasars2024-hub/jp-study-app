/**
 * Why each greyed-out control in the manga reader's translate panel is greyed out.
 *
 * The category-8 sweep on `@.reader` scored SEVEN mute pairs, and all seven are in
 * this one panel: the `Translate to` language select, and the chapter- and
 * page-range rows — two `From` inputs, two `To` inputs and two `Translate` buttons.
 * Every one of them `title: null`. The two range rows are the worst case the
 * category exists to catch: six controls greyed at once, sitting under a heading
 * that describes the feature and says nothing about why none of it can be used.
 *
 * The condition is nearly always the same one — `!engineReady`, i.e. the manga OCR
 * engine is not installed — and it is invisible from this panel. Nothing here
 * mentions an engine, so the row reads as broken rather than as not-yet-installed.
 *
 * Rules here rather than inline, beside `novelsActionReason.ts`,
 * `vnActionReason.ts` and `mediaVideoActionReason.ts`: every one of these four has
 * three or four conditions, so there is a PRIORITY, and a priority that is not in a
 * module is a priority nothing can test. Returning i18n keys keeps this file free
 * of English.
 */

/** Everything the four rules read. */
export interface MangaTranslateState {
  /** A whole-volume analysis is running. */
  volumeBusy: boolean;
  /** A translation is running right now. */
  translating: boolean;
  /** The manga OCR engine asset is installed. */
  engineReady: boolean;
  /** This page is being scanned right now. */
  ocrScanning: boolean;
  /** This page has OCR text on it, so there is something to translate. */
  hasOcrPage: boolean;
  /** There is no page after this one, so there is nothing to run ahead on. */
  atLastPage: boolean;
}

/**
 * `undefined` means ENABLED. Every call site derives `disabled` from this rather
 * than repeating the condition list, so the two cannot disagree and a control that
 * is grey with no reason is not expressible.
 */
export type MangaTranslateReason = string | undefined;

/**
 * The order is load-bearing and it is why these are functions.
 *
 * A missing engine is STRUCTURAL: the user has to install it, and no amount of
 * waiting produces one. `volumeBusy` and `translating` are transient. Leading with
 * a run in progress would send someone to wait it out and come back to a row that
 * is still dead — the unfollowable advice `novelsActionReason.ts` and the Immersion
 * load-failure banner were both fixed for.
 */
export function mangaTranslateRangeReason(s: MangaTranslateState): MangaTranslateReason {
  if (!s.engineReady) return 'manga.translate.reason.noEngine';
  if (s.volumeBusy) return 'manga.translate.reason.busyVolume';
  if (s.translating) return 'manga.translate.reason.busyTranslating';
  return undefined;
}

/** Same rule, plus the one condition only this button has. */
export function mangaTranslateAheadReason(s: MangaTranslateState): MangaTranslateReason {
  if (!s.engineReady) return 'manga.translate.reason.noEngine';
  if (s.atLastPage) return 'manga.translate.reason.atLastPage';
  if (s.volumeBusy) return 'manga.translate.reason.busyVolume';
  if (s.translating) return 'manga.translate.reason.busyTranslating';
  return undefined;
}

/**
 * The target language does NOT read `engineReady`, and that is deliberate rather
 * than an omission: picking what to translate into is a setting, and it stays
 * usable while the engine is missing so the choice is already made once it lands.
 */
export function mangaTranslateTargetReason(s: MangaTranslateState): MangaTranslateReason {
  if (s.volumeBusy) return 'manga.translate.reason.busyVolume';
  if (s.translating) return 'manga.translate.reason.busyTranslating';
  return undefined;
}

/** The single-page button, whose structural condition is this page rather than the engine. */
export function mangaTranslatePageReason(s: MangaTranslateState): MangaTranslateReason {
  if (!s.hasOcrPage) return 'manga.translate.reason.noOcrPage';
  if (s.ocrScanning) return 'manga.translate.reason.scanning';
  if (s.volumeBusy) return 'manga.translate.reason.busyVolume';
  if (s.translating) return 'manga.translate.reason.busyTranslating';
  return undefined;
}

/** Every key the four rules can return, so a catalog test can assert all of them. */
export const MANGA_TRANSLATE_REASON_KEYS = [
  'manga.translate.reason.noEngine',
  'manga.translate.reason.busyVolume',
  'manga.translate.reason.busyTranslating',
  'manga.translate.reason.atLastPage',
  'manga.translate.reason.noOcrPage',
  'manga.translate.reason.scanning',
] as const;
