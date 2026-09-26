/**
 * Windows Live Captions capture — pure merge and segmentation logic.
 *
 * Live Captions (`LiveCaptions.exe`) exposes its text through UI Automation as
 * a single `CaptionsTextBlock` element, but what that element holds is a
 * **rolling window, not a transcript**. Measured on Windows 11 26200 while a
 * Chinese conversation was playing:
 *
 *   - the window is hard-capped at **12 lines / ~400 characters**;
 *   - the **last line is provisional** and is revised in place as the
 *     recognizer refines it — `嗯` → `嗯哦，在` → `嗯哦，在俄罗斯呃点外卖方便吗`
 *     → `…吗？`. Revisions are *mostly* appends, but punctuation gets inserted
 *     mid-string, so a plain `startsWith` test on the whole line is not enough
 *     to recognise a revision;
 *   - lines are **evicted from the front** roughly every 9 seconds of
 *     continuous speech.
 *
 * The eviction rate is the constraint that shapes everything else: text that is
 * not read within a few seconds is gone for good, so capture has to be a
 * persistent background poller (see `main/liveCaptions.ts`) rather than an
 * on-demand scrape, and the merge below has to tolerate a line changing under
 * it between two polls.
 *
 * This module is deliberately free of Electron and Node so the merge can be
 * unit-tested directly — that is where the correctness of the whole feature
 * sits.
 */

/** One captured line, stamped with when we *first* saw it. */
export interface CaptionLine {
  text: string;
  /** First-observed wall clock ms. Preserved across revisions of the line. */
  ts: number;
}

/** A contiguous run of captured lines — one "script" in the notebook. */
export interface CaptionScript {
  id: string;
  startedAt: number;
  endedAt: number;
  lines: CaptionLine[];
}

/** Default idle gap that ends a script and starts the next one. */
export const DEFAULT_SCRIPT_GAP_MS = 30 * 60 * 1000;

/** Guard against a pathological session eating unbounded memory. */
export const MAX_LINES_PER_SCRIPT = 20000;

function clean(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
  }
  return out;
}

/**
 * Does `next` look like a further revision of the same line as `prev`?
 *
 * Live Captions refines a provisional line by appending *and* by inserting
 * punctuation into text it already emitted, so `next.startsWith(prev)` misses
 * the `方便吗` → `方便吗？` case. Comparing with punctuation and spacing
 * stripped catches both, and is still specific enough not to collapse two
 * genuinely different sentences.
 */
function isRevisionOf(prev: string, next: string): boolean {
  const strip = (s: string) => s.replace(/[\s，。、？！,.?!；;：:…—-]/g, '');
  const a = strip(prev);
  const b = strip(next);
  if (!a) return true;
  return b.startsWith(a);
}

/**
 * Merge one rolling-window snapshot into the lines captured so far.
 *
 * The snapshot is authoritative for every line it contains — Live Captions only
 * ever refines text, so where the snapshot overlaps what we already hold we take
 * the snapshot's wording and keep our original timestamp.
 *
 * Alignment uses the **largest** overlap between the tail of `prev` and the head
 * of `snapshot`, which is what keeps a revised provisional line from being
 * appended a second time. Repetitive speech could in principle align at a false
 * larger offset; ASR lines are long enough that this has not been observed, and
 * preferring the largest overlap fails toward dropping a duplicate rather than
 * toward duplicating real text.
 *
 * `k === 0` with a non-empty `prev` means we lost sync — the poller stalled long
 * enough for the whole window to turn over, so text was already lost at the
 * source. We append everything and let the caller report the gap.
 *
 * Lines first seen in the same poll are stamped a millisecond apart, in order:
 * the timestamp is a line's identity downstream (the captions bar keys its
 * lines by it), and two lines with one stamp became one — the bar showed only
 * the last line of a poll that brought several (e.g. the text already on
 * screen when the bar opens).
 */
export function mergeCaptionSnapshot(
  prev: readonly CaptionLine[],
  snapshot: readonly string[],
  now: number,
): { lines: CaptionLine[]; appended: number; desynced: boolean } {
  const incoming = clean(snapshot);
  if (incoming.length === 0) {
    return { lines: [...prev], appended: 0, desynced: false };
  }
  if (prev.length === 0) {
    return {
      lines: incoming.map((text, i) => ({ text, ts: now + i })),
      appended: incoming.length,
      desynced: false,
    };
  }

  const max = Math.min(prev.length, incoming.length);
  let k = 0;
  for (let cand = max; cand >= 1; cand--) {
    let ok = true;
    for (let i = 0; i < cand; i++) {
      const p = prev[prev.length - cand + i]!.text;
      const n = incoming[i]!;
      // Only the final line we hold may still have been mid-revision; every
      // earlier line had already scrolled up and frozen.
      const isTail = prev.length - cand + i === prev.length - 1;
      if (p === n) continue;
      if (isTail && isRevisionOf(p, n)) continue;
      ok = false;
      break;
    }
    if (ok) {
      k = cand;
      break;
    }
  }

  const kept = prev.slice(0, prev.length - k);
  const overlapped: CaptionLine[] = [];
  for (let i = 0; i < k; i++) {
    overlapped.push({ text: incoming[i]!, ts: prev[prev.length - k + i]!.ts });
  }
  const fresh = incoming.slice(k).map((text, i) => ({ text, ts: now + i }));
  const lines = [...kept, ...overlapped, ...fresh];

  return {
    lines: lines.length > MAX_LINES_PER_SCRIPT ? lines.slice(-MAX_LINES_PER_SCRIPT) : lines,
    appended: fresh.length,
    desynced: k === 0,
  };
}

