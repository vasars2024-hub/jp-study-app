// v1 release (about., onb4.) — the About screen (version, licence, open source
// licences, credits, privacy) and the first-run offer of Snip to cards, which is
// off by default. English source of truth.

import type { Catalog } from '../core';

export const ABOUT_UI_EN: Catalog = {
  // ---- First-run setup, finish step: Snip to cards (off by default) ----
  'onb4.snip.title': 'Optional: Snip to cards',
  'onb4.snip.what':
    'Snip any text on screen with Win+Shift+S and Gum reads it, explains it, and turns the words you do not know yet into flashcards.',
  'onb4.snip.privacy':
    'Privacy: while it is on, Gum looks at pictures you copy to the clipboard and reads them on this computer only. They are never uploaded. You can turn it off any time from the tray or Settings.',
  'onb4.snip.enable': 'Enable Snip to cards',
  'onb4.snip.on': 'On. Your first snip shows what it added, with Undo.',
  'onb4.snip.failed': 'Could not change the setting. Try again in Settings.',

  // ---- About Gum ----
  'about.title': 'About Gum',
  'about.desc': 'Version, licence, open source licences, dictionary credits and the privacy statement.',
  'about.open': 'Show About Gum',
  'about.close': 'Hide About Gum',
  'about.loading': 'Loading…',
  'about.loadFailed': 'Could not load this text.',
  'about.tab.overview': 'Overview',
  'about.tab.licences': 'Open source licences',
  'about.tab.credits': 'Credits',
  'about.tab.privacy': 'Privacy',
  'about.version': 'Version {version}',
  'about.versionUnknown': 'Version unknown',
  'about.tagline': 'A study desktop for Japanese, Chinese and Russian.',
  'about.licence':
    'Gum is free software under the GNU General Public License, version 3 or later. You may use, study, change and share it; its source code is public.',
  'about.source': 'Source code on GitHub',
  'about.readLicence': 'Read the licence',
  'about.hideLicence': 'Hide the licence',
  'about.privacyLink': 'Privacy statement',
  'about.notices.intro':
    'Every third-party component Gum ships or downloads, with its licence and the attribution it asks for. The same text is in THIRD_PARTY_NOTICES.md in the app folder.',
  'about.englishOnly': 'Licence and privacy texts are shown in English, as published.',
  'about.licences.fullText': 'Full licence texts',
  'about.licences.search': 'Search npm packages by name or licence',
  'about.licences.count': { one: '{count} package', other: '{count} packages' },
  'about.licences.standard': 'This package ships no licence file; the standard {licence} text applies.',
  'about.licences.pick': 'Choose a package to read its licence.',
  'about.credits.intro': 'The dictionaries and data Gum uses, and the attribution their licences ask for.',
  'about.privacy.intro':
    'What stays on your computer, and what is sent where and when. Also in PRIVACY.md in the app folder.',
  'about.privacy.heatmap': 'Share my country anonymously (learner map)',
  'about.privacy.heatmapHint':
    'One empty request, once per install, counted by country. Off unless you turn it on; a count already sent cannot be taken back.',
  'about.blanc.setting': 'About Gum',
  'about.blanc.setting.detail': 'Version, licences, credits and privacy',
};
