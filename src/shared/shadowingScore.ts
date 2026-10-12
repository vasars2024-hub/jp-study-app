/**
 * Shadowing feedback, the deterministic half (docs/AI_AUDIT.md N18).
 *
 * The learner repeats a subtitle line; the local Whisper model writes down what
 * it heard. This module compares the two by SOUND rather than by spelling, so a
 * transcript in kanji and a subtitle in kana (or two different hanzi with the
 * same syllable) still line up:
 *
 * - Japanese is compared mora by mora, on the hiragana reading (kuromoji's, from
 *   the renderer), with ー written out as the vowel it lengthens.
 * - Chinese is compared syllable by syllable, on toneless pinyin (CC-CEDICT's,
 *   from main), with the tone kept aside so a same-syllable, different-tone
 *   swap can be named.
 *
 * Out come: a 0-100 similarity score, every token of the line marked matched,
 * partly matched or missed, every extra word the learner said, the likely
 * pronunciation issues by name (long vowels, っ, ん, voicing, small kana; tones,
 * retroflexes, nasal finals, l/n), and the pace against the original cue.
 *
 * No model and no network: this is what the learner gets with AI switched off.
 * Pure, so main, the renderer and the tests share it.
 */

export type ShadowLang = 'ja' | 'zh';

/** One word of a line as the renderer's tokenizer saw it. */
export interface ShadowToken {
  surface: string;
  /** Japanese: the reading in kana (katakana or hiragana). */
  reading?: string;
  /** Chinese: one pinyin syllable per character (tone marks or digits), '' where unknown. */
  syllables?: readonly string[];
}

export type ShadowTokenStatus = 'match' | 'partial' | 'miss' | 'plain';
export type ShadowHeardStatus = 'match' | 'partial' | 'extra' | 'plain';

export interface ShadowExpectedToken {
  surface: string;
  status: ShadowTokenStatus;
}

export interface ShadowHeardToken {
  surface: string;
  status: ShadowHeardStatus;
}

export type ShadowHintKind =
  // Japanese
  | 'long-vowel'
  | 'sokuon'
  | 'moraic-n'
  | 'voicing'
  | 'small-kana'
  // Chinese
  | 'tone'
  | 'retroflex'
  | 'nasal-final'
  | 'l-n'
  // either
  | 'missed-sound'
  | 'extra-sound';

export interface ShadowHint {
  kind: ShadowHintKind;
  /** The sound in the line ('' for an extra sound). */
  expected: string;
  /** The sound heard ('' for a missed one). */
  heard: string;
  /** The word of the line it belongs to ('' for an extra sound). */
  word: string;
}

export type ShadowPace = 'slow' | 'ok' | 'fast';

export interface ShadowTiming {
  /** The cue's own length, seconds. */
  cueSec: number;
  /** How long the learner spoke, seconds. */
  spokenSec: number;
  /** spoken / cue: 1 is the original pace, 1.5 is half again as long. */
  ratio: number;
  pace: ShadowPace;
}

export interface ShadowingComparison {
  lang: ShadowLang;
  /** 0-100: how much of the line's sound the learner reproduced. */
  score: number;
  expected: ShadowExpectedToken[];
  heard: ShadowHeardToken[];
  counts: { match: number; partial: number; miss: number; extra: number };
  hints: ShadowHint[];
  /** Morae (ja) or syllables (zh) in the line and in the transcript. */
  expectedUnits: number;
  heardUnits: number;
  timing: ShadowTiming | null;
}

// ---- units -----------------------------------------------------------------------

interface Unit {
  /** The comparison key: a hiragana mora, or a toneless pinyin syllable. */
  key: string;
  /** Chinese only: the tone, 1-5 (5 = neutral or unknown). */
  tone: number;
  /** Index of the token the unit came from. */
  token: number;
}

