// The lock as a main-process gate (lock2: main/lockGuard.ts) and the update panel
// (upd2: Settings -> Help -> Updates, main/squirrelUpdater.ts). English source of truth.

import type { Catalog } from '../core';

export const LOCK_UPDATE_UI_EN: Catalog = {
  // Toasts on the lock screen when main refuses something while Gum is locked.
  'lock2.blocked.command': 'Gum is locked. Unlock to use that shortcut.',
  'lock2.blocked.extension': 'Gum is locked. The browser extension is refused until you unlock.',
  'lock2.blocked.window': 'Gum is locked. Unlock to open that window.',
  // Settings -> Lockscreen: what the lock does, and what it does not.
  'lock2.note.title': 'A study lock, not a security boundary',
  'lock2.note.covers':
    'While Gum is locked it shows only the PIN pad: its other windows are hidden, new windows wait for the unlock, shortcuts and tray actions that open content are refused, and the browser extension is told that Gum is locked.',
  'lock2.note.background':
    'Background work keeps running and can still raise Windows notifications: downloads, scheduled scrapes, live-captions capture and a recording that was already in progress.',
  'lock2.note.devtools': 'Developer tools are disabled in installed and portable builds.',
  'lock2.note.limits':
    'It keeps a passer-by out of your study material; it does not protect your files. Decks, books and settings are ordinary files in your user folder, the app can be modified on disk, and a copy started with debugging switches can be inspected. For privacy, lock your Windows account.',

  // Settings -> Help -> Updates.
  'upd2.versionLabel': 'Version',
  'upd2.versionUnknown': 'Unknown',
  'upd2.installLabel': 'Copy',
  'upd2.install.installed': 'Installed (updates itself)',
  'upd2.install.portable': 'Portable (does not update itself)',
  'upd2.install.dev': 'Development build',
  'upd2.channelLabel': 'Channel',
  'upd2.channel.stable': 'Stable (GitHub releases)',
  'upd2.lastCheckLabel': 'Last checked',
  'upd2.lastCheck.never': 'Not yet',
  'upd2.state.portable': 'This copy cannot update itself. Check for a newer release, then download it from GitHub.',
  'upd2.state.dev': 'A development build does not update itself.',
  'upd2.state.checking': 'Checking for updates…',
  'upd2.state.downloading': 'Downloading the update in the background. Gum keeps working meanwhile.',
  'upd2.state.ready': 'Gum {version} has downloaded. Restart to finish updating.',
  'upd2.state.readyNoVersion': 'An update has downloaded. Restart to finish updating.',
  'upd2.state.upToDate': 'Gum {version} is up to date.',
  'upd2.state.notChecked': 'Gum checks for updates a minute after it starts and then every six hours.',
  'upd2.state.meteredSkipped':
    'The automatic check was skipped because Windows reports a metered connection. Check now to download anyway.',
  'upd2.downloadingFor': {
    one: 'Downloading for {count} minute',
    other: 'Downloading for {count} minutes',
  },
  'upd2.progressLabel': 'Update download',
  'upd2.sizeNote':
    'A full update is several hundred MB. When the release carries a delta package, only the difference is downloaded.',
  'upd2.error.network': 'Could not reach GitHub. Check your connection and try again.',
  'upd2.error.no-feed': 'The latest release has no installer update files yet. Gum will try again later.',
  'upd2.error.updater-missing': 'The updater (Update.exe) could not be started. Reinstalling Gum fixes this.',
  'upd2.error.unknown': 'The update check failed. The details are in Help > Diagnostics.',
  'upd2.checkNow': 'Check now',
  'upd2.restart': 'Restart to update',
  'upd2.notes.show': 'Show release notes',
  'upd2.notes.hide': 'Hide release notes',
  'upd2.notes.loading': 'Loading release notes…',
  'upd2.notes.failed': 'Could not load the release notes. Try again later.',
  'upd2.notes.none': 'This project has not published a release yet.',
  'upd2.notes.empty': 'This release has no notes.',
  'upd2.notes.title': 'Release notes: {title}',
  'upd2.notes.published': 'published {date}',
  'upd2.notes.truncated': 'The notes are long; the rest is on GitHub.',
  'upd2.notes.open': 'Open on GitHub',
  'upd2.privacy':
    'Privacy: an installed copy checks github.com in the background, which sees your IP address. Release notes and the version check above are fetched from GitHub only when you press the button. Gum sends no account, deck or study data.',

  // Channel, skip-this-version, why a check failed, restart warning.
  'upd2.channel.beta': 'Beta (pre-releases included)',
  'upd2.channel.betaNote': 'Beta gets pre-releases as soon as they are published. They can have rough edges; switch back to Stable at any time.',
  'upd2.state.skipped': 'Gum {version} is available. You chose to skip this version.',
  'upd2.skip': 'Skip {version}',
  'upd2.skippedNote': 'Skipping {version}: Gum will not offer or download it.',
  'upd2.unskip': 'Stop skipping',
  'upd2.unavailable.offline': 'Could not reach GitHub. Check your connection and try again.',
  'upd2.unavailable.rateLimited': 'GitHub is limiting requests from your network right now. Try again after {time}.',
  'upd2.unavailable.rateLimitedNoTime': 'GitHub is limiting requests from your network right now. Try again in an hour.',
  'upd2.unavailable.http': 'GitHub answered with an error. Try again later.',
  'upd2.unavailable.invalid': 'GitHub’s answer did not describe a release. Try again later.',
  'upd2.unavailable.disabled': 'Update checks are switched off in this test run.',
  'upd2.restart.unsaved': 'Restarting now would cut short {list}.',
  'upd2.restart.anyway': 'Restart anyway',
  'upd2.restart.notNow': 'Not now',
  'upd2.unsaved.recording': 'the screen recording in progress',
  'upd2.unsaved.recording-finalize': 'a recording that is still being saved',
  // Moved here from ../updateUi3 when that became a lazy pack: a failed download's
  // reason and what a restart would cut short stay eager — the restart warning is a
  // toast that must never wait on a chunk, in Blanc too.
  'upd2.error.checksum':
    'The downloaded update did not match its published checksum, so it was thrown away. Try again; if it happens again, download the installer from GitHub.',
  'upd2.error.disk': 'There is not enough free disk space for the update. Free some space, then try again.',
  'upd2.unsaved.note-editor': 'a note you are editing that is not saved yet',
  'upd2.unsaved.card-editor': 'a card you are editing that is not saved yet',
  'upd2.unsaved.writing-correction': 'a writing correction that is still being written',
  'upd2.unsaved.review-session': 'the review session in progress',
  'upd2.unsaved.snip': 'a snip that is still being turned into cards',
  'upd2.unsaved.ai-job': 'an AI job that is still running',
};
