/**
 * "Read the screen" for the frame the player is on — the video half of the
 * shared ReadingLens capture pipeline.
 *
 * The lens is a separate always-on-top window main creates, so there are no
 * props to pass it. Every producer parks a `LensCaptureTarget` in the
 * `localStorage` slot the two renderers share, exactly the way
 * `MangaReader.tsx`, `VisualNovelPanel.tsx` and `ImmersionContent.tsx` do; the
 * media workspace mounts inside `App.tsx`, so it is the same origin and the
 * same slot.
 *
 * Why a video needs the lens at all, given it already has a subtitle track:
 * a cue only carries what the track author typed. Burned-in signs, menus,
 * shop fronts, handwritten notes and hardsubbed karaoke are pixels, and the
 * mining panel cannot mine what the track does not contain. That is precisely
 * what OCR over the screen reads.
 *
 * A separate component rather than more lines inside `VideoCoreMiningPanel`,
 * for the reason `MediaCueAgentHandoffButton` records above it: that panel
 * carries another track's uncommitted work, so what this slice adds there has
 * to stay small enough to reconstruct against `HEAD` byte-for-byte.
 *
 * DECISION — the id is namespaced. `VideoCoreMiningSource.mediaId` is an
 * **AniList** id, while `MediaStudyMode` speaks in media-library item ids.
 * Writing one raw into a field the other also writes to would make two
 * different things indistinguishable in a stored ref, so this producer emits
 * `anilist:<id>` and a library producer would emit `library:<id>`. Same
 * refusal to overstate identity the agent handoff button makes one file over.
 *
 * Provenance only, no save-back: a video is not a store this app writes lines
 * into. The cue-level save is the mining panel's, and it is already there.
 */

import {
  buildVideoCaptureTarget,
  LENS_CAPTURE_TARGET_KEY,
} from '../shared/lensCaptureTarget';
import type { VideoCoreMiningSource } from '../shared/videoCoreMining';
import { useT } from '../renderer/i18n';

/** The name a player itself shows for a loose file: the basename, no path. */
function looseFileName(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut === -1 ? path : path.slice(cut + 1);
}

/**
 * What the capture record will say this frame came from, or `''` when nothing
 * here can name it — the contract drops a target with no title, so an
 * unnameable source is refused in front of the lens rather than behind it.
 */
export function videoCaptureTitleOf(source: VideoCoreMiningSource): string {
  if (source.mediaTitle) return source.mediaTitle;
  if (source.localFilePath) return looseFileName(source.localFilePath);
  return source.playbackId || '';
}

export default function MediaLensCaptureButton({
  source,
  video,
}: {
  source: VideoCoreMiningSource;
  /** `null` while nothing is playing — then there is no position to record. */
  video: HTMLVideoElement | null;
}) {
  const { t } = useT();
  const title = videoCaptureTitleOf(source);

  // Not a `useCallback`: it reads nothing that would go stale, and the sibling
  // button records why depending on `t` is the way to go stale on a language
  // switch. A plain function reads the current `t` on every click.
  const capture = async (): Promise<void> => {
    if (!title) return;
    localStorage.setItem(LENS_CAPTURE_TARGET_KEY, JSON.stringify(buildVideoCaptureTarget({
      mediaId: source.mediaId == null ? '' : `anilist:${source.mediaId}`,
      title,
      episode: source.episodeNumber == null ? '' : String(source.episodeNumber),
      // `currentTime` is the only field that makes one capture from a two-hour
      // file distinguishable from the next; the contract floors it to whole
      // seconds and drops anything that is not a place in a file.
      positionSec: video ? video.currentTime : '',
    })));
    await window.api.lensOpen('select');
  };

  return (
    <button
      type="button"
      data-study-action="lens-capture"
      disabled={!title}
      title={title ? t('mediaWorkspace.mining.lensHint') : t('mediaWorkspace.mining.lensNeedsMedia')}
      onClick={() => void capture()}
    >
      {t('mediaWorkspace.mining.lens')}
    </button>
  );
}
