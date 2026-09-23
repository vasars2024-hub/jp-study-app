// Watch-tracking library (MyAnimeList / Letterboxd style) — English source of truth.
//
// The vocabulary the library's UI resolves through `watchStatusLabelKey` /
// `watchKindLabelKey` / `watchSourceLabelKey` / `watchSortLabelKey`
// (shared/watchLibrary.ts), plus the error keys `main/watchLibrary.ts` returns
// as `errorKey` so the renderer can localise a refused import.
import type { Catalog } from '../core';

export const WATCH_LIBRARY_EN: Catalog = {
  'watchLibrary.status.watching': 'Watching',
  'watchLibrary.status.completed': 'Completed',
  'watchLibrary.status.plan': 'Plan to watch',
  'watchLibrary.status.on_hold': 'On hold',
  'watchLibrary.status.dropped': 'Dropped',
  'watchLibrary.status.rewatching': 'Rewatching',

  'watchLibrary.kind.anime': 'Anime',
  'watchLibrary.kind.tv': 'TV series',
  'watchLibrary.kind.film': 'Film',
  'watchLibrary.kind.other': 'Other',

  'watchLibrary.source.mal-export': 'MyAnimeList export',
  'watchLibrary.source.mal-sync': 'MyAnimeList sync',
  'watchLibrary.source.letterboxd': 'Letterboxd export',
  'watchLibrary.source.local': 'Watched in the app',
  'watchLibrary.source.manual': 'Added by hand',

  'watchLibrary.sort.title': 'Title',
  'watchLibrary.sort.year': 'Year',
  'watchLibrary.sort.score': 'My score',
  'watchLibrary.sort.added': 'Date added',
  'watchLibrary.sort.lastWatched': 'Last watched',
  'watchLibrary.sort.finished': 'Date finished',
  'watchLibrary.sort.progress': 'Progress',
  'watchLibrary.sort.runtime': 'Runtime',
  'watchLibrary.sort.updated': 'Last updated',

  'watchLibrary.import.dialogTitle': 'Import a MyAnimeList or Letterboxd export',
  'watchLibrary.import.filterExports': 'MyAnimeList and Letterboxd exports',
  'watchLibrary.import.filterAll': 'All files',
  'watchLibrary.import.error.notFound': 'The file could not be found.',
  'watchLibrary.import.error.unreadable': 'The file could not be read: {detail}',
  'watchLibrary.import.error.unrecognized':
    "This is not a MyAnimeList or Letterboxd export. Choose MyAnimeList's animelist .xml.gz file or Letterboxd's export .zip.",
  'watchLibrary.import.error.empty': 'The export contains no titles.',
  'watchLibrary.import.error.mangaOnly':
    'This is a MyAnimeList manga list. Only anime lists can be imported into the watch library.',
  'watchLibrary.import.error.tooLarge': 'The file is too large to be a list export ({size}).',

  'watchLibrary.error.notFound': 'That title is no longer in the library.',
  'watchLibrary.error.unknownMedia': 'That file is not in the media library.',
  'watchLibrary.error.notTrackable': 'Only anime, TV and film files can be tracked.',
  'watchLibrary.error.invalidTitle': 'A title needs a name and a type.',
  'watchLibrary.error.addFailed': 'The title could not be added.',
};