const KATAKANA = /[ァ-ヶ]/g;
const SMALL_KANA = new Set([...'ゃゅょぁぃぅぇぉゎ']);
const VOWELS = new Set([...'あいうえお']);
/** Anything that is not a sound: spaces, punctuation, symbols. */
const NOT_A_SOUND = /[\s\p{P}\p{S}]/u;

const VOWEL_OF: Readonly<Record<string, string>> = (() => {
  const rows: Record<string, string> = {
    あ: 'あかさたなはまやらわがざだばぱぁゃゎ',
    い: 'いきしちにひみりぎじぢびぴぃ',
    う: 'うくすつぬふむゆるぐずづぶぷぅゅ',
    え: 'えけせてねへめれげぜでべぺぇ',
    お: 'おこそとのほもよろをごぞどぼぽぉょ',
  };
  const out: Record<string, string> = {};
  for (const [vowel, chars] of Object.entries(rows)) for (const ch of chars) out[ch] = vowel;
  return out;
})();

function hiragana(text: string): string {
  return text.normalize('NFKC').replace(KATAKANA, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/** Hiragana morae of `text`: small kana join the mora before them; ー becomes the vowel it lengthens. */
export function japaneseMorae(text: string): string[] {
  const out: string[] = [];
  for (const ch of hiragana(text)) {
    if (NOT_A_SOUND.test(ch) && ch !== 'ー') continue;
    if (ch === 'ー') {
      const last = out[out.length - 1];
      const vowel = last ? VOWEL_OF[[...last].pop() ?? ''] : undefined;
      if (vowel) out.push(vowel);
      continue;
    }
    if (SMALL_KANA.has(ch) && out.length && !/^[っんー]$/.test(out[out.length - 1])) {
      out[out.length - 1] += ch;
      continue;
    }
    out.push(ch);
  }
  return out;
}

const TONE_MARKS: Readonly<Record<string, number>> = { '\u0304': 1, '\u0301': 2, '\u030C': 3, '\u0300': 4 };

/** A pinyin syllable (`mǎ`, `ma3`, `lü4`, `lv`) as its toneless key and its tone (5 when none). */
export function splitPinyinTone(syllable: string): { key: string; tone: number } {
  let tone = 5;
  const decomposed = syllable.trim().toLowerCase().normalize('NFD');
  let base = '';
  for (const ch of decomposed) {
    const mark = TONE_MARKS[ch];
    if (mark) {
      tone = mark;
      continue;
    }
    base += ch;
  }
  base = base.normalize('NFC').replace(/u:/g, 'ü').replace(/v/g, 'ü');
  const digit = /([1-5])$/.exec(base);
  if (digit) {
    tone = Number(digit[1]);
    base = base.slice(0, -1);
  }
  return { key: base.replace(/[^a-zü]/g, ''), tone };
}

function tokenUnits(token: ShadowToken, index: number, lang: ShadowLang): Unit[] {
  if (lang === 'ja') {
    const reading = token.reading && token.reading !== '*' ? token.reading : token.surface;
    return japaneseMorae(reading).map((key) => ({ key, tone: 5, token: index }));
  }
  const out: Unit[] = [];
  const chars = [...token.surface.normalize('NFKC')];
  chars.forEach((ch, i) => {
    if (NOT_A_SOUND.test(ch)) return;
    const syllable = token.syllables?.[i] ?? '';
    const split = syllable ? splitPinyinTone(syllable) : null;
    // No reading for this character: the character itself is the best key there is.
    out.push(split && split.key ? { key: split.key, tone: split.tone, token: index } : { key: ch, tone: 5, token: index });
  });
  return out;
}

function unitsOf(tokens: readonly ShadowToken[], lang: ShadowLang): Unit[] {
  return tokens.flatMap((token, index) => tokenUnits(token, index, lang));
}

// ---- alignment -------------------------------------------------------------------

type Op =
  | { kind: 'match'; e: number; h: number }
  | { kind: 'sub'; e: number; h: number }
  | { kind: 'del'; e: number }
  | { kind: 'ins'; h: number };

/** Levenshtein alignment of two unit sequences, as the list of operations. */
function align(expected: readonly Unit[], heard: readonly Unit[]): { ops: Op[]; distance: number } {
  const n = expected.length;
  const m = heard.length;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = 0; i <= n; i += 1) table[i * width] = i;
  for (let j = 0; j <= m; j += 1) table[j] = j;
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const same = expected[i - 1].key === heard[j - 1].key;
      table[i * width + j] = Math.min(
        table[(i - 1) * width + j - 1] + (same ? 0 : 1),
        table[(i - 1) * width + j] + 1,
        table[i * width + j - 1] + 1,
      );
    }
  }
  const ops: Op[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const here = table[i * width + j];
    if (i > 0 && j > 0) {
      const same = expected[i - 1].key === heard[j - 1].key;
      if (here === table[(i - 1) * width + j - 1] + (same ? 0 : 1)) {
        ops.push(same ? { kind: 'match', e: i - 1, h: j - 1 } : { kind: 'sub', e: i - 1, h: j - 1 });
        i -= 1;
        j -= 1;
        continue;
      }
    }
    if (i > 0 && here === table[(i - 1) * width + j] + 1) {
      ops.push({ kind: 'del', e: i - 1 });
      i -= 1;
      continue;
    }
    ops.push({ kind: 'ins', h: j - 1 });
    j -= 1;
  }
  ops.reverse();
  return { ops, distance: table[n * width + m] };
}

