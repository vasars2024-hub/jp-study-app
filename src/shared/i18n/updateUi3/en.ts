// Updates, third pass (upd3): Gum's own download with byte progress, cancel and
// resume; what a restart would cut short; rendered release notes; update history
// and "What's new". English source of truth.
//
// A lazy i18n pack (`../catalogs.ts`, "Lazily merged packs"; prefix `upd3.`), not
// part of the eager catalogs: the English catalog is static in every window, and
// Blanc renders none of these. Study OS loads the pack before its first paint
// (main.tsx), so the Updates panel and the notification center never wait on it;
// releaseCheck.ts loads it before posting the "What's new" notice. The `upd2.*`
// strings a download failure or the restart warning needs live eagerly in
// ../lockUpdateUi.

import type { Catalog } from '../core';

export const UPDATE3_UI_EN: Catalog = {
  // Gum's own download (main/updateDownloader.ts).
  'upd3.state.preparing': 'Preparing to download Gum {version}…',
  'upd3.state.downloading': 'Downloading Gum {version}. Gum keeps working meanwhile.',
  'upd3.state.downloadingDelta': 'Downloading the changes for Gum {version} (a delta update). Gum keeps working meanwhile.',
  'upd3.state.verifying': 'Checking the download of Gum {version}…',
  'upd3.state.installing': 'Unpacking Gum {version} in the background…',
  'upd3.state.paused': 'The download of Gum {version} is paused.',
  'upd3.progress.bytes': '{received} of {total}',
  'upd3.progress.bytesNoTotal': '{received} so far',
  'upd3.progress.value': '{percent}%, {received} of {total}',
  'upd3.cancel': 'Cancel download',
  'upd3.resume': 'Resume download',
  'upd3.retry': 'Try again',
  'upd3.pausedNote': '{received} of {total} is kept. Resume continues from there.',
  'upd3.partialNote': '{received} already downloaded is kept; trying again continues from there.',

  // What a restart would cut short (renderer/unsavedWork.ts, main/unsavedWork.ts);
  // the kinds themselves are the eager `upd2.unsaved.*`.
  'upd3.restart.title': 'Restarting now would cut short:',

  // Release notes rendered as Markdown.
  'upd3.notes.linkLabel': '{label} (opens on GitHub)',

  // Update history.
  'upd3.history.title': 'Update history',
  'upd3.history.empty': 'No versions recorded yet.',
  'upd3.history.first': 'Gum {version}, first started {date}',
  'upd3.history.updated': 'Gum {version}, updated from {from} on {date}',
  'upd3.history.downgraded': 'Gum {version}, changed from {from} on {date}',
  'upd3.history.current': 'running now',
  'upd3.history.showAll': {
    one: 'Show all {count} versions',
    other: 'Show all {count} versions',
  },
  'upd3.history.showFewer': 'Show fewer',

  // What's new, once after an update.
  'upd3.whatsNew.title': 'What’s new in Gum {version}',
  'upd3.whatsNew.body': 'Gum was updated from {from} to {version}.',
  'upd3.whatsNew.show': 'Show what’s new',
  'upd3.whatsNew.hide': 'Hide what’s new',
  'upd3.whatsNew.dismiss': 'Dismiss',
  'upd3.whatsNew.noticeTitle': 'Gum was updated to {version}',
  'upd3.whatsNew.noticeBody': 'See what’s new in Settings > Help > Updates.',
  'upd3.whatsNew.open': 'What’s new',
};
