// Tokyo-dialect pitch accent: mora splitting, the high/low contour, and the
// pattern's name.
//
// Study-native track item 2. The data comes from the downloadable Kanjium
// dictionary and is read in main (`dictionary/yomitan.ts`), which already turned
// a downstep into inline HTML for mining. That HTML is Study OS presentation, so
// the shape of the contour is extracted here instead: pure, testable, and usable
// by a Blanc panel that draws its own.
//
// `splitMorae` moved here from yomitan.ts and is imported back by it, so the two
// surfaces cannot disagree about what a mora is.

/**
 * Split a kana reading into morae.
 *
 * A small kana (ゃゅょ, the small vowels, ゎ) binds to the preceding character
 * rather than standing alone — きょ is one mora, not two.
 *
 * **っ/ッ is NOT in that set, and that is a change from the version this was
 * extracted from** (main/dictionary/yomitan.ts). The sokuon is a full mora in
 * Japanese: がっこう is が・っ・こ・う, four morae. The old set bound it to the
 * previous character, giving three — and since Kanjium's downstep indices count
 * the sokuon, every reading containing っ had its contour shifted one mora left.
 * That affected the existing `{pitch}` mining field too, not just this panel.
 * Long vowels (ー) and ん were already correct: both stand alone.
 */
export function splitMorae(reading: string): string[] {
  const s = reading.normalize('NFKC');
  const morae: string[] = [];
  let cur = '';
  const small = new Set('ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ');
  for (const ch of s) {
    if (small.has(ch) && cur) {
      cur += ch;
    } else {
      if (cur) morae.push(cur);
      cur = ch;
    }
  }
  if (cur) morae.push(cur);
  return morae;
}

/**
 * Which morae are high, for a given downstep.
 *
 * `downstep` is the Yomitan/Kanjium mora index of the accent nucleus, where 0
 * means heiban (no downstep). Tokyo dialect:
 *
 *   heiban (0)      L H H H …   — stays high, and the following particle is high
 *   atamadaka (1)   H L L L …   — drops immediately after the first mora
 *   nakadaka/odaka  L H … H L … — rises, then drops after the accent mora
 *
 * Returns one boolean per mora. Byte-for-byte the same rule `pitchPatternHtml`
 * used before this was extracted.
 */
export function moraPitch(reading: string, downstep: number): boolean[] {
  const morae = splitMorae(reading);
  return morae.map((_, i) => {
    const n = i + 1;
    if (downstep === 0) return n > 1;
    if (downstep === 1) return n === 1;
    return n > 1 && n <= downstep;
  });
}

export type PitchPattern = 'heiban' | 'atamadaka' | 'nakadaka' | 'odaka' | 'unknown';

/**
 * Name the pattern.
 *
 * The odaka/nakadaka distinction needs the mora count: both drop after the
 * accent mora, but odaka's accent is on the *last* mora, so the drop only shows
 * on a following particle. That is why this takes `moraCount` rather than
 * deriving the name from the downstep alone.
 */
export function pitchPatternName(downstep: number, moraCount: number): PitchPattern {
  if (!Number.isInteger(downstep) || downstep < 0 || moraCount <= 0) return 'unknown';
  if (downstep > moraCount) return 'unknown';
  if (downstep === 0) return 'heiban';
  if (downstep === 1) return moraCount === 1 ? 'odaka' : 'atamadaka';
  if (downstep === moraCount) return 'odaka';
  return 'nakadaka';
}

/** Human label, for the panel. */
export const PITCH_PATTERN_LABELS: Record<PitchPattern, string> = {
  heiban: 'Heiban — flat, stays high (平板)',
  atamadaka: 'Atamadaka — drops after the first mora (頭高)',
  nakadaka: 'Nakadaka — rises then drops mid-word (中高)',
  odaka: 'Odaka — drops on the following particle (尾高)',
  unknown: 'Unknown pattern',
};

/** One reading's accent data, as sent from main. */
export interface PitchEntry {
  reading: string;
  /** Downstep mora positions; 0 = heiban. A word can have more than one. */
  positions: number[];
}

/** Reply from the pitch IPC. */
export interface PitchLookup {
  /** False when the Kanjium asset is not installed — the panel says so. */
  available: boolean;
  entries: PitchEntry[];
}

/** Validate an IPC reply before trusting it (same reason as DueForecast). */
export function isPitchLookup(value: unknown): value is PitchLookup {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<PitchLookup>;
  if (typeof v.available !== 'boolean' || !Array.isArray(v.entries)) return false;
  return v.entries.every(
    (e) =>
      e &&
      typeof e.reading === 'string' &&
      Array.isArray(e.positions) &&
      e.positions.every((p) => typeof p === 'number'),
  );
}