// ---- naming the issues -------------------------------------------------------------

function stripVoicing(mora: string): string {
  return mora.normalize('NFD').replace(/[\u3099\u309A]/g, '').normalize('NFC');
}

function japaneseSubKind(expected: string, heard: string): ShadowHintKind | null {
  if (expected === 'っ' || heard === 'っ') return 'sokuon';
  if (expected === 'ん' || heard === 'ん') return 'moraic-n';
  if (stripVoicing(expected) === stripVoicing(heard)) return 'voicing';
  // きょ heard as き or きよ: the small kana was dropped or said as a full one.
  const hasSmall = (mora: string): boolean => [...mora].some((ch) => SMALL_KANA.has(ch));
  if (hasSmall(expected) === hasSmall(heard)) return null;
  const [small, plain] = hasSmall(expected) ? [expected, heard] : [heard, expected];
  const [head, tail] = [...small];
  // Either half of the mora survives in the other: き or よ for きょ.
  if (plain === head || plain[0] === head || plain === String.fromCharCode((tail ?? '').charCodeAt(0) + 1)) return 'small-kana';
  return null;
}

/** A vowel mora that only lengthens the mora before it (おう, えい, ああ…). */
function lengthensPrevious(units: readonly Unit[], index: number): boolean {
  const mora = units[index]?.key;
  const before = units[index - 1]?.key;
  if (!mora || !before || !VOWELS.has(mora)) return false;
  const vowel = VOWEL_OF[[...before].pop() ?? ''];
  if (!vowel) return false;
  return vowel === mora || (vowel === 'お' && mora === 'う') || (vowel === 'え' && mora === 'い');
}

const RETROFLEX: ReadonlyArray<[string, string]> = [['zh', 'z'], ['ch', 'c'], ['sh', 's']];

function initialOf(syllable: string): string {
  return /^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?/.exec(syllable)?.[0] ?? '';
}

function chineseSubKind(expected: Unit, heard: Unit): ShadowHintKind | null {
  const ei = initialOf(expected.key);
  const hi = initialOf(heard.key);
  const eRest = expected.key.slice(ei.length);
  const hRest = heard.key.slice(hi.length);
  if (eRest === hRest && RETROFLEX.some(([a, b]) => (ei === a && hi === b) || (ei === b && hi === a))) return 'retroflex';
  if (eRest === hRest && ((ei === 'l' && hi === 'n') || (ei === 'n' && hi === 'l'))) return 'l-n';
  if (ei === hi && (eRest === `${hRest}g` || hRest === `${eRest}g`) && /n$/.test(eRest.replace(/g$/, ''))) return 'nasal-final';
  return null;
}

