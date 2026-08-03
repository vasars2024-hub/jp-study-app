/**
 * Music joins the existing study loop — Phase 6 slice 17.
 *
 * The property that matters most here is the last block: a line mined from a song must come
 * out of `createVideoCoreMiningDraft` / `buildVideoCoreMineRequest` — the SAME functions
 * video uses — and land in the SAME history Review reads. If that ever stops being true the
 * app has two study loops, and the user has two places to look for one mined card.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isMusicProvenance,
  isSyncedMusicProvenance,
  MUSIC_LYRICS_TRACK_NUMBER,
  MUSIC_STREAM_TYPE,
  musicCueReplaySec,
  musicCueStepSec,
  musicMiningSource,
  musicStudyCue,
  musicTransportCues,
} from '../musicMining';
import {
  appendVideoCoreMiningHistory,
  buildVideoCoreMineRequest,
  createVideoCoreMiningDraft,
  createVideoCoreMiningHistoryEntry,
  normalizeVideoCoreMiningHistory,
} from '../videoCoreMining';

const SONG = {
  id: 'song-1',
  title: '春よ、来い',
  path: 'C:/music/haru-yo-koi.mp3',
  fileName: 'haru-yo-koi.mp3',
};

describe('musicMiningSource', () => {
  it('identifies the song by its path, so two lines from one track group together', () => {
    // MediaItem.id is regenerated when a library is re-imported; the path is not.
    const source = musicMiningSource(SONG, 'synced');

    expect(source.playbackId).toBe('C:/music/haru-yo-koi.mp3');
    expect(source.localFilePath).toBe('C:/music/haru-yo-koi.mp3');
    expect(source.playbackType).toBe('music');
    expect(source.mediaTitle).toBe('春よ、来い');
  });

  it('falls back to the id when a song has no path', () => {
    const source = musicMiningSource({ ...SONG, path: '' }, 'plain');

    expect(source.playbackId).toBe('music:song-1');
    expect(source.localFilePath).toBeUndefined();
  });

  it('records which kind of lyrics the line came from', () => {
    expect(musicMiningSource(SONG, 'synced').streamType).toBe('music-lrc');
    expect(musicMiningSource(SONG, 'plain').streamType).toBe('music-plain');
  });
});

describe('musicStudyCue — synced lyrics carry their own timing', () => {
  it('uses the cue timestamps and ignores the listening position', () => {
    const cue = musicStudyCue(
      { index: 4, text: '  春よ 遠き春よ  ', startSec: 61.5, endSec: 65.25 },
      'synced',
      // Deliberately different from the cue: the truthful locator must win.
      999,
    );

    expect(cue).toEqual({
      index: 4,
      trackNumber: MUSIC_LYRICS_TRACK_NUMBER,
      text: '春よ 遠き春よ',
      startMs: 61500,
      endMs: 65250,
    });
  });

  it('refuses a line labelled synced that has no usable timing', () => {
    // Silently downgrading to a listening position would hide a caller's mislabelling
    // inside the one record whose job is to be traceable.
    expect(musicStudyCue({ index: 0, text: 'x' }, 'synced', 10)).toBeNull();
    expect(musicStudyCue({ index: 0, text: 'x', startSec: 5 }, 'synced', 10)).toBeNull();
    expect(musicStudyCue({ index: 0, text: 'x', startSec: 9, endSec: 2 }, 'synced', 10))
      .toBeNull();
    expect(musicStudyCue({ index: 0, text: 'x', startSec: NaN, endSec: 2 }, 'synced', 10))
      .toBeNull();
  });
});

describe('musicStudyCue — plain lyrics record where the listener was', () => {
  it('produces a zero-length range at the playback position', () => {
    const cue = musicStudyCue({ index: 7, text: '君を待つ' }, 'plain', 83.4);

    expect(cue).toMatchObject({ index: 7, text: '君を待つ', startMs: 83400, endMs: 83400 });
    // Zero length is the marker that this is a position, not a duration.
    expect(cue?.startMs).toBe(cue?.endMs);
  });

  it('treats a missing or invalid position as the start of the track', () => {
    expect(musicStudyCue({ index: 0, text: 'a' }, 'plain', NaN)?.startMs).toBe(0);
    expect(musicStudyCue({ index: 0, text: 'a' }, 'plain', -5)?.startMs).toBe(0);
  });
});

describe('musicStudyCue — what can never become a card', () => {
  it('refuses blank lines, which are spacers in a lyric sheet', () => {
    expect(musicStudyCue({ index: 2, text: '   ' }, 'plain', 1)).toBeNull();
    expect(musicStudyCue({ index: 2, text: '' }, 'synced', 1)).toBeNull();
  });

  it('refuses a nonsensical index', () => {
    // Refused here rather than in the UI so no caller can mine one by wiring a button
    // up slightly differently.
    expect(musicStudyCue({ index: -1, text: 'a' }, 'plain', 1)).toBeNull();
    expect(musicStudyCue({ index: 1.5, text: 'a' }, 'plain', 1)).toBeNull();
  });
});

describe('provenance readers', () => {
  it('distinguishes music from video, and synced music from plain', () => {
    const video = { playbackType: 'localfile', streamType: 'file' };

    expect(isMusicProvenance(musicMiningSource(SONG, 'synced'))).toBe(true);
    expect(isMusicProvenance(musicMiningSource(SONG, 'plain'))).toBe(true);
    expect(isMusicProvenance(video)).toBe(false);

    expect(isSyncedMusicProvenance(musicMiningSource(SONG, 'synced'))).toBe(true);
    expect(isSyncedMusicProvenance(musicMiningSource(SONG, 'plain'))).toBe(false);
    expect(isSyncedMusicProvenance({ ...video, streamType: MUSIC_STREAM_TYPE.synced }))
      .toBe(false);
  });
});

describe('one audio recorder, not two — slice 18', () => {
  const SRC = resolve(__dirname, '../..');

  it('video and music both call the shared recordCueAudio', () => {
    // The recorder used to live inside VideoCoreMiningPanel typed to HTMLVideoElement.
    // Slice 18 moved it to cueAudioCapture.ts typed on HTMLMediaElement so a song records
    // with the SAME implementation. A second copy would be a second set of
    // restore-the-player semantics to get subtly wrong — that function's `finally` hands
    // the user's playback back exactly as it found it, including whether it was paused.
    for (const file of [
      'media/VideoCoreMiningPanel.tsx',
      'renderer/components/music/useMusicMining.ts',
    ]) {
      const source = readFileSync(resolve(SRC, file), 'utf8');
      expect(source).toContain('recordCueAudio');
      expect(source).toMatch(/from '[^']*cueAudioCapture'/);
      // No local redefinition sneaking back in.
      expect(source).not.toMatch(/function\s+recordCueAudio/);
      expect(source).not.toContain('MediaRecorder(');
    }
  });

  it('the shared recorder is typed on HTMLMediaElement, not HTMLVideoElement', () => {
    // The single line that makes it reusable for a song at all. Checked on the TYPE
    // ANNOTATIONS, not the file text — the header explains the move and names
    // `HTMLVideoElement` in prose, which a substring match would flag. (That exact mistake
    // was made twice in this session; see blancStudyPlayerRouting.test.ts.)
    const source = readFileSync(resolve(SRC, 'media/cueAudioCapture.ts'), 'utf8');
    expect(source).toMatch(/recordCueAudio\(\s*media: HTMLMediaElement/);
    expect(source).not.toMatch(/:\s*HTMLVideoElement/);
    expect(source).not.toMatch(/&\s*HTMLVideoElement/);
  });

  it('music only records audio for SYNCED lyrics', () => {
    // A plain line's range is zero-length by design — it records where the listener was,
    // not the line's duration — so recording it would ask MediaRecorder for zero seconds
    // and get an empty blob. Asserted on the source because the branch is in an effectful
    // hook that would need a full MediaRecorder fake to reach.
    const source = readFileSync(
      resolve(SRC, 'renderer/components/music/useMusicMining.ts'), 'utf8',
    );
    expect(source).toContain("kind === 'synced' ? getLeaderAudioElement() : null");
  });

  it('a capture failure still mines the card', () => {
    // Losing the card because the audio could not be recorded would be strictly worse than
    // the previous behaviour, where there was no audio at all.
    const source = readFileSync(
      resolve(SRC, 'renderer/components/music/useMusicMining.ts'), 'utf8',
    );
    const captureBlock = source.slice(
      source.indexOf('const media ='),
      source.indexOf("setOutcome({ kind: 'busy'"),
    );
    expect(captureBlock).toContain('catch');
    // The mine call must sit OUTSIDE that try, i.e. after it. Anchored on
    // `buildVideoCoreMineRequest`, which occurs exactly once — `ankiMineNote` also appears
    // in the earlier desktop-only guard, so indexOf on it measured the wrong thing.
    expect(captureBlock).not.toContain('buildVideoCoreMineRequest');
    expect(source.indexOf('buildVideoCoreMineRequest('))
      .toBeGreaterThan(source.indexOf('const media ='));
  });
});

describe('one study loop, not two', () => {
  it('a mined lyric goes through the SAME draft/request/history path as video', () => {
    const cue = musicStudyCue(
      { index: 4, text: '春よ 遠き春よ', startSec: 61.5, endSec: 65.25 },
      'synced',
      0,
    );
    if (!cue) throw new Error('musicStudyCue returned null for a valid synced line');

    const draft = createVideoCoreMiningDraft(
      cue,
      '春よ 遠き春よ',
      musicMiningSource(SONG, 'synced'),
      1700000000000,
    );
    const request = buildVideoCoreMineRequest(draft);
    const entry = createVideoCoreMiningHistoryEntry(draft, { ok: true, noteId: 42 });
    const history = appendVideoCoreMiningHistory([], entry);

    expect(draft.sentence).toBe('春よ 遠き春よ');
    expect(draft.provenance.source.playbackType).toBe('music');
    expect(request).toBeTruthy();
    expect(history).toHaveLength(1);
    expect(history[0]?.provenance.source.mediaTitle).toBe('春よ、来い');

    // And it survives the round trip Review performs when it reads localStorage.
    const reloaded = normalizeVideoCoreMiningHistory(JSON.parse(JSON.stringify(history)));
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]?.provenance.source.streamType).toBe('music-lrc');
    expect(reloaded[0]?.provenance.cue.startMs).toBe(61500);
  });

  it('a plain-lyrics mine also survives the Review round trip', () => {
    const cue = musicStudyCue({ index: 7, text: '君を待つ' }, 'plain', 83.4);
    if (!cue) throw new Error('musicStudyCue returned null for a valid plain line');
    const draft = createVideoCoreMiningDraft(
      cue, '君を待つ', musicMiningSource(SONG, 'plain'), 1700000000000,
    );
    const entry = createVideoCoreMiningHistoryEntry(draft, { ok: true, noteId: 43 });
    const reloaded = normalizeVideoCoreMiningHistory(
      JSON.parse(JSON.stringify(appendVideoCoreMiningHistory([], entry))),
    );

    expect(reloaded).toHaveLength(1);
    // The normaliser must not discard a zero-length range — that is a real music record,
    // and dropping it would silently lose every plain-lyrics card.
    expect(reloaded[0]?.provenance.cue.startMs).toBe(83400);
    expect(reloaded[0]?.provenance.cue.endMs).toBe(83400);
  });
});

/**
 * The lyrics cue transport — slice 20.
 *
 * The prev/replay/next buttons existed in the tree before this slice, as three inline
 * closures inside `MusicLyricsPane` with their own cue conversion. In that form nothing
 * could test them, and nothing did. Moving them here is what makes the block below
 * possible; the block below is the reason the move was worth making.
 */
