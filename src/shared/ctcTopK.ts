/**
 * CTC decoding that keeps what the recogniser almost read.
 *
 * `ctcGreedyDecode` (shared/ctcDecode.ts) keeps only the most likely class at
 * every slice. The recogniser knows more than that: on stylised lettering the
 * right character is often the second or third guess (恐 under 彼, る under え).
 * This decodes exactly as the greedy decoder does — same text, same mean
 * confidence — and also returns, for every emitted character, the top-k other
 * candidates at the slice where that character peaked. The OCR router feeds
 * them to dictionary-guided decoding (`shared/ocrDictionaryDecode.ts`), and the
 * learner gets them as one-click fixes.
 *
 * Pure (no electron, no onnxruntime) so it is tested with synthetic matrices.
 */

import type { CtcDecodeResult } from './ctcDecode';
import type { OcrChar, OcrCharCandidate } from './ocrRouterTypes';

export interface CtcTopKResult extends CtcDecodeResult {
  /** One per emitted character, aligned with `[...text]`. */
  chars: OcrChar[];
}

/** Below this an alternative is noise, not a candidate. */
export const CTC_ALT_MIN_P = 0.01;

function topK(probs: Float32Array | number[], offset: number, numClasses: number, charset: string[], skip: number, k: number): OcrCharCandidate[] {
  const best: OcrCharCandidate[] = [];
  for (let c = 1; c < numClasses; c++) {
    if (c === skip) continue;
    const p = probs[offset + c];
    if (!(p >= CTC_ALT_MIN_P)) continue;
    const ch = charset[c];
    if (ch == null || ch === '' || !ch.trim()) continue;
    if (best.length < k || p > best[best.length - 1].p) {
      best.push({ ch, p });
      best.sort((a, b) => b.p - a.p);
      if (best.length > k) best.pop();
    }
  }
  return best;
}

/**
 * Greedy CTC decode of a [timeSteps x numClasses] probability matrix, plus the
 * top-k alternatives for every emitted character. Text and confidence match
 * `ctcGreedyDecode` exactly.
 */
export function ctcDecodeTopK(
  probs: Float32Array | number[],
  timeSteps: number,
  numClasses: number,
  charset: string[],
  k = 4,
): CtcTopKResult {
  if (timeSteps <= 0 || numClasses <= 0 || probs.length < timeSteps * numClasses) {
    return { text: '', confidence: 0, chars: [] };
  }
  let text = '';
  let confidenceSum = 0;
  let emitted = 0;
  let previousClass = -1;
  const chars: OcrChar[] = [];
  // The run of slices the current character spans, and where it peaked.
  let run: { cls: number; step: number; p: number } | null = null;
  const close = (): void => {
    if (!run) return;
    const ch = charset[run.cls];
    chars.push({ ch, p: run.p, alts: topK(probs, run.step * numClasses, numClasses, charset, run.cls, k) });
    run = null;
  };

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
    if (bestClass === 0) {
      close();
      previousClass = -1;
      continue;
    }
    if (bestClass === previousClass) {
      if (run && bestProb > run.p) {
        run.p = bestProb;
        run.step = t;
      }
      continue;
    }
    close();
    previousClass = bestClass;
    const ch = charset[bestClass];
    if (ch == null || ch === '') continue;
    text += ch;
    confidenceSum += bestProb;
    emitted += 1;
    run = { cls: bestClass, step: t, p: bestProb };
  }
  close();
  return { text, confidence: emitted > 0 ? confidenceSum / emitted : 0, chars };
}

/**
 * `chars` cut to match `text.trim()` (an engine's line is trimmed; its
 * characters must stay aligned with it).
 */
export function trimChars(text: string, chars: readonly OcrChar[]): { text: string; chars: OcrChar[] } {
  const all = [...text];
  if (all.length !== chars.length) return { text: text.trim(), chars: [] };
  let start = 0;
  let end = all.length;
  while (start < end && !all[start].trim()) start += 1;
  while (end > start && !all[end - 1].trim()) end -= 1;
  return { text: all.slice(start, end).join(''), chars: chars.slice(start, end) };
}
