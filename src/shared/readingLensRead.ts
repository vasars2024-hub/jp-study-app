/**
 * The Read depth of a Reading Lens capture: pure model, no renderer.
 *
 * Glance renders the OCR lines where they sit on screen and Inspect explains one
 * sentence. Read is the third: the capture stops being a picture of text and
 * becomes a passage you read top to bottom. That needs two things the capture
 * itself does not carry.
 *
 * 1. **Paragraphs.** `joinReadingLensLines` welds every line into one string,
 *    which is right for a handoff and wrong for reading — a page of OCR is a
 *    ragged line per printed row, and a reader wants sentences flowed back into
 *    the blocks they were printed in. The break rule below uses what OCR
 *    actually gives us: sentence-final punctuation, the geometric gap between
 *    two lines, and a change of writing direction.
 * 2. **A vocabulary harvest.** The distinct words the passage used, grouped the
 *    way `lexiconHarvest.ts` groups them — first-seen order preserved, an
 *    unrecognised word kept and marked rather than dropped, and a row cap so a
 *    study list never becomes a table.
 *
 * Both are pure so the overlay, its tests and any later consumer read one
 * definition of "the passage" instead of three that drift.
 */

/**
 * The tokenizer's shape, structurally. The renderer's `JpToken` satisfies this;
 * declaring it here rather than importing keeps `shared/` free of a renderer
 * dependency, the same way `readingLensLineOrder.ts` takes a positioned line.
 */
export interface ReadingLensReadToken {
  surface: string;
  lemma: string;
  /** True for vocabulary worth tracking (nouns/verbs/adjectives/adverbs). */
  content: boolean;
  proper: boolean;
  pos: string;
  /** Katakana reading when the analyser had one. */
  reading?: string;
}

export interface ReadingLensReadSourceLine {
  text: string;
  /** [x, y, width, height] in capture-local units; drives the gap rule. */
  box: readonly [number, number, number, number];
  vertical: boolean;
  confidence: number;
  tokens: readonly ReadingLensReadToken[];
}

export interface ReadingLensReadParagraph {
  index: number;
  text: string;
  /** Offsets into `ReadingLensReadPassage.text`. */
  start: number;
  end: number;
  /** Source line indices folded in, in reading order. */
  lineIndices: number[];
  /** The paragraph is only as trustworthy as its worst line. */
  confidence: number;
  vertical: boolean;
}

export interface ReadingLensReadPassage {
  /** Paragraph texts joined by a single newline — what the Read view renders. */
  text: string;
  paragraphs: ReadingLensReadParagraph[];
  /** Lines that survived cleaning. */
  lineCount: number;
  /** Lines dropped because they carried no text after cleaning. */
  droppedLines: number;
}

export interface ReadingLensVocabularyRow {
  /** Stable grouping identity — lemma+reading when analysed, folded surface otherwise. */
  key: string;
  /** The dictionary form when the analyser gave one, else the surface. */
  text: string;
  /**
   * Every reading the passage gave this word, first-seen order.
   *
   * A list rather than one string because the analyser reports the reading of
   * the *surface*, not of the headword: 食べ is タベ and 食べる is タベル, one
   * verb with two. It is also where a genuine homograph shows itself — 生 read
   * ナマ and セイ lands one row carrying both readings rather than silently
   * collapsing to whichever came first.
   */
  readings: string[];
  /** Surface forms as the passage wrote them, first-seen order. */
  surfaces: string[];
  count: number;
  /** Offset of the first occurrence in the passage, so a frequency tie keeps reading order. */
  firstStart: number;
  pos: string;
  /** Marked, never dropped: a name is vocabulary, and hiding it is a silent loss. */
  proper: boolean;
}

export interface ReadingLensVocabularyHarvest {
  items: ReadingLensVocabularyRow[];
  /** Word-like occurrences counted before grouping. */
  occurrences: number;
  /** Distinct words found, before the row cap. */
  uniqueCount: number;
  capped: boolean;
}

/**
 * Past this many rows a harvest stops being something a learner reads. A lens
 * capture is a screen's worth of text, so this sits below the Workbench's 200.
 */
export const MAX_LENS_HARVEST_ITEMS = 120;

export const MAX_LENS_HARVEST_SURFACES = 6;

