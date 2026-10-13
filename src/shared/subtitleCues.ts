// Shared subtitle/lyrics parsing (.srt / .vtt / .ass / .lrc), used by the
// Media player and the Music app.
//
// This lived at `renderer/subtitles.ts` until the EN→JA fusion job needed it: the
// fusion pipeline runs in the main process (it owns the persistent transcription
// queue and ffmpeg), and `main` may not import from `renderer` — the architecture
// audit calls that a layer violation, correctly. The module imports nothing and
// touches no DOM, so it was only ever in `renderer/` by accident of where it was
// first extracted from. `renderer/subtitles.ts` now re-exports this file, so every
// existing importer keeps its path.

export interface Cue {
  start: number;
  end: number;
  text: string;
  /**
   * ASS style name, when the cue came from an ASS/SSA file.
   *
   * Kept because it is the only reliable way to tell a spoken line from a sign,
   * a title card or a karaoke lyric: `cleanLine` strips the `{\pos(...)}`
   * override blocks that would otherwise reveal a sign, so by the time the text
   * is readable that evidence is gone. Optional and ignored by every existing
   * consumer; `subtitleFusionCore.ts` is what reads it.
   */
  style?: string;
}

/**
 * One subtitle timestamp in seconds: `h:mm:ss.fff`, `mm:ss.fff`, comma or dot
 * before the fraction, any number of hour digits. A leading `-` (a file shifted
 * past zero by a sync tool) is kept as a negative number so the caller can drop
 * or clamp the cue; it used to be read as the same time AFTER zero, which put a
 * line that belongs before the video somewhere in its first minute.
 */
export function toSeconds(stamp: string): number {
  const m = stamp.trim().replace(',', '.').match(/(-?)(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const seconds = (m[2] ? parseInt(m[2], 10) : 0) * 3600 + parseInt(m[3], 10) * 60 + parseFloat(m[4]);
  return m[1] ? -seconds : seconds;
}

/**
 * The same text whatever saved it: no byte-order mark (U+FEFF, which is also how
 * a BOM survives when two files are concatenated), and `\n` line ends whether the
 * file used CRLF or a lone CR. Every exported parser runs this, so calling one
 * directly behaves like `parseSubtitles`.
 */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

function normalizeSubtitleText(raw: string): string {
  return raw.split(BYTE_ORDER_MARK).join('').replace(/\r\n?/g, '\n');
}

/**
 * Named character references that actually turn up in subtitle files (VTT is
 * HTML-escaped by spec; YouTube, Netflix and converted SRT carry these). An
 * unknown name is left exactly as written.
 *
 * `&nbsp;` becomes a plain space and the bidi marks `&lrm;`/`&rlm;` become
 * nothing: this text is looked up, mined and compared, and an invisible
 * U+200E at the front of a Japanese line makes it a different string from the
 * same line without one.
 */
const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map(Object.entries({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  lrm: '', rlm: '', shy: '', zwnj: String.fromCharCode(0x200c), zwj: String.fromCharCode(0x200d),
  hellip: '…', mdash: '—', ndash: '–', middot: '·', bull: '•',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  copy: '©', reg: '®', trade: '™', times: '×', deg: '°', yen: '¥', euro: '€',
  AMP: '&', LT: '<', GT: '>', QUOT: '"',
}));

/** A decoded numeric reference, normalised the same way as its named twin. */
function codePointText(cp: number): string | null {
  if (!Number.isInteger(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
  if (cp === 0xa0) return ' ';
  if (cp === 0x200e || cp === 0x200f || cp === 0xad) return '';
  return String.fromCodePoint(cp);
}

/**
 * Decode HTML character references to the characters they name — as TEXT.
 *
 * One left-to-right pass, so `&amp;lt;` becomes the four characters `&lt;` and
 * never `<`, and nothing decoded is ever looked at again: not by a tag stripper,
 * not by an HTML parser (this module has no DOM and must not grow one — a
 * caption is untrusted input). Malformed or out-of-range references stay as
 * written.
 */
export function decodeSubtitleEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z]{2,8}));/g, (whole, dec, hex, name) => {
    if (dec !== undefined) return codePointText(parseInt(dec, 10)) ?? whole;
    if (hex !== undefined) return codePointText(parseInt(hex, 16)) ?? whole;
    // A Map, so `&valueOf;` or `&toString;` never reaches Object.prototype.
    return NAMED_ENTITIES.get(name as string) ?? whole;
  });
}

