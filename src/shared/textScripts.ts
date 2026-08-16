// Which writing systems a string actually contains — ANKI_DECK_WORKBENCH_PLAN.md
// smart recipe 8, "detect wrong-language or wrong-script content in a chosen field".
//
// This answers *containment*, never "what language is this". A sentence card
// legitimately holds kanji, kana and a Latin loanword at once, so a classifier
// that had to pick one winner would be wrong on most real decks. Containment
// composes instead: `Expression:script:latin` finds a Japanese field holding
// English, and the Browser's own negation turns it into "holds no Japanese at
// all" (`-Expression:script:han -Expression:script:kana`) without this module
// having to guess what the user considers wrong.
//
// The kanji range is `furigana.ts`'s, imported rather than re-spelled: this repo
// has already paid once for three near-copies of it drifting apart.

import { hasKanji } from './furigana';

/**
 * The scripts a deck audit can ask about. `kana` is the union of the two
 * syllabaries and is kept alongside them because "this field has no kana" is
 * the useful question, while "which of the two" matters for katakana-loanword
 * checks.
 */
export type TextScript =
  | 'latin'
  | 'cyrillic'
  | 'greek'
  | 'han'
  | 'hiragana'
  | 'katakana'
  | 'kana'
  | 'hangul';

export const TEXT_SCRIPTS: readonly TextScript[] = [
  'latin',
  'cyrillic',
  'greek',
  'han',
  'hiragana',
  'katakana',
  'kana',
  'hangul',
] as const;

// Deliberately letters only. Digits, punctuation and the half/full-width forms
// belong to no language here, so `script:none` means "no letters of any script
// this module knows" rather than "empty" — a field holding only `123 —` is
// content-free for an audit's purposes and should be found by it.
const HIRAGANA_RE = /[ぁ-ゟ]/u;
// `ァ-ヴ` then `ヷ-ヺ`, skipping U+30F5/U+30F6 (ヵヶ) — `hasKanji` already claims
// those, and one character answering yes to both syllabary and han would make
// `script:katakana script:han` meaningless on a field holding only `ヶ`.
const KATAKANA_RE = /[ァ-ヴヷ-ヺヽ-ヿｦ-ﾝ]/u;
// `À-Ö`, `Ø-ö`, `ø-ɏ` rather than one `À-ɏ` run: U+00D7 (×) and U+00F7 (÷) sit
// inside that block and are symbols, not letters.
const LATIN_RE = /[A-Za-zÀ-ÖØ-öø-ɏＡ-Ｚａ-ｚ]/u;
const CYRILLIC_RE = /[Ѐ-ӿԀ-ԯ]/u;
const GREEK_RE = /[Ͱ-Ͽἀ-῿]/u;
const HANGUL_RE = /[가-힣ᄀ-ᇿ㄰-㆏]/u;

/**
 * `ー` (U+30FC) is deliberately absent from every range: it is a length mark,
 * not a letter, so a field holding only `ー` is content-free rather than
 * katakana.
 */
function hasScript(text: string, script: TextScript): boolean {
  switch (script) {
    case 'latin':
      return LATIN_RE.test(text);
    case 'cyrillic':
      return CYRILLIC_RE.test(text);
    case 'greek':
      return GREEK_RE.test(text);
    case 'han':
      return hasKanji(text);
    case 'hiragana':
      return HIRAGANA_RE.test(text);
    case 'katakana':
      return KATAKANA_RE.test(text);
    case 'kana':
      return HIRAGANA_RE.test(text) || KATAKANA_RE.test(text);
    default:
      return HANGUL_RE.test(text);
  }
}

/** True when `text` holds at least one character of `script`. */
export function containsScript(text: string, script: TextScript): boolean {
  return text !== '' && hasScript(text, script);
}

/**
 * True when `text` holds no letter of any script this module knows — an empty
 * field, or one holding only digits, punctuation and whitespace. This is the
 * `script:none` case, and it is separate from "the note type has no such field",
 * which the caller decides.
 */
export function hasNoScript(text: string): boolean {
  return !TEXT_SCRIPTS.some((script) => hasScript(text, script));
}

/**
 * Every script present, in `TEXT_SCRIPTS` order. `kana` appears alongside the
 * syllabary that produced it rather than instead of it, so the list is a set of
 * answers to independent questions and not a partition.
 */
export function scriptsIn(text: string): TextScript[] {
  return TEXT_SCRIPTS.filter((script) => hasScript(text, script));
}

/** `null` for a value this module does not know — the caller refuses the token. */
export function parseTextScript(value: string): TextScript | null {
  const lower = value.toLowerCase();
  return (TEXT_SCRIPTS as readonly string[]).includes(lower) ? (lower as TextScript) : null;
}
