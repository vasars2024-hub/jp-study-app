// A Yomitan dictionary imported before the term bank's rules column was read
// (Settings → Study → Dictionaries). A standalone pack: only that row loads it.
// English is the source of truth.

import type { Catalog } from '../core';

export const DICT_RULES_UI_EN: Catalog = {
  'dictRules.reimport.note':
    'Imported by an older version: conjugated words are checked against its tags only. Remove it and import the same file again to use its conjugation rules too.',
};
