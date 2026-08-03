// Furigana alignment: turn a surface form plus its whole-word reading into
// per-run ruby segments.
//
// Why this is not a one-liner. Morphological analysers (kuromoji/IPADIC, and the
// readings stored on imported cards) give the reading of the ENTIRE token in
// katakana: 食べる → タベル. Rendering that directly produces ruby over the whole
// word — たべる written above 食べる, including the okurigana that is already kana
// on the page. The correct output annotates only the kanji: 食[た]べる.
//
// So the reading has to be split against the surface's kana anchors. Kana runs in
// the surface must appear verbatim in the reading, which bounds each kanji run's
// share of it. When that alignment fails (irregular readings, 熟字訓 like 今日 →
// きょう where no anchor exists, or a reading that simply disagrees with the
// surface), we fall back to annotating the whole token rather than emitting a
// wrong split — a slightly coarse ruby is recoverable, a misaligned one is not.
//
// Pure and dependency-free by design: it takes surface + reading as strings, so
// it is testable without loading the 20 MB kuromoji dictionary. The renderer
// supplies readings from `tokenizeSync`; nothing here imports the tokenizer.

/** One run of the surface, with a reading when that run needs ruby. */
export interface FuriganaSegment {
  /** The surface text of this run. */
  text: string;
  /** Hiragana reading, present only when `text` needs ruby (i.e. contains kanji). */
  reading?: string;
}

// The union of the three ranges this app had drifted into: the full CJK block
// (U+4E00–U+9FFF, wider than the old U+4E00–U+9FAF), extension A, the 々 repeater,
// and the 〆ヵヶ marks that behave like kanji for reading purposes. `findingModules`
// and `SubtitleCueLine` each carried their own near-copy; both now import this one.
const KANJI_RE = /[一-鿿㐀-䶿々〆ヵヶ]/;
const KANJI_RUN_RE = /[一-鿿㐀-䶿々〆ヵヶ]/u;

/** True when the text contains at least one kanji (or the 々 repeater). */
export function hasKanji(text: string): boolean {
  return KANJI_RE.test(text);
}

/** Katakana → hiragana, leaving the long-vowel mark and everything else alone. */
export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/**
 * Split a surface into alternating kanji / kana runs, preserving order.
 * Non-Japanese characters (latin, digits, punctuation) group with kana runs —
 * they are anchors just the same, since they appear verbatim in no reading.
 */
function splitRuns(surface: string): { kanji: boolean; text: string }[] {
  const runs: { kanji: boolean; text: string }[] = [];
  for (const ch of surface) {
    const kanji = KANJI_RUN_RE.test(ch);
    const last = runs[runs.length - 1];
    if (last && last.kanji === kanji) last.text += ch;
    else runs.push({ kanji, text: ch });
  }
  return runs;
}

/**
 * Align `reading` onto `surface`, returning one segment per run.
 *
 * Returns a single un-annotated segment when no ruby is warranted (no kanji, no
 * reading, or the reading merely restates the surface), and a single annotated
 * segment when the surface is all kanji or alignment fails.
 */
export function alignFurigana(surface: string, reading?: string): FuriganaSegment[] {
  const plain: FuriganaSegment[] = [{ text: surface }];
  if (!surface || !reading) return plain;
  if (!hasKanji(surface)) return plain;

  const read = toHiragana(reading);
  // A reading identical to the surface (kana-only words) carries no information.
  if (read === toHiragana(surface)) return plain;

  const runs = splitRuns(surface);
  const whole: FuriganaSegment[] = [{ text: surface, reading: read }];

  const out: FuriganaSegment[] = [];
  let pos = 0;
  for (let i = 0; i < runs.length; i += 1) {
    const run = runs[i];
    if (!run.kanji) {
      // A kana run must sit exactly here in the reading; if it does not, the
      // reading disagrees with the surface and any split would be a guess.
      const kana = toHiragana(run.text);
      if (read.slice(pos, pos + kana.length) !== kana) return whole;
      out.push({ text: run.text });
      pos += kana.length;
      continue;
    }
    const next = runs[i + 1];
    if (!next) {
      // Trailing kanji run takes the rest of the reading.
      const rest = read.slice(pos);
      if (!rest) return whole;
      out.push({ text: run.text, reading: rest });
      pos = read.length;
      continue;
    }
    // Bound this kanji run by the next kana anchor. Search from pos + 1 so the
    // kanji always claims at least one mora — a kanji with an empty reading is
    // never right.
    const anchor = toHiragana(next.text);
    const j = read.indexOf(anchor, pos + 1);
    if (j < 0) return whole;
    out.push({ text: run.text, reading: read.slice(pos, j) });
    pos = j;
  }

  // Every mora must be consumed; leftovers mean the alignment drifted.
  if (pos !== read.length) return whole;
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Ruby HTML for one aligned run set. `<rp>` fallbacks are included so the markup
 * degrades to 漢字(かんじ) when pasted somewhere without ruby support.
 */
export function segmentsToRuby(segments: FuriganaSegment[]): string {
  return segments
    .map((s) =>
      s.reading
        ? `<ruby>${escapeHtml(s.text)}<rp>(</rp><rt>${escapeHtml(s.reading)}</rt><rp>)</rp></ruby>`
        : escapeHtml(s.text),
    )
    .join('');
}

/**
 * Anki-style bracket furigana: ` 漢字[かんじ]`. The leading space before an
 * annotated run is what Anki's furigana filter uses to find the boundary, and
 * `apkgParse.ts` already strips exactly this shape on import.
 */
export function segmentsToBrackets(segments: FuriganaSegment[]): string {
  return segments
    .map((s, i) => {
      if (!s.reading) return s.text;
      // No leading space needed at the very start of the string.
      return `${i === 0 ? '' : ' '}${s.text}[${s.reading}]`;
    })
    .join('');
}

/** Reading-only form: the whole surface rewritten in kana. */
export function segmentsToKana(segments: FuriganaSegment[]): string {
  return segments.map((s) => s.reading ?? toHiragana(s.text)).join('');
}