describe('the lyrics cue transport — slice 20', () => {
  /** A four-line synced sheet. Line 1 is unminable, and therefore unnavigable. */
  const LINES = [
    { index: 0, text: '春よ 遠き春よ', startSec: 10, endSec: 14 },
    { index: 1, text: '   ', startSec: 14, endSec: 18 },
    { index: 2, text: '瞼閉じればそこに', startSec: 18, endSec: 22 },
    { index: 3, text: '君を待つ', startSec: 22, endSec: 26 },
  ];
  const CUES = musicTransportCues(LINES);

  it('builds its cues through musicStudyCue, so the transport and Mine agree', () => {
    // Not a cosmetic overlap. If the pane could step onto a line the Mine button refuses,
    // the user would arrive at a line with a dead button and no stated reason.
    expect(CUES).toHaveLength(3);
    expect(CUES.map((c) => c.text)).toEqual(['春よ 遠き春よ', '瞼閉じればそこに', '君を待つ']);
    expect(CUES.every((c) => c.trackNumber === MUSIC_LYRICS_TRACK_NUMBER)).toBe(true);
  });

  it('keeps the LYRIC index on the survivors, not the position in its own array', () => {
    // This is what lets `activeIndex` — which counts lyric lines — address a cue at all.
    expect(CUES.map((c) => c.index)).toEqual([0, 2, 3]);
  });

  it('refuses a synced line whose timing is unusable rather than inventing one', () => {
    expect(musicTransportCues([{ index: 0, text: 'あ', startSec: 9, endSec: 4 }])).toEqual([]);
    expect(musicTransportCues([{ index: 0, text: 'あ' }])).toEqual([]);
  });

  it('steps to the next and previous line from inside a line', () => {
    // Playing at 19.5 s, i.e. inside the line that starts at 18.
    expect(musicCueStepSec(CUES, 19.5, 1)).toBe(22);
    expect(musicCueStepSec(CUES, 19.5, -1)).toBe(10);
  });

  it('skips the line the transport refused instead of seeking into it', () => {
    // From the line at 10, "next" is 18 — not 14, which is the blank line's timestamp.
    expect(musicCueStepSec(CUES, 10.2, 1)).toBe(18);
  });

  it("uses adjacentStudyCue's 50 ms tolerance, so a line start counts as being ON it", () => {
    // Exactly at 18: "next" must advance to 22, not re-land on 18. The video overlay's
    // previous/next behaves this way because it calls the same function.
    expect(musicCueStepSec(CUES, 18, 1)).toBe(22);
    expect(musicCueStepSec(CUES, 17.98, 1)).toBe(22);
  });

  it('clamps at both ends rather than seeking off the sheet', () => {
    // Before the first line, both directions land on it — never a negative seek.
    expect(musicCueStepSec(CUES, 0, -1)).toBe(10);
    expect(musicCueStepSec(CUES, 0, 1)).toBe(10);
    expect(musicCueStepSec(CUES, 999, 1)).toBe(22);
    expect(musicCueStepSec(CUES, -5, 1)).toBe(10);
  });

  it('has nowhere to step on a plain sheet, and says so instead of seeking to 0', () => {
    expect(musicCueStepSec([], 12, 1)).toBeNull();
    expect(musicCueStepSec([], 12, -1)).toBeNull();
  });

  it('replays the line being sung, addressed by its lyric index', () => {
    expect(musicCueReplaySec(CUES, 0)).toBe(10);
    expect(musicCueReplaySec(CUES, 2)).toBe(18);
    expect(musicCueReplaySec(CUES, 3)).toBe(22);
  });

  it('would seek to the WRONG line if it indexed its own array — which is why it does not', () => {
    // The discriminator for the rule above. `activeIndex` counts lyric lines; `CUES` has
    // had one removed, so the two only agree up to the first refusal. Today's three
    // parsers all drop empty-text cues, so no refusal actually reaches here — this is the
    // failure mode being designed out, not one being reported.
    expect(CUES[2]?.startMs).toBe(22_000);        // positional lookup: the line at 22
    expect(musicCueReplaySec(CUES, 2)).toBe(18);  // correct: the line at 18
  });

  it('replays nothing when no line is active, or when the index is nonsense', () => {
    expect(musicCueReplaySec(CUES, -1)).toBeNull();   // activeIndex is -1 between lines
    expect(musicCueReplaySec(CUES, 1)).toBeNull();    // the refused line
    expect(musicCueReplaySec(CUES, 99)).toBeNull();
    expect(musicCueReplaySec(CUES, 1.5)).toBeNull();
  });
});

