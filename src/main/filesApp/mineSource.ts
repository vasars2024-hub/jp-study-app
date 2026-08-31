/**
 * The Files app — reading the text behind a catalogue row (gate 3, main half).
 *
 * Every reader here is an existing one. Nothing in this file parses a subtitle,
 * unzips an epub or invents a sentence boundary of its own:
 *
 *   subtitle  `parseSubtitles`        (`shared/subtitleCues.ts`)
 *   transcript the same `Cue[]` shape `ytPlaylists.ts:770` persists
 *   book      `extractEpubSections` + `splitSentences` (`main/mining.ts`)
 *
 * That is deliberate and it is the plan's constraint: *unify the surface, not
 * the extractors*. A second epub reader here would give the Files app a
 * different sentence count for the same book than the mining analyzer reports,
 * and the first bug report about that discrepancy would be unanswerable.
 *
 * Every failure is a NAMED refusal with an i18n key. There is no path in this
 * module that returns an empty passage list to mean "something went wrong" —
 * an empty result and a failure are different states and the plan calls
 * conflating them a FINDING.
 */
import fs from 'node:fs';
import { parseSubtitles, type Cue } from '../../shared/subtitleCues';
import { SUBTITLE_EXT, extOf } from '../../shared/mediaKind';
import type { FilesMinePassage, FilesMineSourceResult } from '../../shared/filesApp/mining';
import { extractEpubSections, splitSentences } from '../mining';

/** Guard against a mis-routed multi-gigabyte file reaching a UTF-8 read. */
const MAX_TEXT_BYTES = 32 * 1024 * 1024;

function cuesToPassages(cues: readonly Cue[]): FilesMinePassage[] {
  const out: FilesMinePassage[] = [];
  cues.forEach((cue, offset) => {
    const text = typeof cue?.text === 'string' ? cue.text.trim() : '';
    if (!text) return;
    const startMs =
      typeof cue.start === 'number' && Number.isFinite(cue.start)
        ? Math.max(0, Math.round(cue.start * 1000))
        : undefined;
    const endMs =
      typeof cue.end === 'number' && Number.isFinite(cue.end)
        ? Math.max(0, Math.round(cue.end * 1000))
        : undefined;
    out.push({
      index: offset + 1,
      text,
      ...(startMs === undefined ? {} : { startMs }),
      ...(endMs === undefined ? {} : { endMs }),
    });
  });
  return out;
}

/**
 * A transcript file is `JSON.stringify(Cue[])` — exactly what
 * `MediaContent.tsx:893` hands to `yt:markTranscribed`. It is read as that and
 * nothing else: a file that parses to something other than an array is a
 * refusal naming the shape, not a silent zero.
 */
function readTranscript(filePath: string): FilesMineSourceResult {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return {
      ok: false,
      reasonKey: 'filesApp.mine.refuse.unreadable',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      reasonKey: 'filesApp.mine.refuse.badTranscript',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, reasonKey: 'filesApp.mine.refuse.badTranscript' };
  }
  const passages = cuesToPassages(parsed as Cue[]);
  return { ok: true, passages, readCount: parsed.length };
}

function readSubtitleFile(filePath: string): FilesMineSourceResult {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return {
      ok: false,
      reasonKey: 'filesApp.mine.refuse.unreadable',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  // `parseSubtitles` dispatches on content, not on the extension — an `.srt`
  // holding VTT and an `.ass` are both handled by the one entry point the
  // player uses.
  const cues = parseSubtitles(raw);
  return { ok: true, passages: cuesToPassages(cues), readCount: cues.length };
}

/**
 * The whole book, section by section, in spine order.
 *
 * `extractEpubSections` returns undecoded placeholders for a range it was told
 * to skip; no range is passed here, so `decoded` is true throughout and a
 * `decoded: false` entry would mean the reader itself skipped it. Those are
 * dropped rather than counted, because their `text` is empty by contract and
 * counting them would inflate `readCount` with sections nobody read.
 */
function readEpub(filePath: string): FilesMineSourceResult {
  let result: ReturnType<typeof extractEpubSections>;
  try {
    result = extractEpubSections(filePath);
  } catch (err) {
    return {
      ok: false,
      reasonKey: 'filesApp.mine.refuse.badEpub',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  const passages: FilesMinePassage[] = [];
  for (const section of result.sections) {
    if (!section.decoded || !section.text) continue;
    for (const sentence of splitSentences(section.text)) {
      passages.push({
        index: passages.length + 1,
        text: sentence,
        ...(section.title ? { context: section.title } : {}),
      });
    }
  }
  return { ok: true, passages, readCount: passages.length };
}

/**
 * Read one file into passages, dispatching on what the file is.
 *
 * `kind` comes from the catalogue row rather than from the path, because the
 * catalogue already settled the question — a `.json` under `yt-transcripts/`
 * is a transcript and a `.json` anywhere else is not, and re-deriving that here
 * from the extension would be a second, weaker copy of the enumerator's answer.
 */
export function readFilesMineSource(
  filePath: string,
  kind: 'transcript' | 'subtitle' | 'book',
): FilesMineSourceResult {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    // The row exists and the file does not. Gate 34's condition, reached from
    // the mine path rather than the index refresh.
    return { ok: false, reasonKey: 'filesApp.mine.refuse.brokenLink' };
  }
  if (!stat.isFile()) {
    return { ok: false, reasonKey: 'filesApp.mine.refuse.notAFile' };
  }
  if (kind !== 'book' && stat.size > MAX_TEXT_BYTES) {
    return { ok: false, reasonKey: 'filesApp.mine.refuse.tooLarge' };
  }

  if (kind === 'transcript') return readTranscript(filePath);
  if (kind === 'book') {
    if (extOf(filePath) !== '.epub') {
      // A manga volume is a page directory and a book row can point at one.
      // There is no text in a folder of images; OCR is a different feature.
      return { ok: false, reasonKey: 'filesApp.mine.refuse.notEpub' };
    }
    return readEpub(filePath);
  }
  // A subtitle row can point at a transcript-shaped `.json` (the fusion
  // pipeline writes both), so the extension still decides which parser runs.
  const ext = extOf(filePath);
  if (ext === '.json') return readTranscript(filePath);
  if (!SUBTITLE_EXT.has(ext)) {
    return { ok: false, reasonKey: 'filesApp.mine.refuse.unknownSubtitleFormat' };
  }
  return readSubtitleFile(filePath);
}
