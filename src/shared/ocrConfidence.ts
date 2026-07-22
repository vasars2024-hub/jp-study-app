/**
 * Turning a sequence decoder's logits into a usable confidence score.
 *
 * manga-ocr is an encoder-decoder that generates one token at a time, and its
 * greedy loop already computes the full distribution at every step — it just
 * discarded it and reported a flat 1.0. A constant score is worse than none:
 * the reader's confidence display looked authoritative while carrying no
 * information, and cross-engine comparison had nothing real to weigh.
 *
 * Pure functions so the maths is testable without running a model.
 */

/**
 * Probability of one token under a softmax over `row`, computed in log space.
 *
 * Log-sum-exp rather than a naive exponential sum: decoder logits routinely
 * exceed 80, and `Math.exp(80)` is already 5.5e34, so the naive form overflows
 * to Infinity and yields NaN. Subtracting the max first keeps every term ≤ 1.
 */
export function tokenProbability(
  row: Float32Array | readonly number[],
  offset: number,
  vocabSize: number,
  index: number,
): number {
  if (vocabSize <= 0 || index < 0 || index >= vocabSize) return 0;
  let max = -Infinity;
  for (let i = 0; i < vocabSize; i++) {
    const v = row[offset + i];
    if (v > max) max = v;
  }
  if (!Number.isFinite(max)) return 0;
  let sum = 0;
  for (let i = 0; i < vocabSize; i++) sum += Math.exp(row[offset + i] - max);
  if (sum <= 0) return 0;
  return Math.exp(row[offset + index] - max) / sum;
}

/**
 * Confidence for a decoded sequence, as the geometric mean of its token
 * probabilities.
 *
 * Geometric rather than arithmetic: one token the model was sure was wrong
 * should drag the whole read down, and an arithmetic mean lets forty confident
 * tokens hide it. Being the mean of log-probabilities it is also length
 * normalised, so a long line is not penalised for being long.
 */
export function sequenceConfidence(
  tokenProbabilities: readonly number[],
  opts: { truncated?: boolean } = {},
): number {
  if (!tokenProbabilities.length) return 0;
  let sumLog = 0;
  for (const p of tokenProbabilities) {
    // A zero probability would send the log to -Infinity; floor it instead so
    // one impossible token yields a very low score rather than a NaN.
    sumLog += Math.log(Math.max(p, 1e-9));
  }
  const score = Math.exp(sumLog / tokenProbabilities.length);

  // A decode that hit the token ceiling without ever emitting EOS did not
  // finish — in practice it is a repetition loop, and those are *confidently*
  // repetitive, so the geometric mean alone would rate the garbage highly. Cap
  // it so downstream comparison treats it as the failed read it is.
  if (opts.truncated) return Math.min(score, TRUNCATED_CEILING);
  return score;
}

/** Highest confidence an unterminated decode may report. */
export const TRUNCATED_CEILING = 0.35;