describe('the lyrics pane owns no second copy of any of that — slice 20', () => {
  const PANE = resolve(__dirname, '../../renderer/components/music/MusicContent.tsx');

  /**
   * Comments out before sweeping. The block this file guards carries prose that names
   * `adjacentStudyCue`, `video.replayLine` and `registerCommandHandler` in order to explain
   * why they are NOT used there — so a substring search over raw source reads the
   * explanation as the defect. Slice 12 and slice 19 each lost a round to exactly this.
   */
  const code = (text: string): string => text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .join('\n');

  it('converts through musicTransportCues instead of mapping cues itself', () => {
    const source = code(readFileSync(PANE, 'utf8'));
    expect(source).toContain('musicTransportCues(');
    expect(source).toContain('musicCueStepSec(');
    expect(source).toContain('musicCueReplaySec(');
    // The inline conversion this slice removed, in the form it was written.
    expect(source).not.toMatch(/startMs:\s*Math\.round/);
    expect(source).not.toContain('adjacentStudyCue');
  });

  /**
   * The live harness (`docs/migration/tools/music-mining-harness.mjs`) presses these three
   * buttons over CDP. It reaches them two ways: phases K–M address the row positionally
   * (`.music-cue-nav button[0|1|2]`) and phase N asserts that those slots really are
   * prev/replay/next by class. Both halves die quietly if the pane renames or drops a class
   * — the harness is not run by the suite, so nothing else would notice until someone ran it
   * and read a confusing failure. This is the cheap thing that notices.
   */
  it('names each transport button, and the live harness looks for those names', () => {
    const source = code(readFileSync(PANE, 'utf8'));
    const harness = readFileSync(
      resolve(__dirname, '../../../docs/migration/tools/music-mining-harness.mjs'),
      'utf8',
    );
    for (const cls of ['music-cue-prev', 'music-cue-replay', 'music-cue-next']) {
      expect(source).toContain(`className="${cls}"`);
      expect(harness).toContain(cls);
    }
  });

  it('does not register the video overlay\'s command ids', () => {
    // `registerCommandHandler` keeps a stack per id and `runCommand` takes the LAST
    // registrant, so registering these here would silently take them from
    // VideoCoreStudyOverlay whenever the music surface mounted later — mount-order
    // ownership, which is the invisible second owner slice 19 collapsed.
    //
    // **Narrowed in slice 31, and the reason is the decision this guard was waiting for.**
    // It used to ban `registerCommandHandler` outright, because at slice 20 the pane
    // registered nothing and "music keyboard navigation needs its own `music.*` rows" was
    // still an open decision. Those rows exist now, and the pane registers exactly them —
    // so the blanket ban had become a ban on the answer rather than on the defect. What
    // was always the real invariant, and all this test ever needed to say, is that the two
    // surfaces' id sets stay disjoint. `musicCueNavCommands.test.ts` holds the other half:
    // that the pane registers all three `music.*` ids and the overlay's set is still ten.
    const source = code(readFileSync(PANE, 'utf8'));
    for (const id of ['video.replayLine', 'video.prevLine', 'video.nextLine']) {
      expect(source).not.toContain(id);
    }
    const registered = [...source.matchAll(/registerCommandHandler\('([^']+)'/g)]
      .flatMap((match) => (match[1] ? [match[1]] : []));
    expect(registered.every((id) => id.startsWith('music.'))).toBe(true);
  });
});