/** Japanese sentence enders, plus the closing marks that follow them. */
const SENTENCE_END = /[。．！？!?]["'」』）\)】〉》]*$/u;

/**
 * A bare number or a stray symbol is a token but not vocabulary. One letter,
 * the same deterministic rule `lexiconHarvest.ts` uses — anything finer would
 * need a per-language stopword table this layer has no grounded source for.
 */
function isVocabularyToken(text: string): boolean {
  return /\p{L}/u.test(text);
}

/**
 * Internal whitespace is deliberately left alone: the tokenizer was handed this
 * exact string, so its surfaces concatenate back to it, and collapsing runs here
 * would shift every offset the Read view and the harvest agree on.
 */
function cleanLineText(value: string): string {
  return typeof value === 'string' ? value.replace(/\r\n?/g, ' ').trim() : '';
}

function isCjk(value: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff\u3005\u30fc]/u.test(value);
}

/**
 * What goes between two lines welded into one paragraph: a space keeps two
 * Latin words apart, and nothing at all keeps CJK text from growing gaps that
 * were never printed.
 */
function weldSeparator(acc: string, next: string): string {
  if (!acc) return '';
  const tail = acc.slice(-1);
  const head = next[0] ?? '';
  const needsSpace = /[\p{Letter}\p{Number}]/u.test(tail) && /[\p{Letter}\p{Number}]/u.test(head);
  return needsSpace && !isCjk(tail) && !isCjk(head) ? ' ' : '';
}

