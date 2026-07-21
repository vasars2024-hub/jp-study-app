// Forward conjugation: dictionary form + target form → surface form.
//
// Study-native track item 4. `deinflect.ts` already goes the other way
// (conjugated → dictionary form) for lookup, but nothing produced a form, so a
// conjugation drill had nothing to check answers against.
//
// This is built on `deinflect.ts`'s exported godan tables rather than a private
// copy, so the two directions cannot drift: `conjugate.test.ts` round-trips
// every generated form back through `deinflect()` and asserts the dictionary
// form comes back.
//
// 行く is the one irregular this file hard-codes: its past/te are 行った/行って,
// not the regular 音便 for く (書く → 書いた). Everything else falls out of the
// row tables.

import {
  PAST,
  ROW_A,
  ROW_E,
  ROW_I,
  ROW_O,
  TE,
  type DictEnding,
} from './deinflect';

/** Verb / adjective class. */
export type WordClass = 'ichidan' | 'godan' | 'suru' | 'kuru' | 'i-adj';

/** The forms this module can produce. */
export type ConjugationForm =
  | 'polite'
  | 'negative'
  | 'politeNegative'
  | 'past'
  | 'pastNegative'
  | 'politePast'
  | 'te'
  | 'potential'
  | 'passive'
  | 'causative'
  | 'volitional'
  | 'imperative'
  | 'conditional';

export interface FormSpec {
  id: ConjugationForm;
  /** Short label for the drill UI. */
  label: string;
  /** The form as a learner would name it, e.g. 〜ます. */
  japanese: string;
  /** False for forms that do not apply to i-adjectives. */
  adjective: boolean;
}

export const FORMS: FormSpec[] = [
  { id: 'polite', label: 'Polite', japanese: '〜ます / 〜です', adjective: true },
  { id: 'negative', label: 'Negative', japanese: '〜ない', adjective: true },
  { id: 'politeNegative', label: 'Polite negative', japanese: '〜ません', adjective: true },
  { id: 'past', label: 'Past', japanese: '〜た', adjective: true },
  { id: 'pastNegative', label: 'Past negative', japanese: '〜なかった', adjective: true },
  { id: 'politePast', label: 'Polite past', japanese: '〜ました', adjective: true },
  { id: 'te', label: 'Te-form', japanese: '〜て', adjective: true },
  { id: 'potential', label: 'Potential', japanese: '〜できる', adjective: false },
  { id: 'passive', label: 'Passive', japanese: '〜られる', adjective: false },
  { id: 'causative', label: 'Causative', japanese: '〜させる', adjective: false },
  { id: 'volitional', label: 'Volitional', japanese: '〜よう', adjective: false },
  { id: 'imperative', label: 'Imperative', japanese: '命令形', adjective: false },
  { id: 'conditional', label: 'Conditional', japanese: '〜ば', adjective: true },
];

const FORM_BY_ID = new Map(FORMS.map((f) => [f.id, f]));

/** Split a godan verb into stem + dictionary ending. */
function godanParts(dict: string): { stem: string; end: DictEnding } | null {
  const end = dict.slice(-1) as DictEnding;
  if (!(end in ROW_A)) return null;
  return { stem: dict.slice(0, -1), end };
}

/** 行く and its compounds take った/って rather than the regular いた/いて. */
function isIku(dict: string): boolean {
  return dict === '行く' || dict === 'いく' || dict.endsWith('行く');
}

function conjugateGodan(dict: string, form: ConjugationForm): string {
  const parts = godanParts(dict);
  if (!parts) return '';
  const { stem, end } = parts;
  const a = stem + ROW_A[end];
  const i = stem + ROW_I[end];
  const e = stem + ROW_E[end];
  const o = stem + ROW_O[end];
  const past = isIku(dict) ? `${stem}った` : stem + PAST[end];
  const te = isIku(dict) ? `${stem}って` : stem + TE[end];

  switch (form) {
    case 'polite': return `${i}ます`;
    case 'negative': return `${a}ない`;
    case 'politeNegative': return `${i}ません`;
    case 'past': return past;
    case 'pastNegative': return `${a}なかった`;
    case 'politePast': return `${i}ました`;
    case 'te': return te;
    case 'potential': return `${e}る`;
    case 'passive': return `${a}れる`;
    case 'causative': return `${a}せる`;
    case 'volitional': return `${o}う`;
    case 'imperative': return e;
    case 'conditional': return `${e}ば`;
    default: return '';
  }
}

