/**
 * Mining a lyric line to Anki — Phase 6 slice 17.
 *
 * Music was the one immersion surface you could not get a card out of. This hook is the
 * action; `shared/musicMining.ts` is the adapter that lets a song enter the loop video
 * already uses, and everything below this line — draft, request, history entry, storage key
 * — is video's, unchanged. Review (`SeanimeWatchLoopPanel`) therefore shows a mined lyric
 * with no work at all, because it reads that same key.
 *
 * The history is written straight to `localStorage` rather than held in React state, which
 * is deliberate: the mining panel owns the in-memory copy while the workspace is open, and
 * two owners of one key would race. Reading-modifying-writing on each mine keeps the last
 * writer correct whichever surface it was.
 */
import { useCallback, useState } from 'react';
import {
  appendVideoCoreMiningHistory,
  createVideoCoreMiningDraft,
  createVideoCoreMiningHistoryEntry,
  createVideoCoreMiningOutcomeEntry,
  withVideoCoreMiningAsset,
} from '../../../shared/videoCoreMining';
import { recordCueAudio } from '../../../media/cueAudioCapture';
import {
  readVideoCoreMiningHistory,
  writeVideoCoreMiningHistory,
} from '../../../media/useMinedCueKeys';
import { getLeaderAudioElement } from '../../playerBus';
import {
  musicMiningSource,
  musicStudyCue,
  type MusicLyricsKind,
  type MusicMiningLine,
} from '../../../shared/musicMining';
import type { MediaItem } from '../../../shared/types';
import { mineToStudy, videoCoreStudyInput } from '../../studyMining';
import { recordMediaMined } from '../../stats';
import { getStudyLang } from '../../studyEnvironment';
import { studyLangOfText } from '../../../shared/studyLang';

export type MusicMineOutcome =
  | { kind: 'idle' }
  /** Recording the line's audio, which plays it through in real time. */
  | { kind: 'recording'; index: number }
  | { kind: 'busy'; index: number }
  | { kind: 'done'; index: number; destination: string; withAudio: boolean }
  | { kind: 'duplicate'; index: number }
  /** In the local deck; Anki is closed (`queued`) or not set up here (`local`). */
  | { kind: 'saved'; index: number; anki: 'queued' | 'local' }
  | { kind: 'error'; index: number; message: string };

export interface MusicMining {
  outcome: MusicMineOutcome;
  /** Resolves once the note has been attempted; never throws. */
  mine: (line: MusicMiningLine, kind: MusicLyricsKind, positionSec: number) => Promise<void>;
  reset: () => void;
}

// A corrupt key must not stop a user mining: the reader drops bad rows, and returns []
// when the JSON itself is unparseable.
const readHistory = readVideoCoreMiningHistory;

export function useMusicMining(current: MediaItem | null): MusicMining {
  const [outcome, setOutcome] = useState<MusicMineOutcome>({ kind: 'idle' });
  const reset = useCallback(() => setOutcome({ kind: 'idle' }), []);

  const mine = useCallback(async (
    line: MusicMiningLine,
    kind: MusicLyricsKind,
    positionSec: number,
  ): Promise<void> => {
    if (!current) return;
    const cue = musicStudyCue(line, kind, positionSec);
    // `musicStudyCue` refuses blank lines and mislabelled timing. Treating null as "not
    // minable" rather than as an error keeps a click on a spacer line silent.
    if (!cue) return;

    let draft = createVideoCoreMiningDraft(
      cue, cue.text, musicMiningSource(current, kind), Date.now(), '', studyLangOfText(cue.text, getStudyLang()),
    );

    // Attach the line's audio when there is a real range to record.
    //
    // Only for `synced` lyrics: a plain line's range is zero-length (it records where the
    // listener was, not the line's duration — see shared/musicMining.ts), and recording
    // zero seconds would yield an empty blob. `getLeaderAudioElement()` is null in a
    // follower window, which mirrors UI without owning the sound.
    //
    // A capture failure must NEVER lose the card: the mine proceeds without audio. That is
    // why this is a separate try, and why the outcome distinguishes `withAudio`.
    // music2: a local song is cut from the FILE (ffmpeg, the same route video uses) —
    // instant, and the music keeps playing instead of jumping back to replay the line.
    // Recording off the element remains the fallback for streams and failed cuts.
    const filePath = kind === 'synced' ? current.path?.trim() : '';
    if (filePath && typeof window.api?.extractAudioClip === 'function') {
      try {
        const result = await window.api.extractAudioClip({
          filePath,
          startSec: cue.startMs / 1000,
          endSec: cue.endMs / 1000,
        });
        if (result.ok && result.base64) {
          draft = withVideoCoreMiningAsset(draft, 'audio', {
            base64: result.base64,
            asset: {
              filename: `jp-music-cue-${cue.index}-${cue.startMs}.mp3`,
              mimeType: result.mimeType ?? 'audio/mpeg',
              bytes: result.bytes ?? 0,
            },
          });
        }
      } catch {
        // Fall through to recording, below.
      }
    }
    const media = kind === 'synced' ? getLeaderAudioElement() : null;
    if (media && !draft.audioBase64) {
      setOutcome({ kind: 'recording', index: line.index });
      try {
        const captured = await recordCueAudio(media, {
          startSec: cue.startMs / 1000,
          endSec: cue.endMs / 1000,
          filenameStem: `jp-music-cue-${cue.index}-${cue.startMs}`,
        });
        draft = withVideoCoreMiningAsset(draft, 'audio', {
          base64: captured.base64,
          asset: captured,
        });
      } catch {
        // Too short, no audio track, MediaRecorder unavailable — all fine, mine the text.
      }
    }

    setOutcome({ kind: 'busy', index: line.index });
    const withAudio = !!draft.audioBase64;
    try {
      // Local study card first; the Anki half joins it or waits for Anki.
      const mined = await mineToStudy({ ...videoCoreStudyInput(draft, 'lyrics'), notify: false });
      const result = mined.ankiResult;
      // Every outcome is a line the user mined, queued or app-only included.
      const entry = createVideoCoreMiningOutcomeEntry(draft, mined.anki, result, mined.error);
      writeVideoCoreMiningHistory(appendVideoCoreMiningHistory(readHistory(), entry));
      // Statistics count media mines (the player does the same); a new card only.
      if (mined.created) {
        try {
          recordMediaMined(1);
        } catch {
          // Statistics never block a mine.
        }
      }
      if (mined.anki === 'added' && result?.ok) {
        setOutcome({
          kind: 'done',
          index: line.index,
          destination: result.deckName ?? result.profileName ?? '',
          withAudio,
        });
      } else if (mined.anki === 'duplicate' || mined.anki === 'added') {
        setOutcome({ kind: 'duplicate', index: line.index });
      } else if (mined.anki === 'queued' || mined.anki === 'local') {
        setOutcome({ kind: 'saved', index: line.index, anki: mined.anki });
      } else {
        setOutcome({ kind: 'error', index: line.index, message: mined.error ?? result?.error ?? '' });
      }
    } catch (err) {
      // A failed mine is still recorded, so Review shows the attempt rather than losing it.
      const entry = createVideoCoreMiningHistoryEntry(draft, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      // Storage full or unavailable — the outcome below still tells the user.
      writeVideoCoreMiningHistory(appendVideoCoreMiningHistory(readHistory(), entry));
      setOutcome({
        kind: 'error',
        index: line.index,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [current]);

  return { outcome, mine, reset };
}
