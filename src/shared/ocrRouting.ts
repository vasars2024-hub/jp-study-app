/**
 * Which OCR engine should read this image?
 *
 * The general (PP-OCR) engine and manga-ocr fail in opposite directions, so the
 * choice matters more than either model's accuracy:
 *
 * - PP-OCR detects text lines, then reads each one. On printed text — web pages,
 *   subtitles, signage — that is exactly right, and manga-ocr would instead
 *   hallucinate a fluent sentence that is not on the page.
 * - On tategaki speech bubbles PP-OCR's detector merges the whole bubble into a
 *   single box. Nothing then splits it back into columns, so the box is either
 *   read as one squashed horizontal line (garbage, low confidence) or, when it
 *   happens to be narrow, sliced into horizontal ink rows that alternate between
 *   two adjacent columns — producing *confidently* interleaved text such as
 *   `巨そ大んのな国人でほが` for そんな人が / 巨人の国に!?. manga-ocr reads a
 *   bubble as one block and ignores furigana natively.
 *
 * The second failure is the dangerous one: it scores ~0.78 mean confidence, so a
 * confidence threshold alone will not catch it. That is why `shouldTryMangaOcr`
 * also treats "mostly vertical boxes and less than excellent confidence" as
 * suspect — vertical layout is the condition under which PP-OCR's missing column
 * splitting bites.
 *
 * Pure functions, no model access, so the policy is unit-testable on its own.
 */

/** Shape of a PP-OCR line the routing decision cares about. */
export interface RoutingLine {
  text: string;
  /** [x0, y0, x1, y1] in source-image pixels. */
  box: [number, number, number, number];
  vertical: boolean;
  confidence: number;
}

export interface PaddleQuality {
  lineCount: number;
  /** Mean per-line confidence, 0 when there are no lines. */
  meanConfidence: number;
  /** Share of lines the detector called vertical, 0 when there are no lines. */
  verticalFraction: number;
  totalChars: number;
  /**
   * Share of lines whose box is squarish rather than long and thin.
   *
   * This is the most direct evidence of the merged-column failure: a real text
   * line is many times longer than it is thick, whereas a bubble whose columns
   * got merged into one box comes out roughly square. Measured on a One Piece
   * panel, every surviving box was 0.48–0.59 thin-to-long ratio, against ~0.1
   * for correctly split lines of printed text.
   */
  blobFraction: number;
  /** Recognized characters per megapixel of source image; 0 when unknown. */
  charDensity: number;
}

/** At or above this thin-side/long-side ratio a box is a blob, not a line. */
const BLOB_RATIO = 0.45;

export function summarizePaddle(
  lines: readonly RoutingLine[],
  imagePixels = 0,
): PaddleQuality {
  if (!lines.length) {
    return {
      lineCount: 0,
      meanConfidence: 0,
      verticalFraction: 0,
      totalChars: 0,
      blobFraction: 0,
      charDensity: 0,
    };
  }
  const totalChars = lines.reduce((s, l) => s + l.text.length, 0);
  const meanConfidence = lines.reduce((s, l) => s + l.confidence, 0) / lines.length;
  const verticalFraction = lines.filter((l) => l.vertical).length / lines.length;
  const blobs = lines.filter((l) => {
    const w = Math.abs(l.box[2] - l.box[0]);
    const h = Math.abs(l.box[3] - l.box[1]);
    const long = Math.max(w, h);
    return long > 0 && Math.min(w, h) / long >= BLOB_RATIO;
  }).length;
  const megapixels = imagePixels / 1_000_000;
  return {
    lineCount: lines.length,
    meanConfidence,
    verticalFraction,
    totalChars,
    blobFraction: blobs / lines.length,
    charDensity: megapixels > 0 ? totalChars / megapixels : 0,
  };
}

/** Below this, PP-OCR is plainly failing whatever the layout. */
const WEAK_CONFIDENCE = 0.7;
/**
 * Blobby boxes are the merged-column signature, so they get the strictest bar of
 * all — only a near-perfect read is allowed to stand on that geometry.
 */
