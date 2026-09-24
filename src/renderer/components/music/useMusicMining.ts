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
  normalizeVideoCoreMiningHistory,
  withVideoCoreMiningAsset,
  VIDEO_CORE_MINING_HISTORY_KEY,
} from '../../../shared/videoCoreMining';
import { recordCueAudio } from '../../../media/cueAudioCapture';
import { getLeaderAudioElement } from '../../playerBus';
import {
  musicMiningSource,
  musicStudyCue,
  type MusicLyricsKind,
  type MusicMiningLine,
} from '../../../shared/musicMining';
import type { MediaItem } from '../../../shared/types';
import { mineToStudy, videoCoreStudyInput } from '../../studyMining';
import { writeLocalStorageJson } from '../../localStorageWrite';

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

function readHistory(): ReturnType<typeof normalizeVideoCoreMiningHistory> {
  try {
    return normalizeVideoCoreMiningHistory(
      JSON.parse(localStorage.getItem(VIDEO_CORE_MINING_HISTORY_KEY) ?? '[]'),
    );
  } catch {
    // A corrupt key must not stop a user mining; the normaliser already drops bad rows,
    // and this covers the JSON itself being unparseable.
    return [];
  }
}

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

    let draft = createVideoCoreMiningDraft(cue, cue.text, musicMiningSource(current, kind));

    // Attach the line's audio when there is a real range to record.
    //
    // Only for `synced` lyrics: a plain line's range is zero-length (it records where the
    // listener was, not the line's duration — see shared/musicMining.ts), and recording
    // zero seconds would yield an empty blob. `getLeaderAudioElement()` is null in a
    // follower window, which mirrors UI without owning the sound.
    //
    // A capture failure must NEVER lose the card: the mine proceeds without audio. That is
    // why this is a separate try, and why the outcome distinguishes `withAudio`.
    const media = kind === 'synced' ? getLeaderAudioElement() : null;
    if (media) {
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
      if (result) {
        const entry = createVideoCoreMiningHistoryEntry(draft, result);
        writeLocalStorageJson(VIDEO_CORE_MINING_HISTORY_KEY, appendVideoCoreMiningHistory(readHistory(), entry));
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
      writeLocalStorageJson(VIDEO_CORE_MINING_HISTORY_KEY, appendVideoCoreMiningHistory(readHistory(), entry));
      setOutcome({
        kind: 'error',
        index: line.index,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [current]);

  return { outcome, mine, reset };
}