/** Local calendar day key — scripts never span midnight. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Should a line observed at `ts` start a new script rather than extend `script`?
 *
 * Two triggers, both required by "automatic full scripts separated by time":
 * a calendar-day rollover, and an idle gap longer than `gapMs`.
 */
export function startsNewScript(
  script: CaptionScript | undefined,
  ts: number,
  gapMs: number = DEFAULT_SCRIPT_GAP_MS,
): boolean {
  if (!script || script.lines.length === 0) return true;
  if (dayKey(script.endedAt) !== dayKey(ts)) return true;
  return ts - script.endedAt > gapMs;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/**
 * Human title for a script — "Script 5th April", with the year only when it is
 * not the current one, and a start time appended when a day holds more than one
 * script so the notebook never shows two identical titles.
 */
export function scriptTitle(script: CaptionScript, now: number, sameDayIndex = 0): string {
  const d = new Date(script.startedAt);
  const year = d.getFullYear();
  const base = `Script ${ordinal(d.getDate())} ${MONTHS[d.getMonth()]}`;
  const withYear = year === new Date(now).getFullYear() ? base : `${base} ${year}`;
  if (sameDayIndex <= 0) return withYear;
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${withYear} (${hh}:${mm})`;
}

/** Plain-text body of a script, one line per captured caption line. */
export function scriptText(script: CaptionScript): string {
  return script.lines.map((l) => l.text).join('\n');
}

/**
 * Languages a captured script is sorted under. `und` is a real outcome, not a
 * failure — a script of digits, names or "[Music]" has nothing to classify on,
 * and forcing it into a language would scatter it through the wrong group.
 */
export type CaptionLang = 'ja' | 'zh' | 'ko' | 'ru' | 'en' | 'und';

// Ranges are written as literals to match the punctuation class in
// `isRevisionOf` above; halfwidth katakana is included because Live Captions
// emits it for some input methods.
const RE_KANA = /[ｦ-ﾝ぀-ゟ゠-ヿ]/gu;
const RE_HAN = /[㐀-䶿一-鿿豈-﫿]/gu;
const RE_HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/gu;
const RE_CYRILLIC = /[Ѐ-ӿ]/gu;
const RE_LATIN = /[A-Za-z]/gu;

function countOf(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

/**
 * Which language a stretch of caption text is in, by script family.
 *
 * Live Captions gives us no language tag, so this reads the characters. The one
 * case worth care is ja vs zh: both are mostly Han on screen, and Japanese runs
 * of bare kanji are common, so a *dominant* count would misfile Japanese as
 * Chinese. Kana cannot appear in Chinese at all, so any kana at all decides it —
 * `1` rather than a proportion, because a single ～の in an otherwise kanji line
 * is already proof.
 */
export function detectLang(text: string): CaptionLang {
  const kana = countOf(text, RE_KANA);
  if (kana > 0) return 'ja';
  const scores: Array<[CaptionLang, number]> = [
    ['ko', countOf(text, RE_HANGUL)],
    ['zh', countOf(text, RE_HAN)],
    ['ru', countOf(text, RE_CYRILLIC)],
    ['en', countOf(text, RE_LATIN)],
  ];
  let best: CaptionLang = 'und';
  let bestN = 0;
  for (const [lang, n] of scores) {
    if (n > bestN) {
      best = lang;
      bestN = n;
    }
  }
  return best;
}

/**
 * The language of a whole script.
 *
 * Classifying the joined text rather than voting per line is deliberate: single
 * caption lines are short and a stray "OK" inside a Japanese conversation would
 * cast an `en` vote, while against the full body it is noise.
 */
export function scriptLang(script: CaptionScript): CaptionLang {
  return detectLang(scriptText(script));
}

/**
 * Group scripts by detected language, newest first *within* each group, with
 * the groups themselves ordered by how recently each language was spoken.
 *
 * The alternative — a fixed language order — would bury today's session under a
 * language the user last touched a month ago. Ordering groups by their newest
 * script keeps "what I just recorded is at the top" true, which is the property
 * the flat newest-first list had, while still collecting a language together.
 */
export function sortScriptsByLang(
  scripts: readonly CaptionScript[],
): Array<{ lang: CaptionLang; scripts: CaptionScript[] }> {
  const groups = new Map<CaptionLang, CaptionScript[]>();
  for (const script of scripts) {
    const lang = scriptLang(script);
    const bucket = groups.get(lang);
    if (bucket) bucket.push(script);
    else groups.set(lang, [script]);
  }
  const out = [...groups].map(([lang, list]) => ({
    lang,
    scripts: [...list].sort((a, b) => b.startedAt - a.startedAt),
  }));
  out.sort((a, b) => (b.scripts[0]?.startedAt ?? 0) - (a.scripts[0]?.startedAt ?? 0));
  return out;
}

/**
 * Fold a flat, time-ordered line stream into scripts. Used both by the live
 * appender and when rebuilding from a stored line log.
 */
export function segmentScripts(
  lines: readonly CaptionLine[],
  gapMs: number = DEFAULT_SCRIPT_GAP_MS,
  idPrefix = 'lc',
): CaptionScript[] {
  const out: CaptionScript[] = [];
  for (const line of lines) {
    const current = out[out.length - 1];
    if (startsNewScript(current, line.ts, gapMs)) {
      out.push({
        id: `${idPrefix}-${line.ts.toString(36)}-${out.length}`,
        startedAt: line.ts,
        endedAt: line.ts,
        lines: [line],
      });
    } else {
      current!.lines.push(line);
      current!.endedAt = line.ts;
    }
  }
  return out;
}