/** Aozora-style ruby: `｜漢字《かんじ》` or `漢字《かんじ》`. Only a kana reading counts. */
const AOZORA_RUBY_BASE = /｜([^｜《》\n]+)(《[ぁ-ゖァ-ヺー・ ]+》)/g;
const AOZORA_RUBY_READING = /《[ぁ-ゖァ-ヺー・ ]+》/g;

/**
 * Readable text of one cue: markup out, entities decoded, each line trimmed and
 * blank lines dropped.
 *
 * Order matters. Ruby READINGS go first (`<rt>`, `<rp>` and their content), or
 * stripping the tags would glue the reading onto the word it annotates —
 * `<ruby>漢字<rt>かんじ</rt></ruby>` used to read `漢字かんじ`. Then tags (VTT
 * voice/class/lang/timing tags, SRT `<i>`/`<font>`), then `{...}` override
 * blocks, then `\N`. Entities are decoded LAST so an escaped `&lt;i&gt;` stays
 * visible text instead of being stripped as a tag.
 */
export function cleanLine(s: string): string {
  const stripped = s
    .replace(/<(rt|rp)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|(?=<\/ruby\s*>)|$)/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\N/gi, '\n')
    .replace(AOZORA_RUBY_BASE, '$1')
    .replace(AOZORA_RUBY_READING, '');
  return decodeSubtitleEntities(stripped)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}
/** The standard `[Events]` column order, used when a file declares no `Format:` line. */
const ASS_DEFAULT_EVENT_FORMAT = [
  'layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text',
];

/**
 * The readable text of one ASS `Dialogue:` text field.
 *
 * Two ASS-only pieces of syntax `cleanLine` does not know: `\h` is a hard space
 * (it used to survive as a literal `\h`), and an override block with `\pN`
 * (N > 0) switches the line into vector-drawing mode until a `\p0`, so what
 * follows is path commands (`m 0 0 l 100 0 ...`), never words. Drawn text is
 * dropped here; a line that was nothing but a drawing comes out empty.
 */
function assDialogueText(raw: string): string {
  let out = '';
  let drawing = false;
  let last = 0;
  const blocks = /\{([^}]*)\}/g;
  for (let m = blocks.exec(raw); m; m = blocks.exec(raw)) {
    if (!drawing) out += raw.slice(last, m.index);
    const modes = m[1].match(/\\p\d+/g);
    if (modes) drawing = parseInt(modes[modes.length - 1].slice(2), 10) > 0;
    last = blocks.lastIndex;
  }
  if (!drawing) out += raw.slice(last);
  return cleanLine(out.replace(/\\h/g, ' '));
}

export function parseAss(raw: string): Cue[] {
  const cues: Cue[] = [];
  // Columns come from the `[Events]` section's own `Format:` line. Almost every file uses the
  // standard ten, but the format lets a file declare fewer, and a fixed "text is field 10"
  // read dropped every line of such a file without a word (2026-09-23). `Text` is always
  // last, so it takes the rest of the line, commas included.
  let columns = ASS_DEFAULT_EVENT_FORMAT;
  let inEvents = false;
  for (const line of normalizeSubtitleText(raw).split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      inEvents = /^\[events\]$/i.test(trimmed);
      continue;
    }
    if (inEvents && /^format\s*:/i.test(trimmed)) {
      const declared = trimmed.slice(trimmed.indexOf(':') + 1).split(',').map((c) => c.trim().toLowerCase());
      if (declared.includes('text') && declared.includes('start') && declared.includes('end')) {
        columns = declared;
      }
      continue;
    }
    // An indented or lower-case `dialogue:` line is still an event; `Comment:` is not.
    if (!/^dialogue\s*:/i.test(trimmed)) continue;
    const f = trimmed.slice(trimmed.indexOf(':') + 1).split(',');
    if (f.length < columns.length) continue;
    const text = assDialogueText(f.slice(columns.indexOf('text')).join(','));
    // Trimmed and dropped when blank so consumers can treat "no style" and "empty style"
    // as the same thing.
    const styleAt = columns.indexOf('style');
    const style = styleAt >= 0 ? f[styleAt]?.trim() : undefined;
    const end = toSeconds(f[columns.indexOf('end')]);
    // Wholly before zero (a script shifted past the start): nothing to show. Partly
    // before zero: shown from zero.
    if (end <= 0) continue;
    const start = Math.max(0, toSeconds(f[columns.indexOf('start')]));
    if (text) cues.push({ start, end, text, ...(style ? { style } : {}) });
  }
  return cues;
}
/** Kana — the script no Chinese line carries and almost every Japanese one does. */
const KANA = /[぀-ゟ゠-ヿ]/;

