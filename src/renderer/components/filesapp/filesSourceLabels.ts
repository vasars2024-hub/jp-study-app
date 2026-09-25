/**
 * The name of the store a row came from, in the user's language.
 *
 * `FilesItem.source` is the enumerator's id (`scraper-jobs`, `local-deck`) —
 * right for a bug report, wrong for the Properties pane, which printed it raw
 * (audit r2 #8). Each id is listed with its key rather than building
 * `filesApp.source.${id}`, so a new enumerator without a label shows its id
 * (never a missing-key string) and the i18n checker can see every key.
 */
const SOURCE_LABEL_KEYS: Readonly<Record<string, string>> = {
  library: 'filesApp.source.library',
  media: 'filesApp.source.media',
  transcripts: 'filesApp.source.transcripts',
  'yt-subs': 'filesApp.source.ytSubs',
  subtitles: 'filesApp.source.subtitles',
  downloads: 'filesApp.source.downloads',
  decks: 'filesApp.source.decks',
  drafts: 'filesApp.source.drafts',
  exports: 'filesApp.source.exports',
  dictionaries: 'filesApp.source.dictionaries',
  models: 'filesApp.source.models',
  artwork: 'filesApp.source.artwork',
  profiles: 'filesApp.source.profiles',
  workspaces: 'filesApp.source.workspaces',
  'scraper-jobs': 'filesApp.source.scraperJobs',
  'transcribe-queue': 'filesApp.source.transcribeQueue',
  'reading-lens': 'filesApp.source.readingLens',
  'visual-novels': 'filesApp.source.visualNovels',
  notebook: 'filesApp.source.notebook',
  'local-deck': 'filesApp.source.localDeck',
  highlights: 'filesApp.source.highlights',
  'saved-words': 'filesApp.source.savedWords',
  lookups: 'filesApp.source.lookups',
  translations: 'filesApp.source.translations',
  'known-words': 'filesApp.source.knownWords',
  clipboard: 'filesApp.source.clipboard',
};

export function filesSourceLabel(
  source: string,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const key = SOURCE_LABEL_KEYS[source];
  return key ? t(key) : source;
}
