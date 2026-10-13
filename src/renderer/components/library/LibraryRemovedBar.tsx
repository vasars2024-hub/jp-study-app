/**
 * Remove's safety net on the shelf: an Undo bar for the item just removed,
 * and "Recently removed" — every item still in the library trash, each with
 * Restore, plus "Move all to the Recycle Bin" for reclaiming the space.
 *
 * Restore goes through main (`library:restore`), which puts the folder and
 * the record back under the same id, so progress, highlights and mined-card
 * links return with it. Main also broadcasts the restored library, so the
 * shelf updates even without `onRestored`.
 */
import { useCallback, useEffect, useState } from 'react';
import type { LibraryItem } from '../../../shared/types';
import type { LibraryTrashSummary } from '../../../shared/libraryManage';
import { LANG_TAGS, type UiLang } from '../../../shared/i18n/core';
import { Button, confirmDialog } from '../ui';
import Icon from '../Icons';

type T = (key: string, vars?: Record<string, string | number>) => string;

export interface LibraryRemovedNotice {
  id: string;
  title: string;
}

interface Props {
  t: T;
  lang: UiLang;
  /** The item the user just removed, for the Undo bar; null hides the bar. */
  lastRemoved: LibraryRemovedNotice | null;
  onDismissLast: () => void;
  onRestored: (items: LibraryItem[], item: LibraryItem) => void;
  /** Bumped by the shelf after a removal, so the list re-reads the trash. */
  refreshKey: number;
}

export default function LibraryRemovedBar({ t, lang, lastRemoved, onDismissLast, onRestored, refreshKey }: Props) {
  const [trash, setTrash] = useState<LibraryTrashSummary[]>([]);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  const reload = useCallback(() => {
    void window.api?.listLibraryTrash?.()
      .then((list) => setTrash(Array.isArray(list) ? list : []))
      .catch(() => setTrash([]));
  }, []);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  const restore = async (id: string) => {
    setWorking(true);
    setError('');
    try {
      const result = await window.api?.restoreLibraryItem?.(id);
      if (result?.ok) {
        onRestored(result.items, result.item);
        if (lastRemoved?.id === id) onDismissLast();
      } else if (result && result.errorCode !== 'conflict') {
        setError(t('libManage.trash.restoreFailed'));
      } else if (lastRemoved?.id === id) {
        // Already back (another window undid it): nothing left to undo.
        onDismissLast();
      }
    } catch {
      setError(t('libManage.trash.restoreFailed'));
    } finally {
      setWorking(false);
      reload();
    }
  };

  const releaseAll = async () => {
    const ok = await confirmDialog({
      title: t('libManage.trash.releaseTitle'),
      message: t('libManage.trash.releaseMessage'),
      confirmLabel: t('libManage.trash.release'),
      danger: true,
    });
    if (!ok) return;
    setWorking(true);
    setError('');
    try {
      const result = await window.api?.releaseLibraryTrash?.();
      if (result && result.remaining > 0) setError(t('libManage.trash.releaseFailed'));
      if (lastRemoved) onDismissLast();
    } catch {
      setError(t('libManage.trash.releaseFailed'));
    } finally {
      setWorking(false);
      reload();
    }
  };

  const dateFormat = new Intl.DateTimeFormat(LANG_TAGS[lang], { dateStyle: 'medium' });

  if (!lastRemoved && !trash.length && !error) return null;

  return (
    <div className="lib-removed">
      {lastRemoved && (
        <div className="lib-removed__undo" role="status">
          <span>{t('libManage.remove.done', { title: lastRemoved.title })}</span>
          <Button size="sm" variant="primary" disabled={working} onClick={() => void restore(lastRemoved.id)}>
            {t('libManage.remove.undo')}
          </Button>
          <Button size="sm" variant="ghost" aria-label={t('common.close')} onClick={onDismissLast}>
            <Icon name="close" size={12} />
          </Button>
        </div>
      )}
      {error && (
        <div className="lib-removed__error" role="alert">
          {error}
        </div>
      )}
      {trash.length > 0 && (
        <details className="lib-removed__list">
          <summary>{t('libManage.trash.summary', { count: trash.length })}</summary>
          <ul>
            {trash.map((entry) => (
              <li key={entry.id}>
                <span className="lib-removed__title" title={entry.title}>
                  {entry.title}
                </span>
                <span className="muted">{t('libManage.trash.keptUntil', { date: dateFormat.format(entry.expiresAt) })}</span>
                <Button
                  size="sm"
                  disabled={working}
                  aria-label={t('libManage.trash.restoreNamed', { title: entry.title })}
                  onClick={() => void restore(entry.id)}
                >
                  {t('libManage.trash.restore')}
                </Button>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="danger" disabled={working} onClick={() => void releaseAll()}>
            {t('libManage.trash.release')}
          </Button>
        </details>
      )}
    </div>
  );
}