/**
 * A style is Japanese-bearing when most of its own lines carry kana.
 *
 * Majority rather than "any", and the margin is measured rather than guessed:
 * natural Japanese dialogue reaches for a particle nearly every line, so the
 * Japanese track of the release below runs at 98.9%, while its Chinese track and
 * its romaji karaoke both sit at 0.3%. Anything between those is not a case this
 * has to decide well.
 */
const JAPANESE_STYLE_SHARE = 0.5;

export interface StyleScriptSplit {
  cues: Cue[];
  /** How many cues were dropped, so a caller can report the number rather than a word. */
  dropped: number;
  /** Which styles went, in descending size — the evidence for the number. */
  styles: string[];
}

/**
 * Keep only the cues whose ASS style actually carries Japanese.
 *
 * A dual-language `.ass` is one file with two full subtitle tracks in it, and
 * nothing above this level can see that: the file passes a name check, it passes
 * `looksJapaneseSubtitle`, and it parses cleanly. Measured on the Route B release
 * this pipeline acquired on 2026-08-18 — 39 episodes of JoJo Part 5, tagged
 * `简繁外挂字幕` — the 667,437 parsed cues break down as **348,994 Chinese OP
 * karaoke with zero kana, 274,628 romaji karaoke with 826, 11,602 Chinese
 * dialogue with 38, and 11,168 Japanese dialogue with 11,049**. Mining the whole
 * file puts the Chinese half and 620k karaoke syllable-fragments into a Japanese
 * frequency table, and every count downstream reads as a success.
 *
 * The rule is the per-file `looksJapaneseSubtitle` policy at one finer grain:
 * judge a track by the script its own text uses, never by its name. `textjp` and
 * `textch` are a lucky pair; `JOJO5-op1-ch-2` and `JOJO5-op1-jp-2` are the same
 * lucky pair; a release that names its styles `Style1`/`Style2` is not, and that
 * is the case a name rule silently fails.
 *
 * Deliberately inert in three cases, because dropping everything is worse than
 * keeping too much: cues with no style at all (every `.srt`, `.vtt` and `.lrc`),
 * a file whose styles are all Japanese-bearing, and a file where none of them is
 * — the last is a file this function has no opinion about, not an empty one.
 */
export function keepJapaneseStyleCues(cues: Cue[]): StyleScriptSplit {
  const stats = new Map<string, { total: number; kana: number }>();
  for (const cue of cues) {
    if (!cue.style) continue;
    const row = stats.get(cue.style) ?? { total: 0, kana: 0 };
    row.total += 1;
    if (KANA.test(cue.text)) row.kana += 1;
    stats.set(cue.style, row);
  }
  if (!stats.size) return { cues, dropped: 0, styles: [] };

  const drop = new Set<string>();
  for (const [style, row] of stats) {
    if (row.kana / row.total < JAPANESE_STYLE_SHARE) drop.add(style);
  }
  // Every style failed, so the file is uniform in something that is not kana —
  // a Japanese track written mostly in kanji, or a release we misjudged. Either
  // way this function is the wrong place to refuse it, and `looksJapaneseSubtitle`
  // has already had its say on the file as a whole.
  if (drop.size === stats.size) return { cues, dropped: 0, styles: [] };
  if (!drop.size) return { cues, dropped: 0, styles: [] };

  const kept = cues.filter((cue) => !cue.style || !drop.has(cue.style));
  return {
    cues: kept,
    dropped: cues.length - kept.length,
    styles: [...drop].sort((a, b) => (stats.get(b)?.total ?? 0) - (stats.get(a)?.total ?? 0)),
  };
}

/** YouTube's word-timing tag inside an auto-caption cue: `<00:00:01.234>`. */
const INLINE_CUE_TIMESTAMP = /<(?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}>/;

/**
 * An SRT/VTT timing line: two real timestamps either side of `-->`, then VTT
 * cue settings (`align:start position:0%`) or SRT coordinates, ignored. A line
 * that merely contains `-->` is not one; it used to open a cue at 0:00.
 */
const TIMING_LINE = /^\s*(-?(?:\d+:)?\d+:\d+(?:[.,]\d+)?)\s*-->\s*(-?(?:\d+:)?\d+:\d+(?:[.,]\d+)?)/;

