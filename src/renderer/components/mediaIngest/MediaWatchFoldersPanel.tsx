/**
 * Watch folders and "import finished downloads automatically" — the settings
 * half of `main/mediaIngest.ts`.
 *
 * Deliberately small: one switch, the folder list (the automatically-added
 * ones marked, every one removable), and a line saying what qBittorrent is
 * doing. It renders inside the Media Center's Library settings and borrows that
 * section's row and toggle styling, so it reads as part of it.
 */

import { useCallback, useEffect, useState } from 'react';
import type { MediaIngestFolderState, MediaIngestState } from '../../../shared/mediaIngest';
import { useT } from '../../i18n';
import Icon from '../Icons';
import './mediaWatchFolders.css';

function folderName(folder: string): string {
  const parts = folder.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? folder;
}

const QBIT_LINE: Record<MediaIngestState['qbit']['status'], string | null> = {
  off: null,
  'not-configured': 'mediaIngest.qbit.notConfigured',
  watching: 'mediaIngest.qbit.watching',
  unreachable: 'mediaIngest.qbit.unreachable',
  unauthorized: 'mediaIngest.qbit.unauthorized',
};

export default function MediaWatchFoldersPanel() {
  const { t } = useT();
  const [state, setState] = useState<MediaIngestState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const api = window.api;
    if (typeof api?.mediaIngestState !== 'function') return undefined;
    let alive = true;
    void api.mediaIngestState()
      .then((next) => {
        if (alive) setState(next);
      })
      .catch(() => undefined);
    const off = typeof api.onMediaIngestState === 'function'
      ? api.onMediaIngestState((next) => setState(next))
      : undefined;
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  const run = useCallback(async (action: () => Promise<MediaIngestState>) => {
    setBusy(true);
    try {
      setState(await action());
    } catch {
      // The next state broadcast corrects the panel; nothing here to report.
    } finally {
      setBusy(false);
    }
  }, []);

  if (!state) return null;
  const qbitLine = QBIT_LINE[state.qbit.status];

  const detailOf = (folder: MediaIngestFolderState): string => {
    if (!folder.exists) return t('mediaIngest.folderMissing');
    if (!folder.active) return t('mediaIngest.folderPaused');
    return folder.origin === 'user' ? '' : t(`mediaIngest.origin.${folder.origin}`);
  };

  return (
    <div className="mi-panel">
      <label className="mc-toggle">
        <span>
          <strong>{t('mediaIngest.autoImport')}</strong>
          <small>{t('mediaIngest.autoImportDetail')}</small>
        </span>
        <input
          type="checkbox"
          checked={state.autoImport}
          disabled={busy}
          onChange={(event) => {
            const on = event.target.checked;
            void run(() => window.api.mediaIngestSetAutoImport(on));
          }}
        />
        <i aria-hidden="true" />
      </label>
      {state.autoImport && qbitLine ? (
        <p className="mc-setting-note mi-qbit" role="status">{t(qbitLine)}</p>
      ) : null}
      {state.autoImport && (state.qbit.unresolved ?? 0) > 0 ? (
        <p className="mc-setting-note mi-qbit" role="status">
          {t('scraperFix.qbit.unresolved', { count: state.qbit.unresolved ?? 0 })}
        </p>
      ) : null}

      <div className="mi-folders-head">
        <strong>{t('mediaIngest.folders')}</strong>
        <small>{t('mediaIngest.foldersDetail')}</small>
      </div>
      {state.folders.length === 0 ? (
        <p className="mc-setting-note">{t('mediaIngest.noFolders')}</p>
      ) : (
        <ul className="mi-folder-list">
          {state.folders.map((folder) => {
            const name = folderName(folder.path);
            const detail = detailOf(folder);
            return (
              <li
                key={folder.path}
                className={`mi-folder${folder.active && folder.exists ? '' : ' is-idle'}${folder.origin === 'user' ? '' : ' is-auto'}`}
              >
                <Icon name={folder.origin === 'user' ? 'folder' : 'download'} size={13} />
                <span className="mi-folder-text" title={folder.path}>
                  <strong>{name}</strong>
                  <small>{folder.path}</small>
                  {detail ? <em>{detail}</em> : null}
                </span>
                <button
                  type="button"
                  className="mi-folder-remove"
                  disabled={busy}
                  aria-label={t('mediaIngest.removeFolder', { name })}
                  title={t('mediaIngest.removeFolder', { name })}
                  onClick={() => void run(() => window.api.mediaIngestRemoveFolder(folder.path))}
                >
                  <Icon name="close" size={11} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mc-settings-actions">
        <button type="button" disabled={busy} onClick={() => void run(() => window.api.mediaIngestAddFolder())}>
          <Icon name="plus" size={12} /> {t('mediaIngest.addFolder')}
        </button>
        <button
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void run(() => window.api.mediaIngestRescan())}
        >
          <Icon name="refresh" size={12} /> {t('mediaIngest.rescan')}
        </button>
      </div>
    </div>
  );
}
