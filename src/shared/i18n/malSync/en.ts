// MyAnimeList sync panel — English source of truth.
//
// Created 2026-08-04. `MalSyncPanel.tsx` was written correctly against the i18n
// system — 27 `t()` calls, and it even documents the `lang`-not-`t` dependency
// rule — but **its catalog block was never added to any language, including
// English**. Every string in the panel therefore rendered as its own raw dotted
// key: the settings card titled itself `malSync.title`, the connect button read
// `malSync.connect`, and the plaintext-credential warning — the one that exists
// so storage is never silently downgraded — displayed `malSync.plaintextWarning`.
//
// Neither i18n gate could see it, and this is a third blindness distinct from
// F7 and F8: `i18n-check.cjs` compares the four catalogs *against each other*,
// so a key absent from all four is absent from both sides of every comparison;
// and `i18n-hardcoded-check.cjs` skips any file that adopts i18n, which this one
// does. Measured across src/renderer + src/media + src/main, MalSyncPanel was
// the ONLY file in the app with keys missing from English — 27 of 27.
// `tools/i18n-missing-key-check.cjs` now closes that hole.
import type { Catalog } from '../core';

export const MAL_SYNC_EN: Catalog = {
  'malSync.title': 'MyAnimeList',
  'malSync.desc': 'Connect your MyAnimeList account and pull your anime list into the app.',

  'malSync.setup': 'Setup',
  'malSync.clientIdDesc':
    'Register an API application on MyAnimeList and paste its Client ID here. The app never sees your MyAnimeList password.',
  'malSync.clientId': 'Client ID',
  'malSync.clientIdStored': 'Stored — paste a new id to replace it',
  'malSync.clientIdPlaceholder': 'Paste your MyAnimeList Client ID',
  'malSync.clientIdSave': 'Save',
  'malSync.register': 'Register an app',
  'malSync.notConfigured': 'Add a Client ID before connecting.',

  'malSync.account': 'Account',
  'malSync.connectedAs': 'Connected as {username}.',
  'malSync.notConnected': 'Not connected.',
  'malSync.plaintextWarning':
    'This device cannot encrypt stored credentials, so the access token is saved as plain text inside your profile folder.',

  // MAL-7. The approval is permanent and account-wide on MyAnimeList's side; the
  // token is per-profile and dies with the profile folder. Say which one.
  'malSync.profileNotice': 'This connects MyAnimeList to the profile stored at {dir}.',
  'malSync.nonDefaultProfileWarning':
    'This app is running on a non-default profile folder. Approving access on MyAnimeList is permanent and applies to your whole account, but the token is saved only in this folder — if it is temporary or gets deleted, your account stays authorized with no way to use it from here. Revoke access in your MyAnimeList settings if that happens.',

  // P1 gate 4. `callbackDesc` said all of this, but only *after* Connect — by
  // which time the user has already watched their browser fail to load
  // localhost and concluded the feature is broken. The user hit exactly that.
  // Step 2 is the load-bearing line: it promises the failure before it happens.
  'malSync.walkthroughTitle': 'What happens when you connect',
  'malSync.walkthroughStep1':
    'Your normal browser opens on MyAnimeList. Sign in and approve access there — this app never sees your password.',
  'malSync.walkthroughStep2':
    'MyAnimeList then sends you to http://localhost/oauth/callback, and that page will not load. That is expected, not a failure: this app runs no local web server to catch it, deliberately.',
  'malSync.walkthroughStep3':
    'In the browser’s address bar, copy the long value that comes after “code=”.',
  'malSync.walkthroughStep4':
    'Paste it into the box that appears here and press Finish connecting. The code expires after a few minutes, so do it right away.',

  'malSync.connect': 'Connect MyAnimeList',
  'malSync.callbackCode': 'Authorization code',
  'malSync.callbackPlaceholder': 'Paste the code from the redirect address',
  'malSync.finish': 'Finish connecting',
  'malSync.callbackDesc':
    'Approve access in the browser, then copy the “code” value out of the address you are redirected to and paste it above. The code expires after a few minutes.',
  'malSync.signOut': 'Sign out',

  'malSync.list': 'Anime list',
  'malSync.fetching': 'Fetching…',
  'malSync.fetchList': 'Fetch my list',
  'malSync.listCount': '{count} entries fetched.',
  'malSync.truncated':
    'MyAnimeList still had more pages when the page limit was reached, so this list is incomplete.',

  // The library half. Before this existed the fetch counted its rows and threw
  // them away, so "connected to MyAnimeList" bought the user a number and
  // nothing else. Saving is its own click for the same reason fetching is.
  'malSync.library': 'Library',
  'malSync.libraryDesc':
    'Saving keeps the fetched titles in this app so the subtitle and vocabulary tools can work from them. It stores what you just fetched — it never contacts MyAnimeList, and it never changes your list there.',
  'malSync.librarySave': 'Save fetched titles to library',
  'malSync.librarySaving': 'Saving…',
  'malSync.libraryResult': 'Saved: {added} new, {updated} updated, {unchanged} unchanged.',
  'malSync.libraryRejected': '{rejected} rows could not be read and were skipped.',
  'malSync.libraryStored': '{total} titles in the library.',
  'malSync.libraryEmpty': 'Nothing saved yet.',
  'malSync.libraryDerivatives': '{derivatives} of them reached through related titles.',
  'malSync.libraryNothingFetched': 'Fetch your list first, then save it.',
  'malSync.noAutoSyncPush': 'Fetching and pushing are manual and nothing is scheduled. Your list on MyAnimeList changes only when you press Push.',
  'malSync.push': 'Push changes',
  'malSync.pushDesc': 'Sends what changed in this app (status, score, episodes watched) to your MyAnimeList list, compared with the list as last fetched.',
  'malSync.pushButton': { one: 'Push {count} change to MyAnimeList', other: 'Push {count} changes to MyAnimeList' },
  'malSync.pushNone': 'No differences from your MyAnimeList list.',
  'malSync.pushNeedsFetch': 'Fetch and save your list first, so there is something to compare with.',
  'malSync.pushPushing': 'Pushing…',
  'malSync.pushResult': 'Sent {sent}, failed {failed}.',
  'malSync.pushRemaining': { one: '{count} more waits for the next push.', other: '{count} more wait for the next push.' },
  'malSync.pushRetryAt': 'MyAnimeList asked to wait: try again after {time}.',
  'malSync.pushChangedOnMal': { one: '{count} title changed on MyAnimeList since the last fetch and was left as it is there. Fetch the list again to compare:', other: '{count} titles changed on MyAnimeList since the last fetch and were left as they are there. Fetch the list again to compare:' },
  'malSync.pushAdded': 'new on MyAnimeList',
  'malSync.pushField.status': 'status',
  'malSync.pushField.score': 'score',
  'malSync.pushField.episodes': 'episodes',
  'malSync.pushField.rewatching': 'rewatching',
  'malSync.pushChangeLine': '{field}: {from} to {to}',
  'malSync.pushMore': { one: '…and {count} more', other: '…and {count} more' },
  'malSync.yes': 'yes',
  'malSync.no': 'no',
  'malSync.related': 'Include sequels and related titles',
  'malSync.relatedDesc': 'Looks up what is related to the titles you finished or are watching (one MyAnimeList request each, at most {limit}) and keeps them in the library for the subtitle and vocabulary tools. It does not add them to your list.',
  'malSync.relatedWorking': 'Looking up related titles…',
  'malSync.relatedResult': { one: 'Found {count} related title, {added} new.', other: 'Found {count} related titles, {added} new.' },
  'malSync.relatedTruncated': 'Stopped at the request limit; run it again to continue.',
  'malSync.relatedNeedsLibrary': 'Save your list to the library first.',
  'malSync.statusFilter': 'Show',
  'malSync.statusAll': 'Everything on my list',
  'malSync.statusCompleted': 'Completed only',
  'malSync.statusWatching': 'Watching only',

  'malSync.error.not-configured': 'No MyAnimeList Client ID is configured yet.',
  'malSync.error.not-authenticated': 'Not connected to MyAnimeList. Connect the account first.',
  'malSync.error.reauth-required': 'MyAnimeList needs you to sign in again. Connect the account once more.',
  'malSync.error.transient': 'MyAnimeList did not respond. Try again in a moment.',
  'malSync.error.rate-limited': 'MyAnimeList is limiting requests right now. You are still signed in — wait a few minutes and try again.',
  'malSync.error.request-failed': 'The request to MyAnimeList failed.',
};