function conjugateIchidan(dict: string, form: ConjugationForm): string {
  if (!dict.endsWith('る')) return '';
  const stem = dict.slice(0, -1);
  switch (form) {
    case 'polite': return `${stem}ます`;
    case 'negative': return `${stem}ない`;
    case 'politeNegative': return `${stem}ません`;
    case 'past': return `${stem}た`;
    case 'pastNegative': return `${stem}なかった`;
    case 'politePast': return `${stem}ました`;
    case 'te': return `${stem}て`;
    case 'potential': return `${stem}られる`;
    case 'passive': return `${stem}られる`;
    case 'causative': return `${stem}させる`;
    case 'volitional': return `${stem}よう`;
    case 'imperative': return `${stem}ろ`;
    case 'conditional': return `${stem}れば`;
    default: return '';
  }
}

/** する and compounds (勉強する). The suppletive stems are し / さ / せ / でき. */
function conjugateSuru(dict: string, form: ConjugationForm): string {
  const prefix = dict.endsWith('する') ? dict.slice(0, -2) : '';
  if (!dict.endsWith('する')) return '';
  switch (form) {
    case 'polite': return `${prefix}します`;
    case 'negative': return `${prefix}しない`;
    case 'politeNegative': return `${prefix}しません`;
    case 'past': return `${prefix}した`;
    case 'pastNegative': return `${prefix}しなかった`;
    case 'politePast': return `${prefix}しました`;
    case 'te': return `${prefix}して`;
    // する's potential is the separate verb できる, not a regular stem + られる.
    case 'potential': return `${prefix}できる`;
    case 'passive': return `${prefix}される`;
    case 'causative': return `${prefix}させる`;
    case 'volitional': return `${prefix}しよう`;
    case 'imperative': return `${prefix}しろ`;
    case 'conditional': return `${prefix}すれば`;
    default: return '';
  }
}

/** 来る. Written forms keep the 来 kanji, whose reading shifts こ/き/く. */
function conjugateKuru(dict: string, form: ConjugationForm): string {
  const kanji = dict.startsWith('来');
  const ko = kanji ? '来' : 'こ';
  const ki = kanji ? '来' : 'き';
  const ku = kanji ? '来' : 'く';
  switch (form) {
    case 'polite': return `${ki}ます`;
    case 'negative': return `${ko}ない`;
    case 'politeNegative': return `${ki}ません`;
    case 'past': return `${ki}た`;
    case 'pastNegative': return `${ko}なかった`;
    case 'politePast': return `${ki}ました`;
    case 'te': return `${ki}て`;
    case 'potential': return `${ko}られる`;
    case 'passive': return `${ko}られる`;
    case 'causative': return `${ko}させる`;
    case 'volitional': return `${ko}よう`;
    case 'imperative': return `${ko}い`;
    case 'conditional': return `${ku}れば`;
    default: return '';
  }
}

function conjugateIAdj(dict: string, form: ConjugationForm): string {
  if (!dict.endsWith('い')) return '';
  const stem = dict.slice(0, -1);
  // いい is suppletive: every inflected form is built on よ.
  const s = dict === 'いい' || dict.endsWith('いい') ? `${dict.slice(0, -2)}よ` : stem;
  switch (form) {
    case 'polite': return `${dict}です`;
    case 'negative': return `${s}くない`;
    case 'politeNegative': return `${s}くないです`;
    case 'past': return `${s}かった`;
    case 'pastNegative': return `${s}くなかった`;
    case 'politePast': return `${s}かったです`;
    case 'te': return `${s}くて`;
    case 'conditional': return `${s}ければ`;
    default: return '';
  }
}

/**
 * Conjugate `dict` (a dictionary form) into `form`.
 *
 * Returns '' when the combination does not exist — an i-adjective has no
 * causative, and a malformed input has no forms at all. Callers should treat ''
 * as "not applicable" rather than an error.
 */
