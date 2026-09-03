/**
 * DEFECT S2 regression guard — a libass **file track** must reach the study layer.
 *
 * The diagnosis, so the next reader does not re-run it: of the bullet's three candidates —
 * track never loaded / cues never parsed / timestamp lookup off — it is **cues never
 * parsed**, and it is structural rather than intermittent.
 *
 * `VideoCoreSubtitleManager` keeps two kinds of track. An *event* track (the container's
 * own muxed streams, a Whisper transcript, the downloaded track this overlay mounts)
 * lands in `eventTracks`, which is the only map `_rebuildCueIndex` reads. A *file* track —
 * every `playbackInfo.subtitleTracks` entry with `useLibassRenderer`, numbered from 1000
 * up in `video-core-subtitles.ts` — is fetched, converted to ASS and handed to libass as
 * *text*: `fileTracks[n].content`. `_updateActiveCues` looks the track up in `eventTracks`,
 * finds nothing, and takes its "no event-based track selected" branch. So for as long as a
 * file track is selected, `getCues()` and `getActiveCues()` both return `[]` and not one
 * `cuechange` is ever dispatched — while libass paints those same lines on the video.
 *
 * That is the whole defect: `Waiting for subtitle` sits under subtitles. And it is not
 * only the cue line — `allCues` feeds the transcript rail, the analyser and mining, so a
 * file track made the file read as having no subtitles at all.
 *
 * The manager caches the converted ASS and exposes it (`getTrackContent`), so the fix is a
 * parse, not a fetch. This file pins the parse and the timestamp lookup that follows it;
 * the ratchet at the bottom pins that the overlay actually calls them, because a correct
 * converter nothing invokes is the failure mode this repo has shipped before.
 *
 * Trap this file is written around: the overlay's own comment block names
 * `getTrackContent` and `studyCuesFromParsedCues` while explaining them, so a raw-text
 * ratchet would pass on prose alone. Comments are stripped before anything is matched.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseStudySubtitles, parseSubtitles } from '../../shared/subtitleCues';
import {
  activeStudyCuesAtTime,
  studyCuesFromParsedCues,
} from '../../shared/videoCoreStudy';

const FILE_TRACK_NUMBER = 1000;

/** An `.srt` file track — the shape a Jimaku/nyaa harvest lands in. */
const SRT_FILE_TRACK = [
  '1',
  '00:00:04,000 --> 00:00:06,500',
  'うわあ ぐはっ',
  '',
  '2',
  '00:00:07,000 --> 00:00:09,250',
  '何をしている',
  '',
].join('\n');

/** A dual-script `.ass` file track: one Japanese style, one Chinese style. */
const DUAL_SCRIPT_ASS = [
  '[Script Info]',
  'ScriptType: v4.00+',
  '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize',
  'Style: JP,Yu Gothic,24',
  'Style: CH,SimHei,24',
  '',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:04.00,0:00:06.50,JP,,0,0,0,,うわあ ぐはっ',
  'Dialogue: 0,0:00:07.00,0:00:09.25,JP,,0,0,0,,何をしている',
  'Dialogue: 0,0:00:04.00,0:00:06.50,CH,,0,0,0,,哇啊',
  'Dialogue: 0,0:00:07.00,0:00:09.25,CH,,0,0,0,,你在干什么',
].join('\n');

