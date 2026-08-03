// Deterministic choreography for the WIRED full-screen lyric transmission
// (WiredLyricStream). Pure data/logic only — no DOM, no React — so the
// timing and glyph choices can be unit-reasoned about and reused by both the
// stream component and, eventually, tests.
//
// The core idea: a lyric line travels right-to-left across the desktop as a
// single stable layer. Progress `p` runs 0 (spawns off the right edge) to 1
// (dissolves off the left edge). Everything else — which characters glitch,
// which Japanese fragment gets pulled out, when the visualizer flares — is a
// pure function of (line text, a seed derived from that text, p). Same line,
// same seed, same show every time; different lines land on different seeds
// because the seed is hashed from the line's own text.

export type Zone = 'entry' | 'decode' | 'clarity' | 'interference' | 'archive' | 'exit';

const ZONE_BOUNDS: [Zone, number, number][] = [
  ['entry', 0, 0.08],
  ['decode', 0.08, 0.24],
  ['clarity', 0.24, 0.6],
  ['interference', 0.6, 0.8],
  ['archive', 0.8, 0.92],
  ['exit', 0.92, 1.001],
];

export function zoneAt(p: number): Zone {
  for (const [zone, from, to] of ZONE_BOUNDS) if (p >= from && p < to) return zone;
  return 'exit';
}

/** Right edge (off-screen) → left edge (off-screen), in vw. */
export function progressToVw(p: number): number {
  return 120 - p * 240;
}

/** Left edge → right edge — the "back lane" preview travels the opposite
 *  way to the main transmission, like film feeding in before it's printed. */
export function progressToVwReverse(p: number): number {
  return -progressToVw(p);
}

// ----- deterministic randomness ---------------------------------------------

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, deterministic. */
function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ----- Japanese fragment pools -----------------------------------------------

/** Semantic fragments — meaning/tone, not decoration for its own sake. */
export const SEMANTIC_FRAGMENTS = [
  '記憶', '信号', '接続', '心', '夢', '声', '孤独', '再生', '解析', '未確認',
];

/** English keyword → the fragment it should surface, when a line contains it. */
const SEMANTIC_KEYWORDS: [RegExp, string][] = [
  [/\b(memory|memories|remember|remembered)\b/i, '記憶'],
  [/\b(signal|radio|frequency|transmit)\b/i, '信号'],
  [/\b(connect|connection|reach|link)\b/i, '接続'],
  [/\b(love|heart|beloved)\b/i, '心'],
  [/\b(dream|dreaming|dreamt)\b/i, '夢'],
  [/\b(voice|sing|singing|song|call)\b/i, '声'],
  [/\b(alone|lonely|loneliness)\b/i, '孤独'],
  [/\b(again|replay|return|back)\b/i, '再生'],
  [/\b(analy[sz]e|understand|meaning)\b/i, '解析'],
  [/\b(unknown|mystery|stranger|nowhere)\b/i, '未確認'],
];

/** Small, curated — never invented. Only used on an exact whole-word hit. */
const PHONETIC_HINTS: Record<string, string> = {
  love: 'ラヴ', heart: 'ハート', night: 'ナイト', dream: 'ドリーム', dreams: 'ドリームズ',
  voice: 'ヴォイス', sky: 'スカイ', light: 'ライト', time: 'タイム', rain: 'レイン',
  fire: 'ファイア', eyes: 'アイズ', world: 'ワールド', alone: 'アローン', memory: 'メモリー',
  signal: 'シグナル', soul: 'ソウル', star: 'スター', stars: 'スターズ', moon: 'ムーン',
  sun: 'サン', tears: 'ティアーズ', silence: 'サイレンス', shadow: 'シャドウ',
};

/** Concise technical labels for the analysis rail. */
export const SYSTEM_METADATA = [
  '音声解析', '歌詞同期', '信号受信', '意味抽出', '記憶照合', '翻訳保留', '音響層', '接続維持',
];

/** Glyph substitution pool — katakana + a few geometric/technical marks. */
const GLYPH_POOL =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン◇◈▚∴⌁'.split('');

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'is', 'it',
  'i', 'you', 'we', 'my', 'me', 'so', 'be', 'as', 'at', 'up', 'do', 'no',
]);

// ----- line script -----------------------------------------------------------

export type CharEffectKind = 'shear' | 'substitute' | 'duplicate' | 'decode';

export interface CharEvent {
  kind: CharEffectKind;
  /** Progress (0..1) at which this fires. Fires exactly once. */
  at: number;
  indices: number[];
  /** Only for 'substitute' / 'decode' — the glyph each index resolves through. */
  glyphs?: string[];
}

export interface RangeEvent {
  kind: 'scan' | 'compress';
  at: number;
  from: number;
  to: number;
}