const BLOBBY_CONFIDENCE = 0.95;
const BLOB_SHARE = 0.5;
/**
 * Vertical layout gets a much stricter bar, because the interleaving failure
 * reads as confident. Measured: a two-column bubble misread character-by-character
 * still scored 0.78–0.81, while a genuinely clean single-column read sits above 0.9.
 */
const VERTICAL_CONFIDENCE = 0.85;
const VERTICAL_SHARE = 0.5;
/** Fewer characters than this is a non-read, not a short line. */
const MIN_PLAUSIBLE_CHARS = 4;

/**
 * Is the PP-OCR result weak enough to be worth a second opinion from manga-ocr?
 *
 * Deliberately one-directional: this only ever *adds* a manga attempt, and the
 * caller still compares the two reads before committing. Printed text that
 * PP-OCR handles well never reaches manga-ocr, which is what keeps its
 * hallucination failure mode out of the web path.
 */
export function shouldTryMangaOcr(q: PaddleQuality): boolean {
  if (q.lineCount === 0) return true;
  if (q.totalChars < MIN_PLAUSIBLE_CHARS) return true;
  if (q.meanConfidence < WEAK_CONFIDENCE) return true;
  if (q.blobFraction >= BLOB_SHARE && q.meanConfidence < BLOBBY_CONFIDENCE) return true;
  if (q.verticalFraction >= VERTICAL_SHARE && q.meanConfidence < VERTICAL_CONFIDENCE) return true;
  return false;
}

/** Hiragana, katakana (incl. halfwidth), kanji, and the CJK iteration marks. */
const JAPANESE_CHAR = /[々〆ぁ-ゟァ-ヿｦ-ﾟ一-鿿]/;
/** Anything that carries meaning; punctuation and whitespace are ignored. */
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** Share of meaningful characters that are Japanese script, 0 when there are none. */
export function japaneseRatio(text: string): number {
  let total = 0;
  let japanese = 0;
  for (const ch of text) {
    if (!LETTER_OR_DIGIT.test(ch)) continue;
    total += 1;
    if (JAPANESE_CHAR.test(ch)) japanese += 1;
  }
  return total ? japanese / total : 0;
}

/** Minimum Japanese-script share before a manga read is trusted at all. */
const MIN_JAPANESE_RATIO = 0.6;

/**
 * Longest run of one repeated character before a read is considered degenerate.
 *
 * An encoder-decoder asked to read something that is not a speech bubble can
 * fall into a repetition loop: a stylised contents page produced a single run of
 * 200+ `．` characters. Legitimate output tops out around three (`．．．` for an
 * ellipsis), so this bar is far above anything real text produces.
 */
const MAX_CHAR_RUN = 10;

/** Has the recognizer fallen into a repetition loop rather than read anything? */
export function isDegenerate(text: string): boolean {
  let run = 0;
  let prev = '';
  for (const ch of text) {
    run = ch === prev ? run + 1 : 1;
    if (run >= MAX_CHAR_RUN) return true;
    prev = ch;
  }
  return false;
}

/**
 * Commit to one of the two reads.
 *
 * Only called when `shouldTryMangaOcr` already judged the PP-OCR read weak, so
 * manga-ocr is the favourite — but it has to actually produce Japanese, and it
 * must not be drastically *less* text than PP-OCR managed, which is the shape a
 * truncated or hallucinated bubble read takes.
 */
export function pickBetterRead(paddleText: string, mangaText: string): 'manga' | 'web' {
  const manga = mangaText.trim();
  if (!manga) return 'web';
  if (isDegenerate(manga)) return 'web';
  if (japaneseRatio(manga) < MIN_JAPANESE_RATIO) return 'web';
  const paddle = paddleText.trim();
  if (!paddle) return 'manga';
  // A read worth less than half of what the other engine found is a failed read.
  if (manga.length * 2 < paddle.length) return 'web';
  return 'manga';
}