describe('studyCuesFromParsedCues', () => {
  it('converts parsed seconds to the ms shape the event path produces', () => {
    const cues = studyCuesFromParsedCues(
      [{ start: 4, end: 6.5, text: 'うわあ ぐはっ' }],
      FILE_TRACK_NUMBER,
    );
    expect(cues).toEqual([{
      index: 0,
      trackNumber: FILE_TRACK_NUMBER,
      text: 'うわあ ぐはっ',
      startMs: 4_000,
      endMs: 6_500,
    }]);
  });

  it('sorts by start time and re-indexes, so the sorted-scan lookup is valid', () => {
    const cues = studyCuesFromParsedCues(
      [
        { start: 9, end: 10, text: 'third' },
        { start: 1, end: 2, text: 'first' },
        { start: 5, end: 6, text: 'second' },
      ],
      FILE_TRACK_NUMBER,
    );
    expect(cues.map((cue) => cue.text)).toEqual(['first', 'second', 'third']);
    expect(cues.map((cue) => cue.index)).toEqual([0, 1, 2]);
  });

  it('drops blank, non-finite and zero-length cues rather than indexing them', () => {
    const cues = studyCuesFromParsedCues(
      [
        { start: 1, end: 2, text: '   ' },
        { start: Number.NaN, end: 2, text: 'nan start' },
        { start: 1, end: Number.POSITIVE_INFINITY, text: 'infinite end' },
        { start: 4, end: 4, text: 'zero length' },
        { start: 1, end: 2, text: 'kept' },
      ],
      FILE_TRACK_NUMBER,
    );
    expect(cues.map((cue) => cue.text)).toEqual(['kept']);
  });
});

describe('a file track reaches the study layer', () => {
  it('parses an .srt file track into cues the overlay can show', () => {
    const cues = studyCuesFromParsedCues(
      parseStudySubtitles(SRT_FILE_TRACK).cues,
      FILE_TRACK_NUMBER,
    );
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('うわあ ぐはっ');
    expect(cues[0].startMs).toBe(4_000);
  });

  it('resolves the placeholder: at a time inside a cue there IS an active cue', () => {
    const cues = studyCuesFromParsedCues(
      parseStudySubtitles(SRT_FILE_TRACK).cues,
      FILE_TRACK_NUMBER,
    );
    // 5.0s sits inside cue 1; this is the exact lookup the overlay runs on `timeupdate`,
    // and the manager's own answer for the same track and the same instant is [].
    expect(activeStudyCuesAtTime(cues, 5, 0).map((cue) => cue.text))
      .toEqual(['うわあ ぐはっ']);
    // ...and the gap between cues still reports nothing, so the placeholder is not
    // replaced by a cue that has stopped being true.
    expect(activeStudyCuesAtTime(cues, 6.75, 0)).toEqual([]);
    expect(activeStudyCuesAtTime(cues, 8, 0).map((cue) => cue.text))
      .toEqual(['何をしている']);
  });

  it('honours the subtitle delay the rest of the study layer uses', () => {
    const cues = studyCuesFromParsedCues(
      parseStudySubtitles(SRT_FILE_TRACK).cues,
      FILE_TRACK_NUMBER,
    );
    expect(activeStudyCuesAtTime(cues, 5, 2)).toEqual([]);
    expect(activeStudyCuesAtTime(cues, 7, 2).map((cue) => cue.text))
      .toEqual(['うわあ ぐはっ']);
  });

  it('keeps the primary study track Japanese on a dual-script .ass', () => {
    const cues = studyCuesFromParsedCues(
      parseStudySubtitles(DUAL_SCRIPT_ASS).cues,
      FILE_TRACK_NUMBER,
    );
    expect(cues.map((cue) => cue.text)).toEqual(['うわあ ぐはっ', '何をしている']);
  });
});