interface RawCue {
  start: number;
  end: number;
  lines: string[];
  /**
   * The cue's first line is whitespace only. In YouTube's rolling layout that
   * spacer is where the previous line WOULD be, so a cue that opens with one
   * carries nothing over, whatever its text says.
   */
  leadingBlank: boolean;
}

/**
 * Cue blocks, line by line. A cue's text runs until a truly EMPTY line; a line
 * holding only spaces is part of the cue. YouTube's auto-captions open every
 * cue with such a spacer line, and splitting on `\n\s*\n` cut those cues in
 * half, so the line being spoken was lost and only the 10 ms "carry" cues were
 * left. An SRT index line right before a timing line is not text either.
 *
 * A cue entirely before zero is dropped; one that straddles zero starts at it.
 */
function rawSrtVttCues(raw: string): RawCue[] {
  const lines = raw.split('\n');
  const cues: RawCue[] = [];
  let current: RawCue | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const timing = TIMING_LINE.exec(line);
    if (timing) {
      const start = toSeconds(timing[1]);
      const end = toSeconds(timing[2]);
      current = { start: Math.max(0, start), end, lines: [], leadingBlank: false };
      if (end > 0) cues.push(current);
      continue;
    }
    if (!current) continue;
    if (line === '') {
      current = null;
      continue;
    }
    if (!line.trim()) {
      if (!current.lines.length) current.leadingBlank = true;
      continue;
    }
    // A sloppy SRT separates cues with whitespace-only lines: its index line is not text.
    if (/^\s*\d+\s*$/.test(line) && TIMING_LINE.test(lines[i + 1] ?? '')) continue;
    current.lines.push(line);
  }
  return cues;
}

/** How close two cues must sit to be one continuous rolling display. */
const ROLLING_CONTIGUOUS_SEC = 0.05;

interface ShownCue {
  start: number;
  end: number;
  lines: string[];
  leadingBlank: boolean;
}

/**
 * How many of `cue`'s leading lines are the rolling display carrying over what
 * `previous` already showed — as opposed to lines being SAID now.
 *
 * Decided by ORDER and TIME, never by "has this text been seen": the old rule
 * skipped every leading line found anywhere in the previous cue, so the second
 * of two identical utterances (`はい` / `はい`) read as a carry and vanished.
 * A carry is the previous display's last lines repeated at the TOP of a cue that
 * starts as (or before) the previous one ends:
 *
 * - a time gap means the display was cleared, so nothing is carried;
 * - the exact same display again, back to back, is a re-emission: all carried;
 * - a cue opening with YouTube's spacer line has no carried line by layout;
 * - otherwise the longest prefix of this cue equal to a suffix of the previous.
 *
 * So `[はい]` (the 10 ms carry) followed by `[はい, はい]` carries ONE line and
 * keeps the second `はい` as a new utterance.
 */
function carriedLineCount(previous: ShownCue | null, cue: ShownCue): number {
  if (!previous || cue.start - previous.end > ROLLING_CONTIGUOUS_SEC) return 0;
  const lines = cue.lines;
  if (
    cue.leadingBlank === previous.leadingBlank
    && lines.length === previous.lines.length
    && lines.every((line, i) => line === previous.lines[i])
  ) return lines.length;
  if (cue.leadingBlank) return 0;
  for (let k = Math.min(lines.length, previous.lines.length); k > 0; k--) {
    const tail = previous.lines.slice(previous.lines.length - k);
    if (tail.every((line, i) => line === lines[i])) return k;
  }
  return 0;
}

/**
 * YouTube auto-captions "roll": each cue repeats the line before it above the
 * new one, and a 10 ms cue between them holds the old line alone. Played as
 * is, every subtitle shows two lines, mining takes both, and auto-pause stops
 * on the 10 ms cues. Each line is kept once, from the cue that introduced it;
 * a line genuinely said twice is two cues (see {@link carriedLineCount}).
 */
function collapseRollingCues(cues: readonly RawCue[]): Cue[] {
  const out: Cue[] = [];
  let previous: ShownCue | null = null;
  for (const raw of cues) {
    const cue: ShownCue = {
      start: raw.start,
      end: raw.end,
      lines: raw.lines.map((line) => cleanLine(line)).filter(Boolean),
      leadingBlank: raw.leadingBlank,
    };
    const fresh = cue.lines.slice(carriedLineCount(previous, cue));
    previous = cue;
    const last = out[out.length - 1];
    if (!fresh.length) {
      // A carry cue: the line just shown, held on. It extends that line.
      if (last && cue.lines.length && cue.start - last.end < ROLLING_CONTIGUOUS_SEC) {
        last.end = Math.max(last.end, cue.end);
      }
      continue;
    }
    out.push({ start: cue.start, end: cue.end, text: fresh.join('\n') });
  }
  // A line stays up until the next one starts, not only for its typing cue.
  for (let i = 0; i + 1 < out.length; i++) {
    if (out[i + 1].start > out[i].end && out[i + 1].start - out[i].end < ROLLING_CONTIGUOUS_SEC) {
      out[i].end = out[i + 1].start;
    }
  }
  return out;
}