function weld(acc: string, next: string): string {
  return acc ? acc + weldSeparator(acc, next) + next : next;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Does line `b` start a new printed block after line `a`?
 *
 * The geometric half reads the axis the text does *not* flow along: horizontal
 * lines stack downward, vertical Japanese columns advance right to left. A gap
 * wider than most of a line's own thickness is a paragraph break in either.
 */
function breaksParagraph(
  a: ReadingLensReadSourceLine,
  b: ReadingLensReadSourceLine,
  aText: string,
  thickness: number,
): boolean {
  if (a.vertical !== b.vertical) return true;
  if (SENTENCE_END.test(aText)) return true;
  if (thickness <= 0) return false;
  const gap = a.vertical
    ? a.box[0] - (b.box[0] + b.box[2])
    : b.box[1] - (a.box[1] + a.box[3]);
  return gap > thickness * 0.8;
}

/**
 * Flow OCR lines back into the paragraphs they were printed in.
 *
 * Lines arrive in reading order — `orderReadingLensLines` has already run by the
 * time a capture exists — so this only decides where one block ends and the next
 * begins. Empty lines are dropped and counted rather than silently swallowed.
 */
export function buildReadingLensPassage(
  lines: readonly ReadingLensReadSourceLine[],
): ReadingLensReadPassage {
  const kept: { line: ReadingLensReadSourceLine; text: string; index: number }[] = [];
  let droppedLines = 0;

  lines.forEach((line, index) => {
    const text = cleanLineText(line?.text ?? '');
    if (!text) {
      droppedLines += 1;
      return;
    }
    kept.push({ line, text, index });
  });

  const thickness = median(
    kept.map(({ line }) => (line.vertical ? line.box[2] : line.box[3])).filter((n) => n > 0),
  );

  const paragraphs: ReadingLensReadParagraph[] = [];
  let current: ReadingLensReadParagraph | null = null;
  let cursor = 0;

  for (let i = 0; i < kept.length; i += 1) {
    const { line, text, index } = kept[i];
    const previous = i > 0 ? kept[i - 1] : null;

    if (current && previous && !breaksParagraph(previous.line, line, previous.text, thickness)) {
      current.text = weld(current.text, text);
      current.end = current.start + current.text.length;
      current.lineIndices.push(index);
      current.confidence = Math.min(current.confidence, line.confidence);
      continue;
    }

    if (current) cursor = current.end + 1; // the joining newline
    current = {
      index: paragraphs.length,
      text,
      start: cursor,
      end: cursor + text.length,
      lineIndices: [index],
      confidence: line.confidence,
      vertical: line.vertical,
    };
    paragraphs.push(current);
  }

  return {
    text: paragraphs.map((p) => p.text).join('\n'),
    paragraphs,
    lineCount: kept.length,
    droppedLines,
  };
}

/**
 * The grouping identity of a harvested token.
 *
 * Deliberately the dictionary form ALONE, which is where this parts company
 * with `lexiconHarvest.ts`. That module groups on headword+reading because its
 * reading is the *headword's*, looked up in a dictionary. Here the reading
 * comes off the analysed surface, so folding it into the key would file 食べ,
 * 食べる and 食べれば as three different words — every inflected verb in the
 * passage split across rows. The readings are kept on the row instead.
 */
function rowKey(token: ReadingLensReadToken): string {
  const lemma = token.lemma && token.lemma !== '*' ? token.lemma : '';
  return lemma ? `l\u0000${lemma}` : `s\u0000${token.surface.toLocaleLowerCase()}`;
}

/** One rendered span of a paragraph: a tokenizer word, or the glue between two. */
export interface ReadingLensReadRun {
  surface: string;
  /** Offset into `ReadingLensReadPassage.text`. */
  start: number;
  /** Null for a weld separator, or for a line whose tokens do not reconstruct it. */
  token: ReadingLensReadToken | null;
  /** Index into the source `lines` array, so a run can name where it came from. */
  lineIndex: number;
}

/**
 * The paragraph as a flat run of spans carrying real passage offsets.
 *
 * The Read view and the vocabulary harvest both need "where is this word in the
 * passage", and two implementations of that would drift the first time the weld
 * rule changed. This is the one implementation.
 *
 * A line whose token surfaces do not concatenate back to its text is emitted as
 * a single untokenized run rather than a stream of offsets that would all be
 * wrong: the words stop being clickable, which is visible, instead of every
 * offset after it sliding, which is not.
 */
export function readingLensParagraphRuns(
  paragraph: ReadingLensReadParagraph,
  lines: readonly ReadingLensReadSourceLine[],
): ReadingLensReadRun[] {
  const runs: ReadingLensReadRun[] = [];
  let offset = paragraph.start;
  let accumulated = '';

  for (const lineIndex of paragraph.lineIndices) {
    const text = cleanLineText(lines[lineIndex]?.text ?? '');
    const separator = weldSeparator(accumulated, text);
    if (separator) {
      runs.push({ surface: separator, start: offset, token: null, lineIndex });
      offset += separator.length;
      accumulated += separator;
    }

    const tokens = lines[lineIndex]?.tokens ?? [];
    if (tokens.map((token) => token?.surface ?? '').join('') === text) {
      for (const token of tokens) {
        runs.push({ surface: token.surface, start: offset, token, lineIndex });
        offset += token.surface.length;
      }
    } else {
      runs.push({ surface: text, start: offset, token: null, lineIndex });
      offset += text.length;
    }
    accumulated += text;
  }

  return runs;
}

/**
 * Collapse the passage into the distinct words it actually used.
 *
 * Only `content` tokens are harvested: a particle is not a study row, and the
 * analyser already made that call. A proper noun IS harvested and flagged,
 * because a passage that leans on a name is telling the reader something and
 * dropping it would be a silent edit.
 */
export function harvestReadingLensVocabulary(
  passage: ReadingLensReadPassage,
  lines: readonly ReadingLensReadSourceLine[],
  max: number = MAX_LENS_HARVEST_ITEMS,
): ReadingLensVocabularyHarvest {
  const limit = Math.max(1, Math.floor(max));
  const byKey = new Map<string, ReadingLensVocabularyRow>();
  let occurrences = 0;

  for (const paragraph of passage.paragraphs) {
    for (const run of readingLensParagraphRuns(paragraph, lines)) {
      const { token, surface } = run;
      if (!token?.content || !isVocabularyToken(surface)) continue;
      occurrences += 1;

      const reading = token.reading ?? '';
      const key = rowKey(token);
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
        if (!existing.surfaces.includes(surface) && existing.surfaces.length < MAX_LENS_HARVEST_SURFACES) {
          existing.surfaces.push(surface);
        }
        if (reading && !existing.readings.includes(reading) && existing.readings.length < MAX_LENS_HARVEST_SURFACES) {
          existing.readings.push(reading);
        }
        continue;
      }
      byKey.set(key, {
        key,
        text: token.lemma && token.lemma !== '*' ? token.lemma : surface,
        readings: reading ? [reading] : [],
        surfaces: [surface],
        count: 1,
        firstStart: run.start,
        pos: token.pos ?? '',
        proper: token.proper === true,
      });
    }
  }

  const all = [...byKey.values()].sort(
    (a, b) => b.count - a.count || a.firstStart - b.firstStart || a.text.localeCompare(b.text),
  );

  return {
    items: all.slice(0, limit),
    occurrences,
    uniqueCount: all.length,
    capped: all.length > limit,
  };
}
