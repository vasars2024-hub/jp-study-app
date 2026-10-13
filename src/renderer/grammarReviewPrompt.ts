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
import { deinflect } from '../shared/deinflect';
import { alignFurigana, toHiragana } from '../shared/furigana';
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
  /** The whole sentence in kana, when the example has one. */
  reading?: string;
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
  /**
   * Japanese only: each blank written in kana, from the example's reading, so
   * 始め can be answered はじめ. Null for a blank whose reading the example
   * cannot give (no reading, or one that does not align with the sentence).
   */
  readings?: Array<string | null>;
  /** The point's title, whose dictionary form is also an answer (〜てしまう for a blank てしま). */
  title?: string;
  lang?: string;
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
    // A pattern with a slot INSIDE it (〜は〜です, 〜ば〜ほど) never occurs as one run of
    // text, so the joined core above matches none of its own examples and the point was
    // stuck on recognition prompts forever (found by the e2e harness: n5-desu at three
    // successful reviews still asked "recall the meaning"). Its literal pieces of two or
    // more characters are fallbacks, after the whole, longest first.
    const pieces = alt
      .replace(/[（(][^）)]*[）)]/g, '')
      .replace(/[A-Za-z0-9]+/g, '')
      .split(/[〜～~…]/)
      .map((piece) => piece.replace(/[.．・+＋\s]/g, '').trim())
      .filter(Boolean);
    if (pieces.length >= 2) {
      for (const piece of pieces) if (piece.length >= 2 && piece !== core) out.push(piece);
    }
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
  const cloze: GrammarCloze = { sentence, translation: String(example.en ?? '').trim(), segments, answers, title: point.title, lang };
  if (lang === 'ja') cloze.readings = blankReadings(segments, example.reading);
  return cloze;
}

/**
 * Each blank of a Japanese cloze in kana, read off the example's whole-sentence
 * reading. The sentence is aligned against the reading on its kana anchors
 * (`alignFurigana`); a blank that starts or ends inside a kanji run, or a
 * reading that does not align, gives null rather than a guess.
 */