/** Whether a track is in YouTube's rolling auto-caption form. */
export function isRollingCaptionTrack(raw: string): boolean {
  if (INLINE_CUE_TIMESTAMP.test(raw)) return true;
  // The same shape converted to SRT (no timing tags left): most cues open with the previous cue's last line.
  const cues = rawSrtVttCues(normalizeSubtitleText(raw));
  if (cues.length < 6) return false;
  let carried = 0;
  for (let i = 1; i < cues.length; i++) {
    const previous = cues[i - 1].lines.map((line) => cleanLine(line)).filter(Boolean);
    const first = cues[i].lines.map((line) => cleanLine(line)).find(Boolean);
    if (first && previous.length && previous[previous.length - 1] === first) carried += 1;
  }
  return carried / (cues.length - 1) >= 0.6;
}

export function parseSrtVtt(raw: string): Cue[] {
  const text = normalizeSubtitleText(raw);
  const cues = rawSrtVttCues(text);
  if (isRollingCaptionTrack(text)) return collapseRollingCues(cues);
  const out: Cue[] = [];
  for (const cue of cues) {
    const line = cleanLine(cue.lines.join('\n'));
    if (line) out.push({ start: cue.start, end: cue.end, text: line });
  }
  return out;
}

/** `[mm:ss]`, `[mm:ss.xx]`, `[mm:ss.xxx]` or `[mm:ss:xx]` — an LRC line or word time. */
const LRC_TIME = String.raw`(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?`;
/** The time tags that OPEN a line: `[00:12.00]` or several, `[00:12.00][01:40.00]`. */
const LRC_LEADING_TAGS = new RegExp(String.raw`^\s*((?:\[${LRC_TIME}\]\s*)+)`);
/** Enhanced-LRC word times, `<00:12.50>`, and the inline `[00:12.50]` some tools write instead. */
const LRC_WORD_TAG = new RegExp(String.raw`<${LRC_TIME}>|\[${LRC_TIME}\]`, 'g');
const LRC_OFFSET = /^\s*\[offset:\s*([+-]?\d+)\s*\]\s*$/i;
const LRC_LENGTH = /^\s*\[length:\s*(?:(\d+):)?(\d+)(?:[.:](\d+))?\s*\]\s*$/i;
/** How long the last line runs when nothing in the file says. */
const LRC_LAST_LINE_FALLBACK_SEC = 5;
const LRC_LAST_LINE_MIN_SEC = 2;
const LRC_LAST_LINE_MAX_SEC = 10;

function lrcSeconds(min: string, sec: string, frac: string | undefined): number {
  return parseInt(min, 10) * 60 + parseInt(sec, 10) + (frac ? parseInt(frac.padEnd(3, '0'), 10) / 1000 : 0);
}

