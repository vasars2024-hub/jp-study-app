/**
 * Subtitle bytes to text, without assuming UTF-8.
 *
 * A subtitle a learner drops into the player is very often not UTF-8: Japanese
 * fansub `.ass` files are routinely Shift-JIS, Chinese ones GBK/GB18030, Russian
 * ones Windows-1251, and Windows tools still write UTF-16 with or without a BOM.
 * `File.text()` and `readFileSync(path, 'utf-8')` turn every one of those into
 * replacement characters, which parse into cues of mojibake that look like a
 * subtitle and are not one.
 *
 * Order of evidence, strongest first:
 *   1. a byte-order mark (UTF-8, UTF-16LE, UTF-16BE);
 *   2. many NUL bytes, which only UTF-16 text has (SRT/ASS are ASCII-heavy:
 *      timestamps, arrows, tags), and their parity says which byte order;
 *   3. bytes that are valid UTF-8 are UTF-8 (legacy CJK encodings almost never
 *      happen to form valid multi-byte UTF-8 sequences);
 *   4. otherwise each legacy candidate is decoded and scored on how plausible the
 *      result is for that encoding's language, because every one of them decodes
 *      almost any byte string without an error.
 *
 * Pure and dependency-free: `TextDecoder` with the WHATWG labels exists in
 * Chromium and in Node with full ICU. A candidate the runtime cannot decode is
 * skipped rather than thrown.
 */

export interface DecodedSubtitle {
  text: string;
  /** WHATWG encoding label that produced `text`. */
  encoding: string;
}

const NUL_SAMPLE_BYTES = 4096;

function toBytes(bytes: ArrayBuffer | Uint8Array): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

function decodeWith(label: string, bytes: Uint8Array, fatal = false): string | null {
  try {
    return new TextDecoder(label, { fatal }).decode(bytes);
  } catch {
    return null;
  }
}

/** UTF-16 byte order from NUL parity, or null when the bytes are not NUL-heavy. */
function sniffUtf16(bytes: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  const length = Math.min(bytes.length, NUL_SAMPLE_BYTES);
  if (length < 4) return null;
  let even = 0;
  let odd = 0;
  for (let i = 0; i < length; i += 1) {
    if (bytes[i] !== 0) continue;
    if (i % 2 === 0) even += 1;
    else odd += 1;
  }
  if ((even + odd) / length < 0.2) return null;
  // ASCII in UTF-16LE is `41 00`: the NUL is the odd byte.
  if (odd >= even * 2) return 'utf-16le';
  if (even >= odd * 2) return 'utf-16be';
  return null;
}

const isKana = (c: number): boolean => c >= 0x3040 && c <= 0x30ff;
const isHan = (c: number): boolean => (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf);
const isHalfwidthKana = (c: number): boolean => c >= 0xff61 && c <= 0xff9f;
const isCjkPunctuation = (c: number): boolean =>
  (c >= 0x3000 && c <= 0x303f) || (c >= 0xff01 && c <= 0xff5e) || (c >= 0x2010 && c <= 0x2027)
  || c === 0x2026 || (c >= 0x2190 && c <= 0x21ff) || (c >= 0x25a0 && c <= 0x26ff) || c === 0x00b7;
const isCyrillicLetter = (c: number): boolean => (c >= 0x0410 && c <= 0x044f) || c === 0x0401 || c === 0x0451;
const isCyrillicUpper = (c: number): boolean => (c >= 0x0410 && c <= 0x042f) || c === 0x0401;
const isCyrillicLower = (c: number): boolean => (c >= 0x0430 && c <= 0x044f) || c === 0x0451;
/** Punctuation Windows-1251 Russian text actually uses: « » – — “ ” „ ‘ ’ … № •. */
const CP1251_PUNCTUATION = new Set([0x00ab, 0x00bb, 0x2013, 0x2014, 0x201c, 0x201d, 0x201e, 0x2018, 0x2019, 0x2026, 0x2116, 0x2022, 0x00a0]);
const isBad = (c: number): boolean => c === 0xfffd || (c >= 0x80 && c <= 0x9f);

type Candidate = 'shift_jis' | 'gb18030' | 'windows-1251' | 'euc-jp';

const isJapaneseCandidate = (encoding: Candidate): boolean => encoding === 'shift_jis' || encoding === 'euc-jp';