export function blankReadings(segments: readonly ClozeSegment[], reading: string | undefined): Array<string | null> {
  const blanks = segments.filter((s) => s.blank);
  const none = blanks.map(() => null);
  if (!reading) return none;
  // Readings are spaced between words and sentences are not (or not the same way).
  // `\s` covers the ideographic space too.
  const strip = (text: string) => text.replace(/\s+/g, '');
  const runs = segments.map((s) => ({ text: strip(s.text), blank: s.blank }));
  const surface = runs.map((r) => r.text).join('');
  const aligned = alignFurigana(surface, strip(reading));
  if (aligned.length === 1 && aligned[0].reading !== undefined && aligned[0].text === surface) {
    // Alignment failed (or one all-kanji run): only a blank that is the whole sentence could use it.
    return none;
  }
  // Per surface character: its kana, or a boundary marker inside a kanji run.
  const kanaAt: Array<{ kana: string; runStart: boolean; runEnd: boolean }> = [];
  for (const seg of aligned) {
    const chars = [...seg.text];
    if (seg.reading === undefined) {
      for (const ch of chars) kanaAt.push({ kana: toHiragana(ch), runStart: true, runEnd: true });
    } else {
      chars.forEach((_, i) => kanaAt.push({ kana: i === 0 ? seg.reading ?? '' : '', runStart: i === 0, runEnd: i === chars.length - 1 }));
    }
  }
  const out: Array<string | null> = [];
  let at = 0;
  for (const run of runs) {
    const length = [...run.text].length;
    if (run.blank) {
      const slice = kanaAt.slice(at, at + length);
      const clean = slice.length === length && slice.length > 0 && slice[0].runStart && slice[slice.length - 1].runEnd;
      out.push(clean ? slice.map((c) => c.kana).join('') : null);
    }
    at += length;
  }
  return out;
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

/** Width, case, spacing and punctuation folded away, and katakana read as hiragana. */
function foldAnswer(text: string): string {
  return toHiragana(normalizeAnswer(text));
}

/** What else a typed answer may be checked against besides the blanked text. */
export interface ClozeCheckOptions {
  /** Each blank in kana (`GrammarCloze.readings`). */
  readings?: ReadonlyArray<string | null>;
  /** The point's title: its dictionary form, and that form conjugated, also answer the blank. */
  title?: string;
  /** The point's language; the Japanese-only rules are skipped for any other. */
  lang?: string;
}

/** Every spelling of each blank: as written, and in kana when the reading is known. */
function blankSpellings(answers: readonly string[], readings: ReadonlyArray<string | null> | undefined): string[][] {
  return answers
    .map((answer, i) => {
      const forms = new Set<string>();
      const written = foldAnswer(answer);
      if (written) forms.add(written);
      const reading = readings?.[i];
      if (reading) forms.add(foldAnswer(reading));
      return [...forms];
    })
    .filter((forms) => forms.length > 0);
}

/** Joined spellings of several blanks, in order (a handful at most). */
function joinedSpellings(perBlank: string[][]): Set<string> {
  let out = [''];
  for (const forms of perBlank) {
    out = out.flatMap((head) => forms.map((form) => head + form));
    if (out.length > 64) out = out.slice(0, 64);
  }
  return new Set(out);
}

/**
 * The title's forms that a single blank stands for: the alternative the blank
 * was cut from (〜てしまう for a blank てしま, 〜始める for 始め), written as in
 * the title and, when the blank's reading is known, in kana (はじめる).
 */
function titleForms(title: string, blank: string, blankKana: string | null): Set<string> {
  const out = new Set<string>();
  for (const needle of japaneseClozeNeedles(title)) {
    const form = foldAnswer(needle);
    const isBlank = form === blank;
    // The blank is the stem of a dictionary-form ending: てしま of てしまう.
    const isStemOf = form.length === blank.length + 1 && form.startsWith(blank) && U_ROW_ENDING.test(form);
    if (!isBlank && !isStemOf) continue;
    out.add(form);
    if (blankKana) out.add(blankKana + form.slice(blank.length));
  }
  return out;
}

/**
 * Whether a typed cloze answer gives the blanked text: every blank, in order. The
 * comparison ignores width, case, spaces and punctuation; a frame pattern
 * (虽然…但是…) is answered with its parts in order, separated or not.
 *
 * Japanese also accepts (`options`):
 *   - katakana for hiragana and back (both are folded to hiragana);
 *   - kana for a kanji blank, from the example's reading (はじめ for 始め);
 *   - the title's form the blank stands for (てしまう for a blank てしま);
 *   - that form conjugated when it is a dictionary form (てしまった, ていた),
 *     through the app's de-inflector.
 * Anything else is still wrong: では for には, しまった without its て.
 */
export function checkClozeAnswer(input: string, answers: readonly string[], options: ClozeCheckOptions = {}): boolean {
  const typed = foldAnswer(input);
  if (!typed || !answers.length) return false;
  const perBlank = blankSpellings(answers, options.readings);
  if (!perBlank.length) return false;
  // Separators were stripped above, so "虽然 … 但是" and "虽然但是" compare alike.
  if (joinedSpellings(perBlank).has(typed)) return true;
  if ((options.lang ?? 'ja') !== 'ja' || !options.title || perBlank.length !== 1) return false;

  const written = foldAnswer(answers[0]);
  const kana = options.readings?.[0] ? foldAnswer(options.readings[0]) : null;
  const forms = new Set([...titleForms(options.title, written, kana), ...(kana ? titleForms(options.title, kana, null) : [])]);
  if (forms.has(typed)) return true;
  // A conjugated use of a dictionary form: peel the inflection off and compare.
  const dictionary = [...forms].filter((form) => U_ROW_ENDING.test(form));
  if (!dictionary.length) return false;
  return deinflect(typed).some((candidate) => candidate.reasons.length > 0 && dictionary.includes(foldAnswer(candidate.term)));
}

/** `checkClozeAnswer` with everything the cloze itself knows (readings, title, language). */
export function checkCloze(input: string, cloze: GrammarCloze): boolean {
  return checkClozeAnswer(input, cloze.answers, { readings: cloze.readings, title: cloze.title, lang: cloze.lang });
}