interface LrcStamp {
  t: number;
  /** Empty for a blank stamp: the previous line ENDS here. */
  text: string;
  /** Duration to the trailing enhanced-LRC word time, when the line closes with one. */
  sung?: number;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * LRC lyric files: `[mm:ss.xx] lyric line` (a line may carry several time tags).
 *
 * A line runs until the next time tag of ANY kind. A tag with no text after it
 * is how LRC marks a line's END — the instrumental break that follows — and it
 * used to be thrown away with the other blank lines, so the line before it ran
 * on through the break: a 4 s line looped, auto-paused and was mined as 30 s.
 *
 * Also read:
 * - enhanced LRC word times (`<mm:ss.xx>` between words; inline `[mm:ss.xx]`
 *   too). They are stripped from the text, and a word time that CLOSES the line
 *   (nothing sung after it) is the line's end when it comes before the next tag;
 * - `[offset:±ms]`, which shifts every time — positive means the lyrics come
 *   EARLIER, as the format defines it — clamped at zero;
 * - `[length:mm:ss]`, which bounds the last line.
 *
 * Several lines at the SAME time (an original and its translation) each run to
 * the next LATER tag; the first one used to end where the second began, at its
 * own start, and was never on screen. The last line runs for the song's typical
 * line length (median, clamped to 2–10 s), never past `[length:]`.
 */
export function parseLrc(raw: string): Cue[] {
  const stamps: LrcStamp[] = [];
  let offsetSec = 0;
  let lengthSec: number | null = null;
  for (const line of normalizeSubtitleText(raw).split('\n')) {
    const offset = LRC_OFFSET.exec(line);
    if (offset) {
      offsetSec = parseInt(offset[1], 10) / 1000;
      continue;
    }
    const length = LRC_LENGTH.exec(line);
    if (length) {
      lengthSec = (length[1] ? parseInt(length[1], 10) * 60 : 0) + parseInt(length[2], 10)
        + (length[3] ? parseInt(length[3].padEnd(3, '0'), 10) / 1000 : 0);
      continue;
    }
    const lead = LRC_LEADING_TAGS.exec(line);
    if (!lead) continue;
    const times = [...lead[1].matchAll(new RegExp(LRC_TIME, 'g'))].map((m) => lrcSeconds(m[1], m[2], m[3]));
    const body = line.slice(lead[0].length);
    // Word times: the trailing one (nothing but space after it) closes the line.
    let closing: number | null = null;
    for (const m of body.matchAll(LRC_WORD_TAG)) {
      const after = body.slice((m.index ?? 0) + m[0].length);
      if (!after.trim()) closing = m[1] !== undefined ? lrcSeconds(m[1], m[2], m[3]) : lrcSeconds(m[4], m[5], m[6]);
    }
    const text = cleanLine(body.replace(LRC_WORD_TAG, ''));
    const first = Math.min(...times);
    const sung = text && closing !== null && closing > first ? closing - first : undefined;
    for (const t of times) stamps.push({ t, text, ...(sung !== undefined ? { sung } : {}) });
  }
  for (const stamp of stamps) stamp.t = Math.max(0, stamp.t - offsetSec);
  stamps.sort((a, b) => a.t - b.t);

  // Each line ends at the next LATER tag of any kind (text or blank), or at its
  // closing word time if that comes first. `null`: nothing in the file closes it.
  const timed: { start: number; end: number | null; text: string }[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const s = stamps[i];
    if (!s.text) continue;
    let next = i + 1;
    while (next < stamps.length && stamps[next].t <= s.t) next++;
    let end: number | null = next < stamps.length ? stamps[next].t : null;
    if (s.sung !== undefined) end = end === null ? s.t + s.sung : Math.min(end, s.t + s.sung);
    timed.push({ start: s.t, end, text: s.text });
  }
  const typical = median(timed.flatMap((cue) => (cue.end === null ? [] : [cue.end - cue.start])));
  const run = Math.min(LRC_LAST_LINE_MAX_SEC, Math.max(LRC_LAST_LINE_MIN_SEC, typical ?? LRC_LAST_LINE_FALLBACK_SEC));
  return timed.map(({ start, end, text }) => {
    if (end !== null) return { start, end, text };
    // `[length:]` is the AUDIO's length, so the lyric offset does not move it.
    const capped = lengthSec !== null && lengthSec > start ? Math.min(start + run, lengthSec) : start + run;
    return { start, end: capped, text };
  });
}

/**
 * Parse a track that is about to be *studied*, not merely displayed.
 *
 * The composition is `parseSubtitles` + `keepJapaneseStyleCues`, in one place,
 * because a second copy is how the player and the miner start disagreeing about
 * what a file contains. The harvest panel does the same two steps per file for
 * the same release; this is that pair named once for callers that hold a whole
 * file's text at once.
 *
 * Deliberately NOT the default parse. A translation track is loaded on purpose
 * and must arrive whole — `MediaContent`'s secondary-subtitle slot is exactly
 * that, and it stays on `parseSubtitles`. The split is by role: the primary
 * track is the Japanese one the study tools read, the secondary is the one the
 * user asked to see in another language.
 */
export function parseStudySubtitles(raw: string): StyleScriptSplit {
  return keepJapaneseStyleCues(parseSubtitles(raw));
}

export function parseSubtitles(raw: string): Cue[] {
  const clean = normalizeSubtitleText(raw);
  let cues: Cue[];
  if (/^\s*(?:\[Script Info\]|Dialogue:)/m.test(clean)) cues = parseAss(clean);
  else if (/^\s*\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/m.test(clean) && !clean.includes('-->')) {
    cues = parseLrc(clean);
  } else cues = parseSrtVtt(clean);
  return cues.sort((x, y) => x.start - y.start);
}
