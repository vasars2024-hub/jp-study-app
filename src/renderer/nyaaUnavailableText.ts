/**
 * `nyaaAvailability`'s refusal, in the user's own language and naming the fix.
 *
 * Main's `detail` is an English sentence built in the main process, so
 * `i18n-check`, `i18n-hardcoded-check` and the catalog-hygiene suite are all
 * blind to it — they read the catalogs and the renderer, and a string that is
 * born in `src/main/**` and piped through a `message` field passes every one of
 * them and lands untranslated on screen. Both nyaa surfaces did exactly that
 * (D171, D172): a Japanese user asking for Japanese subtitles was answered in
 * English, and told to *enable* a torrent index on a machine whose profiles
 * carry none to enable.
 *
 * It lives here rather than in either component because there are two callers
 * and they are the pair that already drifted — `SubtitleHarvestPanel` wrapped
 * `detail` in a translated frame while printing it bare one function away, and
 * `NyaaSubtitleDialog` never wrapped it at all. One function, so a third
 * surface cannot invent a fourth behaviour.
 *
 * The two machine-specific reasons keep `detail` inside the translated
 * sentence: it carries the save path or the sign-in mode, which is the fact
 * that makes them actionable and which no catalog can hold.
 */
import type { NyaaUnavailableReason } from '../shared/subtitleNyaa';

export function nyaaCannotText(
  t: (key: string, vars?: Record<string, unknown>) => string,
  reason: NyaaUnavailableReason | null | undefined,
  detail: string,
): string {
  switch (reason) {
    case 'not-configured':
      return t('subHarvest.nyaa.cannot.notConfigured');
    case 'no-torrent-source':
      return t('subHarvest.nyaa.cannot.noTorrentSource');
    case 'no-indexer':
      return t('subHarvest.nyaa.cannot.noIndexer');
    case 'qbit-disabled':
      return t('subHarvest.nyaa.cannot.qbitDisabled');
    case 'qbit-remote':
      return t('subHarvest.nyaa.cannot.qbitRemote', { detail });
    case 'qbit-no-credential':
      return t('subHarvest.nyaa.cannot.qbitNoCredential', { detail });
    // Not an availability refusal — an empty title, a media row that is gone,
    // or the index itself failing. Those carry no reason and main's text is the
    // only account of them there is, so it must still reach the user.
    default:
      return detail;
  }
}
