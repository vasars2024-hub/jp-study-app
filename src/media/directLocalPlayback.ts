/**
 * Play a local file straight off the disk when the sidecar will not.
 *
 * The sidecar's directstream only plays files it has matched to an anime series: its
 * `PlayLocalFile` resolves the path against its own `local_files` table and refuses anything
 * without a media id — `abort-open local file has not been matched to a media: <path>`. That
 * made the media workspace anime-only: dramas, films, YouTube downloads and anything else the
 * user studies with showed an error screen instead of a video. The sidecar ships as a
 * prebuilt binary, so the rule cannot change there.
 *
 * The app already streams any library file through its own `playfile://` protocol (Range
 * requests, so seeking works — `main/media.ts`). This builds the VideoCore playback for that
 * URL. It carries no container subtitle tracks, which makes VideoCore pick its event-track
 * subtitle manager, and `VideoCoreStudyOverlay` then mounts the file's subtitle from
 * `subtitleForPath` exactly as it does for a matched file — so cues, transcript and mining
 * work the same way.
 *
 * `localFile.path` is set so the resume store keys this file identically to a directstream
 * open (`videoCoreResumeKey` prefers the path); the only other reader of `localFile` in the
 * adopted player is the stats panel's "File" label.
 */
import type {
  Anime_LocalFile,
  VideoCore_VideoPlaybackInfo,
} from '../../vendor/seanime/generated/types';

/**
 * Did the sidecar refuse this open because of what it knows about the FILE (not matched, not
 * in its table) rather than because something broke? Only those are worth routing around;
 * any other stated reason is a real failure and keeps its error screen.
 */
export function sidecarCannotServeFile(payload: unknown): boolean {
  if (typeof payload !== 'string') return false;
  return /not been matched to a media|could not find local file/i.test(payload);
}

function fileNameOf(filePath: string): string {
  const cut = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
  return cut >= 0 ? filePath.slice(cut + 1) : filePath;
}

export function directLocalPlaybackInfo(input: {
  requestId: number;
  localFilePath: string;
  streamUrl: string;
  startAtSec?: number;
}): VideoCore_VideoPlaybackInfo {
  const name = fileNameOf(input.localFilePath);
  return {
    id: `direct-${input.requestId}`,
    playbackType: 'localfile',
    streamUrl: input.streamUrl,
    streamPath: input.localFilePath,
    streamType: 'native',
    localFile: { path: input.localFilePath, name } as Anime_LocalFile,
    // The workspace owns continuity; there is no sidecar record for this file to restore from.
    disableRestoreFromContinuity: true,
    ...(input.startAtSec && input.startAtSec > 0
      ? { initialState: { currentTime: input.startAtSec } }
      : {}),
  };
}