export interface LineScript {
  seed: number;
  presetId: number;
  charEvents: CharEvent[];
  rangeEvents: RangeEvent[];
  /** Progress at which the semantic fragment detaches toward the analysis rail. */
  archiveAt: number;
  fragment: string;
  /** Char index range the fragment visually detaches from, for the origin point. */
  fragmentRange: [number, number] | null;
  phonetic: { range: [number, number]; text: string } | null;
}

interface Word {
  text: string;
  from: number;
  to: number; // exclusive
}

function splitWords(text: string): Word[] {
  const words: Word[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) words.push({ text: m[0], from: m.index, to: m.index + m[0].length });
  return words;
}

function pickSemanticWord(words: Word[]): Word | null {
  for (const w of words) {
    const bare = w.text.replace(/[^\w']/g, '');
    if (SEMANTIC_KEYWORDS.some(([re]) => re.test(bare))) return w;
  }
  const candidates = words.filter((w) => w.text.replace(/[^\w']/g, '').length >= 4);
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (b.text.length > a.text.length ? b : a));
}

function fragmentFor(word: Word | null, seed: number): string {
  if (word) {
    const bare = word.text.replace(/[^\w']/g, '');
    const hit = SEMANTIC_KEYWORDS.find(([re]) => re.test(bare));
    if (hit) return hit[1];
  }
  return SEMANTIC_FRAGMENTS[seed % SEMANTIC_FRAGMENTS.length];
}

function pickPhonetic(words: Word[]): { range: [number, number]; text: string } | null {
  for (const w of words) {
    const bare = w.text.toLowerCase().replace(/[^a-z']/g, '');
    const hit = PHONETIC_HINTS[bare];
    if (hit) return { range: [w.from, w.to], text: hit };
  }
  return null;
}

function glyphAt(rng: () => number): string {
  return GLYPH_POOL[Math.floor(rng() * GLYPH_POOL.length)];
}

/**
 * Build the full deterministic show for one lyric line. `intensity` scales
 * how much is allowed to happen at all — 1 for full motion, lower for the
 * app's own reduced-motion setting, 0 collapses to just the decode arrival.
 */
export function buildLineScript(text: string, intensity: number): LineScript {
  const seed = hashString(text);
  const rng = rngFrom(seed);
  const presetId = Math.floor(rng() * 4);
  const len = text.length;
  const words = splitWords(text);

  const charEvents: CharEvent[] = [];
  const rangeEvents: RangeEvent[] = [];

  // Decode arrival: the first handful of non-space characters resolve out of
  // glyph noise, left to right, as the line crosses into view.
  const decodeIndices: number[] = [];
  for (let i = 0; i < len && decodeIndices.length < 9; i++) {
    if (text[i] !== ' ') decodeIndices.push(i);
  }
  if (decodeIndices.length) {
    charEvents.push({
      kind: 'decode',
      at: 0.03,
      indices: decodeIndices,
      glyphs: decodeIndices.map(() => glyphAt(rng)),
    });
  }

  if (intensity > 0) {
    // One brief single-glyph substitution somewhere in the decode/clarity read.
    const subCandidates = Array.from({ length: len }, (_, i) => i).filter(
      (i) => text[i] !== ' ' && !decodeIndices.includes(i),
    );
    if (subCandidates.length) {
      const idx = subCandidates[Math.floor(rng() * subCandidates.length)];
      charEvents.push({ kind: 'substitute', at: 0.3 + rng() * 0.14, indices: [idx], glyphs: [glyphAt(rng)] });
    }
  }

  if (intensity > 0.5) {
    // Interference zone: the preset's primary cluster effect, plus a second
    // cluster of a different kind layered on top — more is happening, but
    // each cluster is still small and still resolves on its own.
    const clusterStart = Math.max(0, Math.floor(rng() * Math.max(1, len - 6)));
    const clusterLen = Math.min(2 + Math.floor(rng() * 5), len - clusterStart);
    const cluster = Array.from({ length: clusterLen }, (_, i) => clusterStart + i).filter(
      (i) => text[i] !== ' ',
    );
    const primaryKind = presetId === 1 ? 'scan' : presetId === 3 ? 'duplicate' : 'shear';
    const at = 0.61 + rng() * 0.08;
    if (cluster.length) {
      if (primaryKind === 'scan') {
        rangeEvents.push({ kind: 'scan', at, from: clusterStart, to: clusterStart + clusterLen });
      } else {
        charEvents.push({ kind: primaryKind, at, indices: cluster });
      }
    }

    const c2Start = Math.max(0, Math.floor(rng() * Math.max(1, len - 5)));
    const c2Len = Math.min(2 + Math.floor(rng() * 4), len - c2Start);
    const cluster2 = Array.from({ length: c2Len }, (_, i) => c2Start + i).filter((i) => text[i] !== ' ');
    const secondKind = primaryKind === 'duplicate' ? 'shear' : 'duplicate';
    const at2 = 0.7 + rng() * 0.08;
    if (cluster2.length) charEvents.push({ kind: secondKind, at: at2, indices: cluster2 });

    // Compression pulse on a short, non-trivial word during the clarity read.
    // Skipped if it would overlap the interference-zone scan range above —
    // the renderer groups characters into non-overlapping DOM wrappers per
    // range, so two ranges sharing indices would silently drop one.
    const shortWords = words.filter((w) => w.text.length >= 3 && w.text.length <= 6);
    if (shortWords.length) {
      const w = shortWords[Math.floor(rng() * shortWords.length)];
      const scanRange = rangeEvents.find((e) => e.kind === 'scan');
      const overlapsScan = scanRange && w.from < scanRange.to && w.to > scanRange.from;
      if (!overlapsScan) rangeEvents.push({ kind: 'compress', at: 0.34 + rng() * 0.08, from: w.from, to: w.to });
    }

    // A second, independent substitution beat mid-line — the signal keeps
    // slipping even after it's stabilized.
    const midSubCandidates = Array.from({ length: len }, (_, i) => i).filter((i) => text[i] !== ' ');
    if (midSubCandidates.length) {
      const idx = midSubCandidates[Math.floor(rng() * midSubCandidates.length)];
      charEvents.push({ kind: 'substitute', at: 0.46 + rng() * 0.08, indices: [idx], glyphs: [glyphAt(rng)] });
    }

    // One last flicker right before the line dissolves — a damaged stream
    // losing its grip as it goes, rather than a clean cutoff.
    if (midSubCandidates.length) {
      const idx = midSubCandidates[Math.floor(rng() * midSubCandidates.length)];
      charEvents.push({ kind: 'substitute', at: 0.94 + rng() * 0.04, indices: [idx], glyphs: [glyphAt(rng)] });
    }
  }

  const semanticWord = pickSemanticWord(words) ?? (words.length ? words[words.length - 1] : null);
  const meaningfulWord =
    semanticWord && !STOPWORDS.has(semanticWord.text.toLowerCase().replace(/[^\w']/g, ''))
      ? semanticWord
      : words.find((w) => !STOPWORDS.has(w.text.toLowerCase().replace(/[^\w']/g, ''))) ?? semanticWord;

  return {
    seed,
    presetId,
    charEvents,
    rangeEvents,
    archiveAt: 0.83 + rng() * 0.06,
    fragment: fragmentFor(meaningfulWord, seed),
    fragmentRange: meaningfulWord ? [meaningfulWord.from, meaningfulWord.to] : null,
    phonetic: intensity > 0.5 ? pickPhonetic(words) : null,
  };
}

export function metadataFor(seed: number, cursor: number): string {
  return SYSTEM_METADATA[(seed + cursor) % SYSTEM_METADATA.length];
}

// ----- back-lane preview -----------------------------------------------------

export interface FlickerChar {
  index: number;
  glyph: string;
  delayMs: number;
  durationMs: number;
}

/**
 * A deterministic, always-on flicker for the small "back lane" preview line
 * (the next lyric, mirrored, arriving from the opposite direction before it
 * becomes the next front-line transmission). Unlike the front line's one-shot
 * events, this is meant to read as raw, not-yet-decoded data — continuous and
 * a little unstable — so each picked character just loops its own flicker
 * forever via CSS, no scheduling needed.
 */
export function pickFlickerPlan(text: string, ratio: number): FlickerChar[] {
  const seed = hashString(text) ^ 0x9e3779b9;
  const rng = rngFrom(seed);
  const plan: FlickerChar[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') continue;
    if (rng() < ratio) {
      plan.push({
        index: i,
        glyph: glyphAt(rng),
        delayMs: Math.floor(rng() * 2200),
        durationMs: 1800 + Math.floor(rng() * 1600),
      });
    }
  }
  return plan;
}

// ----- visualizer -------------------------------------------------------------

/** Group raw frequency bins into `bandCount` normalized (0..1) levels. */
export function bandLevels(freq: Uint8Array, binCount: number, bandCount: number, out: number[]): void {
  // Log-ish grouping so bass doesn't dominate every bucket.
  const usable = Math.max(1, Math.min(binCount, freq.length));
  for (let b = 0; b < bandCount; b++) {
    const lo = Math.floor((usable * (b / bandCount)) ** 0.82 * usable ** 0.18);
    const hi = Math.max(lo + 1, Math.floor((usable * ((b + 1) / bandCount)) ** 0.82 * usable ** 0.18));
    let sum = 0;
    let n = 0;
    for (let i = lo; i < Math.min(hi, usable); i++) {
      sum += freq[i];
      n++;
    }
    out[b] = n ? sum / n / 255 : 0;
  }
}

/** Deterministic low-amplitude idle motion when there's no real audio data. */
export function idleWave(tSec: number, bandCount: number, out: number[]): void {
  for (let b = 0; b < bandCount; b++) {
    const phase = b * 0.6;
    out[b] =
      0.08 +
      0.05 * Math.sin(tSec * 0.9 + phase) +
      0.03 * Math.sin(tSec * 2.3 + phase * 1.7);
    if (out[b] < 0) out[b] = 0;
  }
}
