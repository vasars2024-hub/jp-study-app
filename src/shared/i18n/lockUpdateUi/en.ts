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
};