function joinedSurface(tokens: readonly ShadowToken[]): string {
  return tokens.map((token) => token.surface).join('');
}

// ---- timing ----------------------------------------------------------------------

/** Spoken more than 35% longer than the cue reads as slow; under 75% of it, as rushed. */
export const SHADOW_SLOW_RATIO = 1.35;
export const SHADOW_FAST_RATIO = 0.75;

export function shadowTiming(cueSec: number, spokenSec: number): ShadowTiming | null {
  if (!Number.isFinite(cueSec) || !Number.isFinite(spokenSec) || cueSec <= 0.2 || spokenSec <= 0.1) return null;
  const ratio = Math.round((spokenSec / cueSec) * 100) / 100;
  const pace: ShadowPace = ratio > SHADOW_SLOW_RATIO ? 'slow' : ratio < SHADOW_FAST_RATIO ? 'fast' : 'ok';
  return { cueSec: Math.round(cueSec * 100) / 100, spokenSec: Math.round(spokenSec * 100) / 100, ratio, pace };
}

/**
 * Seconds from the first to the last stretch of voice in mono PCM, by 20 ms
 * frame energy against a threshold relative to the loudest frame — so the
 * silence before the learner starts and after they stop does not count as
 * slow speech. `null` when nothing in it is loud enough to be speech.
 */
export function speechSpanSeconds(samples: ArrayLike<number>, sampleRate: number): number | null {
  if (!samples.length || !Number.isFinite(sampleRate) || sampleRate <= 0) return null;
  const frame = Math.max(1, Math.round(sampleRate * 0.02));
  const energies: number[] = [];
  for (let start = 0; start < samples.length; start += frame) {
    const end = Math.min(samples.length, start + frame);
    let sum = 0;
    for (let i = start; i < end; i += 1) sum += samples[i] * samples[i];
    energies.push(Math.sqrt(sum / (end - start)));
  }
  const peak = Math.max(...energies);
  if (!(peak > 0.01)) return null;
  const threshold = Math.max(0.01, peak * 0.12);
  const first = energies.findIndex((energy) => energy >= threshold);
  let last = energies.length - 1;
  while (last > first && energies[last] < threshold) last -= 1;
  return ((last - first + 1) * frame) / sampleRate;
}

// ---- the comparison ------------------------------------------------------------------

const MAX_HINTS = 8;

/**
 * Compares what the learner said (Whisper's transcript, tokenized) with the
 * subtitle line (tokenized). `null` when the line has no sound to compare.
 */
