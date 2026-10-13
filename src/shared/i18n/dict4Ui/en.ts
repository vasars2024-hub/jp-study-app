// Dictionary popup, Yomitan/10ten parity round 4: longest match across the
// cursor, nested lookups, keyboard, compound grading by parts, Anki duplicate
// on the Add button. Keys under dict4. — English source of truth.

import type { Catalog } from '../core';

export const DICT4_UI_EN: Catalog = {
  // ---- Longest match ----
  'dict4.scan.group': 'Which word to look up',
  'dict4.scan.pick': 'Look up {word}',

  // ---- Nested lookups ----
  'dict4.nested.back': 'Back to {word}',

  // ---- Grading a compound by its parts ----
  'dict4.parts.label': 'Parts',
  'dict4.parts.levelTitle': '{word}: {level}',
  'dict4.parts.combinedTitle':
    'Graded as its parts, which the reader colours separately. The level shown is the least-known part.',
  'dict4.knowledge.partsAction': '{word} is graded as its parts ({parts}). Click to mark them all {next}.',

  // ---- Keyboard ----
  'dict4.keys.title': 'Keys: 1–4 grade · P plays audio · ↓ ↑ move between entries · Backspace goes back',

  // ---- Anki duplicate ----
  'dict4.anki.addAgain': '+ Add again',
  'dict4.anki.addAgainTitle': 'This word is already in Anki. Adding it again makes a second note.',
};