/**
 * How plausible `text` is as `encoding`'s language, roughly -3..1.5. Only
 * non-ASCII characters count: the ASCII skeleton of a subtitle (timestamps,
 * tags, numbers) decodes identically under every candidate and says nothing.
 */
function scoreDecodedSubtitle(text: string, encoding: Candidate): number {
  let total = 0;
  let good = 0;
  let bad = 0;
  let kana = 0;
  let previous = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x80) {
      previous = c;
      continue;
    }
    total += 1;
    if (isBad(c)) {
      bad += 1;
    } else if (isJapaneseCandidate(encoding)) {
      if (isKana(c)) {
        kana += 1;
        good += 1;
      } else if (isHan(c) || isCjkPunctuation(c)) good += 1;
      // Chinese GB bytes read as Shift-JIS fall into the single-byte halfwidth
      // katakana block; real Japanese subtitles almost never use it.
      else if (isHalfwidthKana(c)) bad += 1;
    } else if (encoding === 'gb18030') {
      if (isHan(c) || isCjkPunctuation(c)) good += 1;
    } else if (isCyrillicLetter(c)) {
      // A capital straight after a lowercase letter is what CJK bytes read as
      // Windows-1251 look like; Russian prose almost never does it.
      if (isCyrillicUpper(c) && isCyrillicLower(previous)) bad += 1;
      else good += 1;
    } else if (CP1251_PUNCTUATION.has(c)) good += 1;
    previous = c;
  }
  if (total === 0) return 0;
  const ratio = (good - 3 * bad) / total;
  // Hiragana/katakana under a Shift-JIS reading is the one signal no other
  // candidate can fake: GB text never puts lead byte 0x82/0x83 in front of a kana trail.
  // EUC-JP kana (0xA4/0xA5 leads) read as GB are kana too, but only a Japanese
  // candidate scores them, so EUC-JP still wins over GB18030 for Japanese text.
  const kanaBonus = isJapaneseCandidate(encoding) ? Math.min(kana / total, 0.5) : 0;
  return ratio + kanaBonus;
}

// EUC-JP last: pure-kanji text without kana ties with GB18030 and keeps the
// earlier reading, and Shift-JIS bytes are invalid EUC-JP (0x81-0x9F leads).
const LEGACY_CANDIDATES: readonly Candidate[] = ['shift_jis', 'gb18030', 'windows-1251', 'euc-jp'];

/**
 * Decodes subtitle file bytes, detecting the encoding. Never throws; falls back
 * to lenient UTF-8 when nothing else is plausible. A leading U+FEFF (a BOM that
 * survived, e.g. a doubled one) is removed from the text.
 */
export function decodeSubtitleBytes(input: ArrayBuffer | Uint8Array): DecodedSubtitle {
  const decoded = detectSubtitleEncoding(input);
  return decoded.text.charCodeAt(0) === 0xfeff ? { ...decoded, text: decoded.text.slice(1) } : decoded;
}

function detectSubtitleEncoding(input: ArrayBuffer | Uint8Array): DecodedSubtitle {
  const bytes = toBytes(input);
  if (bytes.length === 0) return { text: '', encoding: 'utf-8' };

  // 1. Byte-order marks. The decoders strip the BOM themselves.
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: decodeWith('utf-8', bytes) ?? '', encoding: 'utf-8' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    const text = decodeWith('utf-16le', bytes);
    if (text !== null) return { text, encoding: 'utf-16le' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const text = decodeWith('utf-16be', bytes);
    if (text !== null) return { text, encoding: 'utf-16be' };
  }

  // 2. UTF-16 without a BOM.
  const utf16 = sniffUtf16(bytes);
  if (utf16) {
    const text = decodeWith(utf16, bytes);
    if (text !== null) return { text, encoding: utf16 };
  }

  // 3. Strictly valid UTF-8.
  const utf8 = decodeWith('utf-8', bytes, true);
  if (utf8 !== null) return { text: utf8, encoding: 'utf-8' };

  // 4. The legacy encodings, best plausibility first; ties keep list order.
  let best: { text: string; encoding: Candidate; score: number } | null = null;
  for (const encoding of LEGACY_CANDIDATES) {
    const text = decodeWith(encoding, bytes);
    if (text === null) continue;
    const score = scoreDecodedSubtitle(text, encoding);
    if (!best || score > best.score) best = { text, encoding, score };
  }
  if (best && best.score > 0) return { text: best.text, encoding: best.encoding };
  return { text: decodeWith('utf-8', bytes) ?? '', encoding: 'utf-8' };
}