/** Source with block and line comments removed, so prose can never satisfy a match. */
function overlaySource(): string {
  return readFileSync(path.join(__dirname, '..', 'VideoCoreStudyOverlay.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\r\n?/g, '\n');
}

describe('the overlay wires the S3 second-line bridge', () => {
  it('bridges the SECOND line and leaves the primary on exact activation', () => {
    const source = overlaySource();
    // The bridge is imported and used. Both this file's assertions and the overlay's
    // own comment name the symbol, which is why `overlaySource` strips comments first —
    // a source ratchet in this repo has already scored prose as a call site.
    expect(source).toContain('bridgedSecondaryCuesAtTime(');
    // Exactly one call, and it is the secondary sync. The primary's two call sites stay
    // on `activeStudyCuesAtTime`: they feed the cue line the study tools mine and grade,
    // so a held cue there would mean the wrong sentence.
    expect(source.match(/bridgedSecondaryCuesAtTime\(/g)).toHaveLength(1);
    expect(source.match(/activeStudyCuesAtTime\(/g)).toHaveLength(2);
    expect(source).toContain('setActiveSecondaryCues(\n        bridgedSecondaryCuesAtTime(');
  });
});

describe('the overlay wires the file-track cue clock', () => {
  it('reads the cached ASS off the manager and parses it', () => {
    const source = overlaySource();
    expect(source).toContain('manager.getTrackContent(selectedTrack)');
    expect(source).toContain('studyCuesFromParsedCues(');
    expect(source).toContain('parseStudySubtitles(content).cues');
  });

  it('stays inert when the manager has a cue index of its own', () => {
    // Without this guard the file-track path would fight the event path for `allCues`
    // on every muxed release, which is every case that worked before the fix.
    expect(overlaySource()).toContain('if (manager.getCues().length) return undefined;');
  });

  it('retries on the playback clock, because the ASS arrives after track selection', () => {
    const source = overlaySource();
    for (const event of ['timeupdate', 'seeked', 'loadeddata']) {
      expect(source).toContain(`video?.addEventListener('${event}', tick)`);
      expect(source).toContain(`video?.removeEventListener('${event}', tick)`);
    }
  });
});

/**
 * The same gap on the DUAL-subtitle line, which is the second half of the same defect.
 *
 * `getCuesForTrack` reads the event cache exactly as `getCues()` does, so it answers `[]`
 * for a file track too — and the secondary-track picker filtered `type === 'event'`, so a
 * file track could not even be OFFERED as a second line. A downloaded translation, which
 * is the ordinary shape of a Russian or English second line, was therefore unreachable
 * while the very same file worked as the primary.
 */
describe('the second subtitle line reaches a file track', () => {
  it('offers file tracks as secondary candidates, not only event tracks', () => {
    const source = overlaySource();
    // The disjunction, not the whole parenthesised expression: the MediaCaptions track
    // picker landed a `!manager ||` term in front of it on 2026-09-03, and pinning the
    // punctuation would have failed a merge that changed no behaviour at all.
    expect(source).toContain("track.type === 'event' || track.type === 'file'");
  });

  it('falls back to the cached ASS when the event cache answers nothing', () => {
    const source = overlaySource();
    expect(source).toContain('cues.length ? cues : fileCues()');
    expect(source).toContain('manager.getTrackContent(secondaryTrack)');
  });

  it('parses the second line WHOLE, without the Japanese-style split', () => {
    // `parseStudySubtitles` would drop a translation track's own styles: the split
    // belongs to the primary study track, and the second line is the one the viewer
    // asked to see. Pinned because using the wrong parser here shows an empty line
    // rather than an error.
    const source = overlaySource();
    expect(source).toContain('studyCuesFromParsedCues(parseSubtitles(content), secondaryTrack)');
    expect(source).not.toContain('parseStudySubtitles(content), secondaryTrack');
  });

  it('keeps a parsed timeline keyed to its own track number', () => {
    // An unkeyed cache shows one track's cues under another's number on a track switch.
    expect(overlaySource())
      .toContain('secondaryFileCuesRef.current?.trackNumber === secondaryTrack');
  });

  it('re-lists the track only while it has nothing, not four times a second', () => {
    expect(overlaySource())
      .toContain('if (secondaryCuesRef.current.length) syncActive();');
  });

  it('parses a Russian second line whole, styles and all', () => {
    const russianAss = [
      '[Script Info]',
      'ScriptType: v4.00+',
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize',
      'Style: Main,Arial,24',
      'Style: Sign,Arial,18',
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: 0,0:00:04.00,0:00:06.50,Main,,0,0,0,,Что происходит',
      'Dialogue: 0,0:00:07.00,0:00:09.25,Sign,,0,0,0,,Токио, 2011 год',
    ].join('\n');
    // Neither style carries kana, so the study split would be the wrong instrument here.
    const cues = studyCuesFromParsedCues(parseSubtitles(russianAss), 1001);
    expect(cues.map((cue) => cue.text))
      .toEqual(['Что происходит', 'Токио, 2011 год']);
    expect(activeStudyCuesAtTime(cues, 8, 0).map((cue) => cue.text))
      .toEqual(['Токио, 2011 год']);
  });
});
