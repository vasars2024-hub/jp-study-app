// Kana Sprint's study selection: which kana the player is drilling.
//
// The Arena's other games take their scope from the user's deck, but kana are
// not vocabulary — they need their own picker, mirroring the character-select
// UI used elsewhere in the app: two scripts, each with named groups, in either
// Automatic mode (scope follows your progress) or Manual (you choose groups).

import type { KanaPrompt } from '../data/gradedSentences';

export type KanaScript = 'hiragana' | 'katakana';
export type KanaGroupId = 'basic' | 'extended' | 'look-alike';
export type KanaMode = 'auto' | 'manual';

export interface KanaGroup {
  id: KanaGroupId;
  /** Scripts this group exists for — Look-Alike is katakana-only by design. */
  scripts: KanaScript[];
}

export const KANA_GROUPS: readonly KanaGroup[] = [
  { id: 'basic', scripts: ['hiragana', 'katakana'] },
  { id: 'extended', scripts: ['hiragana', 'katakana'] },
  // シ/ツ, ソ/ン, ノ/メ/ヌ — the pairs everyone actually mixes up.
  { id: 'look-alike', scripts: ['katakana'] },
];

export interface KanaSelection {
  mode: KanaMode;
  scripts: KanaScript[];
  groups: KanaGroupId[];
}

export const DEFAULT_KANA_SELECTION: KanaSelection = {
  mode: 'auto',
  scripts: ['hiragana'],
  groups: ['basic'],
};

const HIRAGANA_RE = /^[぀-ゟ]+$/;
const KATAKANA_RE = /^[゠-ヿ]+$/;

/** Youon (きょ) and voiced kana are the "extended" set; the bare gojūon are basic. */
const LOOK_ALIKE = new Set(['シ', 'ツ', 'ソ', 'ン', 'ノ', 'メ', 'ヌ']);

export function scriptOf(kana: string): KanaScript | null {
  if (HIRAGANA_RE.test(kana)) return 'hiragana';
  if (KATAKANA_RE.test(kana)) return 'katakana';
  return null;
}

export function groupOf(kana: string): KanaGroupId {
  if (LOOK_ALIKE.has(kana)) return 'look-alike';
  // Multi-character kana are youon (きょ/しゅ); dakuten marks are voiced.
  if ([...kana].length > 1 || /[゛゜ゞヾ]/.test(kana) || /[がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポ]/.test(kana)) {
    return 'extended';
  }
  return 'basic';
}

/**
 * The kana in scope for a selection. Look-Alike is a *view* of katakana rather
 * than a disjoint set, so selecting it includes those characters even though
 * they are also basic — that is the whole point of drilling them together.
 */
export function kanaInScope(all: readonly KanaPrompt[], selection: KanaSelection): KanaPrompt[] {
  const scripts = new Set(selection.scripts);
  const groups = new Set(selection.groups);
  const scoped = all.filter((k) => {
    const script = scriptOf(k.kana);
    if (!script || !scripts.has(script)) return false;
    if (groups.has('look-alike') && LOOK_ALIKE.has(k.kana)) return true;
    return groups.has(groupOf(k.kana));
  });
  // Never hand back an empty pool: a selection that filters everything out
  // would leave the game with nothing to ask.
  return scoped.length ? scoped : [...all];
}

/**
 * Automatic mode: widen the pool as the session goes on, so a player starts on
 * the bare gojūon and meets voiced/youon kana once they are a few rounds in.
 */
export function autoSelection(sequence: number): KanaSelection {
  if (sequence < 3) return { mode: 'auto', scripts: ['hiragana'], groups: ['basic'] };
  if (sequence < 6) return { mode: 'auto', scripts: ['hiragana'], groups: ['basic', 'extended'] };
  return {
    mode: 'auto',
    scripts: ['hiragana', 'katakana'],
    groups: ['basic', 'extended', 'look-alike'],
  };
}
