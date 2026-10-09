/**
 * What a due grammar point asks of the learner.
 *
 * The Review tab used to show one prompt shape for every point at every stage:
 * the pattern's title, then "show" — a recognition check that a learner can pass
 * without ever being able to USE the pattern. Spaced grammar review that works
 * (Bunpro's model) asks for the pattern inside a sentence. This builds three
 * prompt shapes from the point's own authored examples, nothing generated:
 *
 *   - `recognition` — the pattern, recall its meaning (a new point, or one just
 *     failed: the learner first has to know what it means);
 *   - `cloze` — an example with the pattern blanked out and its translation as
 *     the hint; the learner supplies the pattern (typed or recalled);
 *   - `production` — the meaning and an example's translation; the learner says
 *     the sentence with the pattern, then compares with the original.
 *
 * Which one is chosen depends on the point's schedule (more demanding as the
 * interval grows) and on what its examples allow; the example is picked
 * deterministically from the point and its review count so it rotates.
 */
import type { LocalSrsState } from '../shared/localSrs';
import {
  findPatternSpans,
  patternAlternatives,
  toSimplifiedForMatch,
  type MatchLang,
} from '../shared/grammarPatternMatch';

export type GrammarPromptKind = 'recognition' | 'cloze' | 'production';

export interface GrammarExampleLike {
  jp: string;
  en: string;
}

export interface GrammarPointLike {
  id: string;
  title: string;
  lang?: string;
  meaning?: string;
  examples: readonly GrammarExampleLike[];
}

/** One run of an example sentence; `blank` runs are the pattern. */
export interface ClozeSegment {
  text: string;
  blank: boolean;
}

export interface GrammarCloze {
  sentence: string;
  translation: string;
  segments: ClozeSegment[];
  /** The blanked text, in order — what a typed answer is compared with. */
  answers: string[];
}

export interface GrammarReviewPrompt {
  kind: GrammarPromptKind;
  /** The example the prompt is built on (cloze and production). */
  cloze?: GrammarCloze;
}

const U_ROW_ENDING = /[うくぐすつぬぶむる]$/;

/**
 * Literal fragments of a Japanese pattern title worth looking for inside one of
 * its OWN examples, longest first. Looser than `grammarSurfaceCore` on purpose:
 * that rule guards arbitrary text against short kana fragments, but an authored
 * example is known to illustrate this very point, so 〜ている may match ている.
 */
export function japaneseClozeNeedles(title: string): string[] {
  const out: string[] = [];
  for (const alt of String(title || '').split(/[/／|]/)) {
    const core = alt
      .replace(/[（(][^）)]*[）)]/g, '')
      .replace(/[〜～~.．…・+＋]/g, '')
      .replace(/[A-Za-z0-9]+/g, '')
      .replace(/\s+/g, '')
      .trim();
    if (core.length < 2) continue;
    out.push(core);
    // A dictionary-form ending also matches its conjugated uses (てしまう → てしまった).
    if (U_ROW_ENDING.test(core) && core.length >= 3) out.push(core.slice(0, -1));
  }
  return [...new Set(out)].sort((a, b) => b.length - a.length);
}

function segmentsFromSpans(sentence: string, spans: ReadonlyArray<{ start: number; end: number }>): ClozeSegment[] {
  const segments: ClozeSegment[] = [];
  let at = 0;
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    if (span.start < at) continue;
    if (span.start > at) segments.push({ text: sentence.slice(at, span.start), blank: false });
    segments.push({ text: sentence.slice(span.start, span.end), blank: true });
    at = span.end;
  }
  if (at < sentence.length) segments.push({ text: sentence.slice(at), blank: false });
  return segments;
}

/** The pattern's span(s) in one example, or null when the example does not literally contain it. */
export function clozeForExample(point: GrammarPointLike, example: GrammarExampleLike): GrammarCloze | null {
  const sentence = String(example.jp ?? '').trim();
  if (!sentence) return null;
  const lang = point.lang ?? 'ja';
  let spans: Array<{ start: number; end: number }> | null = null;
  if (lang === 'zh' || lang === 'ru') {
    const matchLang: MatchLang = lang;
    // Simplified conversion is one character for one, so offsets carry over.
    const haystack = matchLang === 'zh' ? toSimplifiedForMatch(sentence) : sentence;
    for (const parts of patternAlternatives(point.title, matchLang)) {
      const found = findPatternSpans(haystack, parts, matchLang);
      if (found?.length) {
        spans = found;
        break;
      }
    }
  } else {
    for (const needle of japaneseClozeNeedles(point.title)) {
      const at = sentence.indexOf(needle);
      if (at >= 0) {
        spans = [{ start: at, end: at + needle.length }];
        break;
      }
    }
  }
  if (!spans?.length) return null;
  const segments = segmentsFromSpans(sentence, spans);
  const answers = segments.filter((s) => s.blank).map((s) => s.text);
  // A blank that swallows the whole sentence teaches nothing.
  if (!answers.length || answers.join('').length >= sentence.replace(/[。！？!?.\s]/g, '').length) return null;
  return { sentence, translation: String(example.en ?? '').trim(), segments, answers };
}

function seededIndex(seed: string, length: number): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % Math.max(1, length);
}

/** Every example of the point that can be blanked, starting at a rotating offset. */
function clozeCandidates(point: GrammarPointLike, rotation: number): GrammarCloze[] {
  const n = point.examples.length;
  if (!n) return [];
  const start = seededIndex(`${point.id}:${rotation}`, n);
  const out: GrammarCloze[] = [];
  for (let i = 0; i < n; i += 1) {
    const cloze = clozeForExample(point, point.examples[(start + i) % n]);
    if (cloze) out.push(cloze);
  }
  return out;
}

/**
 * The prompt for one review. `state` is the point's schedule before this review
 * (undefined for a point never reviewed).
 *
 *   never reviewed, or the last answer was Again  → recognition
 *   1–2 successful reviews                        → cloze (else recognition)
 *   3+                                            → production and cloze alternate
 *                                                   (production needs a translation)
 */
export function grammarReviewPrompt(point: GrammarPointLike, state?: LocalSrsState): GrammarReviewPrompt {
  const reps = state?.repetitions ?? 0;
  const failedLast = state?.lastRating === 'again';
  if (reps === 0 || failedLast) return { kind: 'recognition' };
  const candidates = clozeCandidates(point, reps);
  const cloze = candidates[0];
  if (!cloze) return { kind: 'recognition' };
  if (reps >= 3 && reps % 2 === 1) {
    const withTranslation = candidates.find((c) => c.translation);
    if (withTranslation) return { kind: 'production', cloze: withTranslation };
  }
  return { kind: 'cloze', cloze };
}

function normalizeAnswer(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s。、，,．.！!？?「」『』（）()〜～~…・]/g, '');
}

/**
 * Whether a typed cloze answer gives the blanked text: every blank, in order. The
 * comparison ignores width, case, spaces and punctuation; a frame pattern
 * (虽然…但是…) is answered with its parts in order, separated or not.
 */
export function checkClozeAnswer(input: string, answers: readonly string[]): boolean {
  const typed = normalizeAnswer(input);
  if (!typed || !answers.length) return false;
  const expected = answers.map(normalizeAnswer).filter(Boolean);
  // Separators were stripped above, so "虽然 … 但是" and "虽然但是" compare alike.
  return expected.length > 0 && typed === expected.join('');
}