export function conjugate(dict: string, wordClass: WordClass, form: ConjugationForm): string {
  const d = dict.trim();
  if (!d || d.length < 2) return '';
  if (!FORM_BY_ID.has(form)) return '';
  switch (wordClass) {
    case 'godan': return conjugateGodan(d, form);
    case 'ichidan': return conjugateIchidan(d, form);
    case 'suru': return conjugateSuru(d, form);
    case 'kuru': return conjugateKuru(d, form);
    case 'i-adj': return conjugateIAdj(d, form);
    default: return '';
  }
}

/** Every form that applies to a word, for the drill and for tests. */
export function allForms(dict: string, wordClass: WordClass): { form: ConjugationForm; surface: string }[] {
  return FORMS
    .filter((f) => (wordClass === 'i-adj' ? f.adjective : true))
    .map((f) => ({ form: f.id, surface: conjugate(dict, wordClass, f.id) }))
    .filter((r) => r.surface !== '');
}

export interface DrillWord {
  dict: string;
  reading: string;
  meaning: string;
  wordClass: WordClass;
}

/**
 * Drill vocabulary. Deliberately small and common — the drill tests whether you
 * know the *pattern*, so obscure verbs would only add lookup friction. Includes
 * the shapes that catch people out: 帰る (godan despite the -eru ending), 行く
 * (irregular 音便), and いい (suppletive).
 */
export const DRILL_WORDS: DrillWord[] = [
  { dict: '食べる', reading: 'たべる', meaning: 'to eat', wordClass: 'ichidan' },
  { dict: '見る', reading: 'みる', meaning: 'to see', wordClass: 'ichidan' },
  { dict: '起きる', reading: 'おきる', meaning: 'to get up', wordClass: 'ichidan' },
  { dict: '教える', reading: 'おしえる', meaning: 'to teach', wordClass: 'ichidan' },
  { dict: '飲む', reading: 'のむ', meaning: 'to drink', wordClass: 'godan' },
  { dict: '書く', reading: 'かく', meaning: 'to write', wordClass: 'godan' },
  { dict: '泳ぐ', reading: 'およぐ', meaning: 'to swim', wordClass: 'godan' },
  { dict: '話す', reading: 'はなす', meaning: 'to speak', wordClass: 'godan' },
  { dict: '待つ', reading: 'まつ', meaning: 'to wait', wordClass: 'godan' },
  { dict: '死ぬ', reading: 'しぬ', meaning: 'to die', wordClass: 'godan' },
  { dict: '遊ぶ', reading: 'あそぶ', meaning: 'to play', wordClass: 'godan' },
  { dict: '買う', reading: 'かう', meaning: 'to buy', wordClass: 'godan' },
  { dict: '帰る', reading: 'かえる', meaning: 'to return home', wordClass: 'godan' },
  { dict: '行く', reading: 'いく', meaning: 'to go', wordClass: 'godan' },
  { dict: 'する', reading: 'する', meaning: 'to do', wordClass: 'suru' },
  { dict: '勉強する', reading: 'べんきょうする', meaning: 'to study', wordClass: 'suru' },
  { dict: '来る', reading: 'くる', meaning: 'to come', wordClass: 'kuru' },
  { dict: '高い', reading: 'たかい', meaning: 'expensive, tall', wordClass: 'i-adj' },
  { dict: '新しい', reading: 'あたらしい', meaning: 'new', wordClass: 'i-adj' },
  { dict: '楽しい', reading: 'たのしい', meaning: 'fun', wordClass: 'i-adj' },
  { dict: 'いい', reading: 'いい', meaning: 'good', wordClass: 'i-adj' },
];

/** Human label for a word class. */
export const CLASS_LABELS: Record<WordClass, string> = {
  ichidan: '一段 (ichidan)',
  godan: '五段 (godan)',
  suru: 'する (irregular)',
  kuru: '来る (irregular)',
  'i-adj': 'い-adjective',
};

/**
 * Compare a learner's answer to the expected surface.
 *
 * Trims and normalises width/composition, because a drill should not fail
 * someone over a trailing space or an NFD-composed dakuten from an IME.
 */
export function checkAnswer(answer: string, expected: string): boolean {
  const norm = (s: string) => s.trim().normalize('NFC');
  return norm(answer) !== '' && norm(answer) === norm(expected);
}