export function compareShadowing(
  expectedTokens: readonly ShadowToken[],
  heardTokens: readonly ShadowToken[],
  lang: ShadowLang,
  timing?: { cueSec: number; spokenSec: number | null },
): ShadowingComparison | null {
  const expected = unitsOf(expectedTokens, lang);
  if (!expected.length) return null;
  const heard = unitsOf(heardTokens, lang);
  const { ops, distance } = align(expected, heard);

  const matchedPerExpected = new Array<number>(expectedTokens.length).fill(0);
  const unitsPerExpected = new Array<number>(expectedTokens.length).fill(0);
  const matchedPerHeard = new Array<number>(heardTokens.length).fill(0);
  const unitsPerHeard = new Array<number>(heardTokens.length).fill(0);
  for (const unit of expected) unitsPerExpected[unit.token] += 1;
  for (const unit of heard) unitsPerHeard[unit.token] += 1;

  const hints: ShadowHint[] = [];
  const seen = new Set<string>();
  const hint = (kind: ShadowHintKind, e: string, h: string, word: string): void => {
    const key = `${kind}\0${e}\0${h}`;
    if (seen.has(key) || hints.length >= MAX_HINTS) return;
    seen.add(key);
    hints.push({ kind, expected: e, heard: h, word });
  };
  const wordOf = (unit: Unit): string => expectedTokens[unit.token]?.surface ?? '';

  for (const op of ops) {
    if (op.kind === 'match') {
      matchedPerExpected[expected[op.e].token] += 1;
      matchedPerHeard[heard[op.h].token] += 1;
      // Same syllable, other tone: Chinese counts the sound as heard but names the tone.
      if (lang === 'zh' && expected[op.e].tone !== 5 && heard[op.h].tone !== 5 && expected[op.e].tone !== heard[op.h].tone) {
        hint('tone', `${expected[op.e].key}${expected[op.e].tone}`, `${heard[op.h].key}${heard[op.h].tone}`, wordOf(expected[op.e]));
      }
      continue;
    }
    if (op.kind === 'sub') {
      const e = expected[op.e];
      const h = heard[op.h];
      const kind = lang === 'ja' ? japaneseSubKind(e.key, h.key) : chineseSubKind(e, h);
      if (kind) hint(kind, e.key, h.key, wordOf(e));
      continue;
    }
    if (op.kind === 'del') {
      const e = expected[op.e];
      if (lang === 'ja' && e.key === 'っ') hint('sokuon', e.key, '', wordOf(e));
      else if (lang === 'ja' && e.key === 'ん') hint('moraic-n', e.key, '', wordOf(e));
      else if (lang === 'ja' && lengthensPrevious(expected, op.e)) hint('long-vowel', `${expected[op.e - 1].key}${e.key}`, expected[op.e - 1].key, wordOf(e));
      else hint('missed-sound', e.key, '', wordOf(e));
      continue;
    }
    const h = heard[op.h];
    if (lang === 'ja' && h.key === 'っ') hint('sokuon', '', h.key, '');
    else if (lang === 'ja' && lengthensPrevious(heard, op.h)) hint('long-vowel', heard[op.h - 1].key, `${heard[op.h - 1].key}${h.key}`, '');
    else hint('extra-sound', '', h.key, '');
  }

  const expectedOut: ShadowExpectedToken[] = expectedTokens.map((token, index) => {
    const total = unitsPerExpected[index];
    const matched = matchedPerExpected[index];
    const status: ShadowTokenStatus = total === 0 ? 'plain' : matched === total ? 'match' : matched === 0 ? 'miss' : 'partial';
    return { surface: token.surface, status };
  });
  const heardOut: ShadowHeardToken[] = heardTokens.map((token, index) => {
    const total = unitsPerHeard[index];
    const matched = matchedPerHeard[index];
    const status: ShadowHeardStatus = total === 0 ? 'plain' : matched === total ? 'match' : matched === 0 ? 'extra' : 'partial';
    return { surface: token.surface, status };
  });

  const longest = Math.max(expected.length, heard.length);
  const score = Math.max(0, Math.min(100, Math.round((1 - distance / longest) * 100)));
  const counts = {
    match: expectedOut.filter((t) => t.status === 'match').length,
    partial: expectedOut.filter((t) => t.status === 'partial').length,
    miss: expectedOut.filter((t) => t.status === 'miss').length,
    extra: heardOut.filter((t) => t.status === 'extra').length,
  };
  return {
    lang,
    score,
    expected: expectedOut,
    heard: heardOut,
    counts,
    hints,
    expectedUnits: expected.length,
    heardUnits: heard.length,
    timing: timing && timing.spokenSec != null ? shadowTiming(timing.cueSec, timing.spokenSec) : null,
  };
}

/** The words of the line the learner left out or garbled, in order (for the AI request). */
export function shadowMissedWords(comparison: ShadowingComparison): string[] {
  return comparison.expected.filter((t) => t.status === 'miss' || t.status === 'partial').map((t) => t.surface);
}

/** What the learner said that the line does not have. */
export function shadowExtraWords(comparison: ShadowingComparison): string[] {
  return comparison.heard.filter((t) => t.status === 'extra').map((t) => t.surface);
}

/** The line as one string (for prompts and logs). */
export function shadowLineText(tokens: readonly ShadowToken[]): string {
  return joinedSurface(tokens);
}
