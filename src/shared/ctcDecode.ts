/**
 * CTC greedy decoding for PP-OCR recognition heads.
 *
 * The recogniser emits, for every horizontal slice of a text crop, a
 * distribution over the character set. Decoding collapses that per-slice
 * sequence into a string: a wide glyph lights up several consecutive slices
 * with the same class (collapse repeats), and slices between glyphs emit a
 * dedicated "blank" class (drop it).
 *
 * The mean confidence returned alongside the text is load-bearing, not
 * decoration: it is how the engine decides which language's recogniser was the
 * right one for an image, so it must reflect only the slices that actually
 * produced characters.
 *
 * Pure (no electron, no onnxruntime, no fs) so it can be unit-tested directly.
 */

export interface CtcDecodeResult {
  text: string;
  /** Mean probability across the slices that emitted a character; 0 for empty output. */
  confidence: number;
}

/**
 * PP-OCR reserves class 0 for the CTC blank and appends a space, so a charset
 * built from a keys file is `['<blank>', ...keys, ' ']`. Index i in the model's
 * output therefore maps to `charset[i]`.
 */
export function buildCharset(keys: string[], options: { appendSpace?: boolean } = {}): string[] {
  const appendSpace = options.appendSpace ?? true;
  const charset = ['', ...keys];
  if (appendSpace) charset.push(' ');
  return charset;
}

/** Parse a PP-OCR keys file: one character per line, blank lines preserved as-is. */
export function parseKeysFile(contents: string): string[] {
  // A trailing newline is conventional and must not become an extra class;
  // interior empty lines are meaningful (some dicts encode a space that way)
  // and are kept.
  const lines = contents.split(/\r?\n/);
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Greedy-decode a [timeSteps x numClasses] probability matrix in row-major
 * order — the layout onnxruntime hands back for a single-image batch.
 */
export function ctcGreedyDecode(
  probs: Float32Array | number[],
  timeSteps: number,
  numClasses: number,
  charset: string[],
): CtcDecodeResult {
  if (timeSteps <= 0 || numClasses <= 0 || probs.length < timeSteps * numClasses) {
    return { text: '', confidence: 0 };
  }

  let text = '';
  let confidenceSum = 0;
  let emitted = 0;
  let previousClass = -1;

  for (let t = 0; t < timeSteps; t++) {
    const offset = t * numClasses;
    let bestClass = 0;
    let bestProb = probs[offset];
    for (let c = 1; c < numClasses; c++) {
      const p = probs[offset + c];
      if (p > bestProb) {
        bestProb = p;
        bestClass = c;
      }
    }

    // Class 0 is the blank. It both separates glyphs and resets the repeat
    // filter, so two identical characters in a row survive only because a
    // blank sits between them.
    if (bestClass === 0) {
      previousClass = -1;
      continue;
    }
    if (bestClass === previousClass) continue;
    previousClass = bestClass;

    const ch = charset[bestClass];
    if (ch == null || ch === '') continue;
    text += ch;
    confidenceSum += bestProb;
    emitted += 1;
  }

  return {
    text,
    confidence: emitted > 0 ? confidenceSum / emitted : 0,
  };
}

/**
 * Score a candidate language's decode of the same image.
 *
 * Raw mean confidence alone picks badly: a recogniser fed the wrong script
 * often returns one or two characters it is very sure about, which outscores
 * the correct recogniser reading a whole line at moderate confidence. Weighting
 * by how much text was produced (with saturating returns) prefers the model
 * that explained the image rather than the one that cherry-picked a glyph.
 */
export function scoreRecognition(result: CtcDecodeResult): number {
  const length = result.text.trim().length;
  if (length === 0) return 0;
  const lengthWeight = Math.min(1, length / 4);
  return result.confidence * lengthWeight;
}
