import { useCallback, useState } from 'react';
import type { MediaItem } from '../../shared/types';
import { clearArtCache } from '../albumArt';
import { clearAllLiked } from '../likedSongs';
import { clearAllLyrics } from '../lyrics';
import * as player from '../playerBus';

type Props = {
  onItemsChange: (items: MediaItem[]) => void;
  /** Called after a full clear (e.g. to reset the video player). */
  onCleared?: () => void;
  className?: string;
};

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Wipe the library in one main-process call (stops watch folder + clears db + cache). */
async function clearLibrary(): Promise<MediaItem[]> {
  return window.api.clearMediaLibrary();
}

/** Drop entries whose source file no longer exists on disk. */
async function pruneMissingLibrary(): Promise<{ removed: number; items: MediaItem[] }> {
  return window.api.pruneMedia();
}

export default function MediaLibraryActions({ onItemsChange, onCleared, className }: Props) {
  const [status, setStatus] = useState('');
  const [statusError, setStatusError] = useState(false);
  const [busy, setBusy] = useState(false);

  const resetPlayback = useCallback(() => {
    player.stop();
    clearArtCache();
  }, []);

  const pruneMissing = useCallback(async () => {
    setBusy(true);
    setStatus('');
    setStatusError(false);
    try {
      const { removed, items: next } = await pruneMissingLibrary();
      onItemsChange(next);
      if (removed > 0) resetPlayback();
      setStatus(
        removed > 0
          ? `Removed ${removed} missing ${removed === 1 ? 'entry' : 'entries'}.`
          : 'No missing files — library is up to date.',
      );
    } catch (e) {
      setStatusError(true);
      setStatus(`Could not remove missing files: ${msg(e)}`);
    } finally {
      setBusy(false);
    }
  }, [onItemsChange, resetPlayback]);

  const clearAll = useCallback(async () => {
    if (
      !confirm(
        'Clear the entire media library?\n\nThis removes all saved videos and songs from the app, cached YouTube downloads, converted copies, and lyrics/likes. Your original files on disk are not deleted.',
      )
    ) {
      return;
    }
    setBusy(true);
    setStatus('Clearing…');
    setStatusError(false);
    try {
      const before = (await window.api.listMedia()).length;
      const next = await clearLibrary();
      clearAllLiked();
      clearAllLyrics();
      resetPlayback();
      onItemsChange(next);
      onCleared?.();
      if (next.length > 0) {
        setStatusError(true);
        setStatus(`Could not clear everything — ${next.length} of ${before} entries remain. Restart the app and try again.`);
      } else {
        setStatus(before > 0 ? `Library cleared (${before} removed).` : 'Library is already empty.');
      }
    } catch (e) {
      setStatusError(true);
      setStatus(`Could not clear library: ${msg(e)}`);
    } finally {
      setBusy(false);
    }
  }, [onCleared, onItemsChange, resetPlayback]);

  return (
    <div className={`media-lib-actions ${className ?? ''}`}>
      <button
        className="btn small"
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          void pruneMissing();
        }}
        title="Remove entries whose files moved or were deleted"
      >
        {busy ? 'Working…' : 'Remove missing'}
      </button>
      <button
        className="btn small media-lib-clear"
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          void clearAll();
        }}
        title="Clear all media library data"
      >
        {busy ? 'Clearing…' : 'Clear library'}
      </button>
      {status && (
        <span className={`media-lib-actions-status ${statusError ? 'media-lib-actions-err' : 'muted'}`}>
          {status}
        </span>
      )}
    </div>
  );
}
