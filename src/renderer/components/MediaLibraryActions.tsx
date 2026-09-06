import { useCallback, useState } from 'react';
import { confirmDialog } from './ui';
import { useT } from '../i18n';
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
  const { t, lang } = useT();
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
          ? t('mediaLib.prune.removed', { count: removed })
          : t('mediaLib.prune.none'),
      );
    } catch (e) {
      setStatusError(true);
      setStatus(t('mediaLib.prune.failed', { error: msg(e) }));
    } finally {
      setBusy(false);
    }
    // `lang` and not `t`: t's identity is stable by design, so a callback that
    // omits it keeps resolving in the language it was created in.
  }, [onItemsChange, resetPlayback, t, lang]);

  const clearAll = useCallback(async () => {
    const ok = await confirmDialog({
      title: t('mediaLib.clear.title'),
      message: t('mediaLib.clear.message'),
      confirmLabel: t('mediaLib.clear.confirm'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setStatus(t('mediaLib.clearing'));
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
        setStatus(t('mediaLib.clear.partial', { remaining: next.length, before }));
      } else {
        setStatus(
          before > 0
            ? t('mediaLib.clear.done', { count: before })
            : t('mediaLib.clear.alreadyEmpty'),
        );
      }
    } catch (e) {
      setStatusError(true);
      setStatus(t('mediaLib.clear.failed', { error: msg(e) }));
    } finally {
      setBusy(false);
    }
  }, [onCleared, onItemsChange, resetPlayback, t, lang]);

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
        title={t('mediaLib.pruneTitle')}
      >
        {busy ? t('mediaLib.working') : t('mediaLib.pruneBtn')}
      </button>
      <button
        className="btn small media-lib-clear"
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          void clearAll();
        }}
        title={t('mediaLib.clearTitle')}
      >
        {busy ? t('mediaLib.clearing') : t('mediaLib.clearBtn')}
      </button>
      {status && (
        <span className={`media-lib-actions-status ${statusError ? 'media-lib-actions-err' : 'muted'}`}>
          {status}
        </span>
      )}
    </div>
  );
}
