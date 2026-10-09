// Dictionary, Yomitan parity: conjugation trace, result layout, audio sources,
// JMdict priority explanations, multi-deck "in Anki". Keys under dict3. —
// English source of truth.

import type { Catalog } from '../core';

export const DICT3_UI_EN: Catalog = {
  // ---- Conjugation trace ----
  'dict3.trace.aria': '{source} traced back to {term}: {steps}',
  'dict3.trace.openGrammar': 'Open “{step}” in the grammar explorer',

  // ---- JMdict priority ----
  'dict3.prio.title': 'JMdict word lists:',
  'dict3.prio.news1': 'Mainichi Shimbun frequency list, top 12,000 words',
  'dict3.prio.news2': 'Mainichi Shimbun frequency list, words 12,001–24,000',
  'dict3.prio.ichi1': 'Ichimango goi bunruishuu, a list of about 10,000 common words',
  'dict3.prio.ichi2': 'Ichimango goi bunruishuu, but less common in newspapers',
  'dict3.prio.spec1': 'Marked common by the JMdict editors',
  'dict3.prio.spec2': 'Marked fairly common by the JMdict editors',
  'dict3.prio.gai1': 'Common loanword',
  'dict3.prio.gai2': 'Less common loanword',
  'dict3.prio.nf': 'Newspaper frequency rank {from}–{to}',

  // ---- In Anki ----
  'dict3.presence.ankiWhere': 'Already in Anki: {targets}',

  // ---- Sections ----
  'dict3.sections.showMore': {
    one: 'Show {count} more dictionary',
    other: 'Show {count} more dictionaries',
  },
  'dict3.sections.showFewer': 'Show fewer dictionaries',

  // ---- Audio picker ----
  'dict3.audio.picker': 'Audio source for {word}',
  'dict3.audio.auto': 'Auto',
  'dict3.audio.optionHas': '{name} (has it)',
  'dict3.audio.optionMissing': '{name} (not found)',

  // ---- Settings ----
  'dict3.settings.layoutTitle': 'Result layout',
  'dict3.settings.layoutIntro':
    'How a word found in several dictionaries is shown, in the app, the pop-up and the browser extension.',
  'dict3.settings.grouped': 'Group by dictionary (a section per dictionary)',
  'dict3.settings.merged': 'Merge into one list (each meaning labelled with its dictionary)',
  'dict3.settings.collapse': 'Collapse the dictionaries after the first until asked',
  'dict3.settings.dragHint': 'Drag a dictionary to reorder it, or use the arrows.',
  'dict3.settings.audioTitle': 'Audio sources',
  'dict3.settings.audioIntro':
    'Pronunciations are tried in this order; when a source has no recording the next one is used. Each entry can also pick a single source.',
  'dict3.settings.audioUse': 'Use this audio source',
  'dict3.settings.audioCdn': 'JapanesePod101 recordings, fetched only when you press play, then kept for offline use',
  'dict3.settings.audioMissingFolder': 'Folder not found',
  'dict3.settings.audioFiles': {
    one: '{files} recording found',
    other: '{files} recordings found',
  },
  'dict3.settings.audioUp': 'Try earlier',
  'dict3.settings.audioDown': 'Try later',
  'dict3.settings.audioAddFolder': 'Add local audio folder',
  'dict3.settings.audioLayouts':
    'Local folders are only read, never downloaded into. Files named “reading - word.mp3” (JapanesePod101 layout) or “word.mp3” in any sub-folder (Forvo layout) are recognised: mp3, ogg, opus, m4a, aac, wav and flac.',
};
