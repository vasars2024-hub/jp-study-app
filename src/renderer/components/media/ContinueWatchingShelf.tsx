/**
 * The Media Center Home's "Continue watching" shelf.
 *
 * It used to read one store: `MediaItem.positionSec`, which only the retired inline player
 * wrote. Everything watched since then plays in the media workspace, which records where
 * you stopped in `jp-video-core-resume-v1` — so after three episodes the shelf still said
 * "Nothing in progress yet" while the player itself knew all three positions.
 *
 * Nothing new is joined here. `readContinueWatching` already bridges the two stores (the
 * workspace keys by `file:<lower-cased path>`, the library by item id and real path; both
 * meet on `studyLibraryPathKey`), drops files that are finished or barely started, and
 * sorts newest first — the same list the desktop widget and the command palette show, so
 * the three surfaces cannot disagree about what is in progress.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  onMediaWorkspaceOpenChanged,
  type MediaWorkspaceOpenRequest,
} from '../../../shared/mediaWorkspace';
import {
  continueWatchingResumeSec,
  formatContinueWatchingPosition,
  type ContinueWatchingEntry,
} from '../../../shared/seanimeContinueWatching';
import { studyLibraryPathIndex } from '../../../shared/seanimeStudyLibrary';
import type { MediaItem } from '../../../shared/types';
import { readContinueWatching } from '../../continueWatchingStore';
import { useT } from '../../i18n';
import Icon from '../Icons';
import MediaArtwork from './library/MediaArtwork';

export interface ContinueWatchingRow {
  entry: ContinueWatchingEntry;
  /** The library item for the same file, when Study OS has one: artwork, episode, kind. */
  item?: MediaItem;
}

/** Every in-progress file, newest first, each paired with its library item if any. */
export function continueWatchingRows(items: readonly MediaItem[]): ContinueWatchingRow[] {
  const byPath = studyLibraryPathIndex(items);
  return readContinueWatching(items).map((entry) => {
    const item = byPath.get(entry.pathKey);
    return item ? { entry, item } : { entry };
  });
}

/**
 * `continueWatchingRows`, re-read whenever the stored positions may have moved.
 *
 * The workspace writes while it plays, and this view stays mounted underneath its overlay,
 * so closing the overlay is the moment the list goes stale. `storage` covers a player
 * pop-out writing from its own window; `focus` covers anything else that happened while
 * the app was in the background.
 */
export function useContinueWatchingRows(items: readonly MediaItem[]): ContinueWatchingRow[] {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const bump = (): void => setRevision((n) => n + 1);
    const offWorkspace = onMediaWorkspaceOpenChanged(bump);
    window.addEventListener('storage', bump);
    window.addEventListener('focus', bump);
    return () => {
      offWorkspace();
      window.removeEventListener('storage', bump);
      window.removeEventListener('focus', bump);
    };
  }, []);
  // `revision` is the dependency that re-reads localStorage; the list itself is not state.
  return useMemo(() => continueWatchingRows(items), [items, revision]);
}

/** The open request that resumes a row — the same shape the widget and palette dispatch. */
export function continueWatchingOpenRequest(
  entry: ContinueWatchingEntry,
): MediaWorkspaceOpenRequest {
  return {
    localFilePath: entry.localFilePath,
    startAtSec: continueWatchingResumeSec(entry),
  };
}

/** `S2 E05` / `E05` for the artwork corner, or null when the item has no episode. */
export function mediaEpisodeBadge(item: MediaItem | undefined): string | null {
  if (item?.episode == null) return null;
  const season = item.season != null && item.season !== 1 ? `S${item.season} ` : '';
  return `${season}E${String(item.episode).padStart(2, '0')}`;
}

export function ContinueWatchingTile({
  row,
  active,
  onResume,
}: {
  row: ContinueWatchingRow;
  active?: boolean;
  onResume: (row: ContinueWatchingRow) => void;
}) {
  const { t } = useT();
  const { entry, item } = row;
  const time = formatContinueWatchingPosition(entry.positionSec);
  // Only where a duration was measured — the workspace store records a position and
  // nothing else, and a bar with an invented denominator would be a claim, not a fact.
  const percent = entry.percent != null ? Math.round(entry.percent * 100) : null;
  const episode = mediaEpisodeBadge(item);
  return (
    <button
      type="button"
      className={`mc-media-tile${active ? ' is-active' : ''}`}
      onClick={() => onResume(row)}
      // The path tells apart two episodes that share a display title; the accessible name
      // is the widget's own sentence, so one action is described one way in both places.
      title={entry.localFilePath}
      aria-label={t('widgets.continueWatching.resumeNamed', { title: entry.title, time })}
    >
      <MediaArtwork id={item?.id ?? null} title={entry.title} variant="poster" decorative>
        <span className="mc-tile-play"><Icon name="player" size={15} /></span>
        {episode && <span className="mc-tile-episode">{episode}</span>}
        {percent != null && percent > 0 && (
          <span className="mc-tile-progress"><i style={{ width: `${percent}%` }} /></span>
        )}
      </MediaArtwork>
      <span className="mc-tile-copy">
        {/* Study content: the title is shown verbatim, never translated. */}
        <strong>{entry.title}</strong>
        <small>
          {percent != null
            ? t('mediaCenter.home.resumeAtPercent', { time, percent })
            : t('palette.continueWatchingAt', { time })}
        </small>
      </span>
    </button>
  );
}
