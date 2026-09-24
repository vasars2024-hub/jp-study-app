/**
 * The body of the "backup" card (audit robust #1). Replaces "Export all
 * settings" — a JSON of localStorage + IndexedDB + four host settings that the
 * UI called a "Full backup" while leaving out the library, the books and every
 * main-process store.
 *
 * The card id stays `backup` (gate-8 parity asserts the card set); only its
 * body changed. Everything user-visible goes through i18n.
 */
import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../../i18n';
import { LANG_TAGS } from '../../../../shared/i18n/core';
import { formatBytes } from '../../../../shared/assetRegistry';
import { confirmDialog } from '../../ui/dialogService';
import {
  applyRestore,
  backUpNow,
  backupAvailable,
  chooseRestoreFile,
  discardRestore,
  relaunchAfterRestore,
  type RestoreFailure,
} from '../../../storage/backupClient';
import type { BackupStatus } from '../../../../main/backup/backupService';

export function BackupControls() {
  const { t, lang } = useT();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [includeBooks, setIncludeBooks] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failures, setFailures] = useState<RestoreFailure[]>([]);
  const available = backupAvailable();

  const refresh = useCallback(async () => {
    try {
      setStatus((await window.api.backupStatus?.()) ?? null);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    if (available) void refresh();
  }, [available, refresh]);

  const date = (ms: number) => new Date(ms).toLocaleString(LANG_TAGS[lang]);

  async function onBackUp(): Promise<void> {
    setBusy(true);
    setMessage(t('settings.memory.backup.working'));
    setFailures([]);
    try {
      const r = await backUpNow(includeBooks);
      if (r.ok) setMessage(t('settings.memory.backup.saved', { path: r.path, size: formatBytes(r.bytes) }));
      else if ('cancelled' in r) setMessage('');
      else setMessage(r.tooLarge ? t('settings.memory.backup.tooLarge') : t('settings.memory.backup.failed', { error: r.error }));
      await refresh();
    } catch (err) {
      setMessage(t('settings.memory.backup.failed', { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  }

  async function onRestore(): Promise<void> {
    setBusy(true);
    setMessage('');
    setFailures([]);
    try {
      const chosen = await chooseRestoreFile();
      if (!chosen.ok) {
        if ('errors' in chosen) {
          setMessage(t('settings.memory.backup.invalid'));
          setFailures(chosen.errors.slice(0, 12).map((e) => ({ what: '', error: e })));
        }
        return;
      }
      const plan = chosen.plan;
      const message =
        plan.kind === 'archive'
          ? t('settings.memory.backup.confirmArchive', {
              date: date(Date.parse(plan.manifest.createdAt)),
              version: plan.manifest.appVersion,
              count: plan.files,
            }) + (plan.manifest.includesBookFiles ? '' : ` ${t('settings.memory.backup.confirmNoBooks')}`)
          : t('settings.memory.backup.confirmLegacy', {
              date: plan.exportedAt ? date(plan.exportedAt) : '—',
            });
      const ok = await confirmDialog({
        title: t('settings.memory.backup.confirmTitle'),
        message,
        confirmLabel: t('settings.memory.backup.restoreConfirm'),
        danger: true,
      });
      if (!ok) {
        if (plan.kind === 'archive') await discardRestore();
        return;
      }
      setMessage(t('settings.memory.backup.restoring'));
      const result = await applyRestore(plan);
      if (!result.ok) {
        setMessage(t('settings.memory.backup.restoreFailed'));
        setFailures(result.failures);
        return;
      }
      if (result.warnings.length) setFailures(result.warnings);
      setMessage(t('settings.memory.backup.restored'));
      if (result.needsRelaunch) await relaunchAfterRestore();
    } catch (err) {
      setMessage(t('settings.memory.backup.failed', { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  }

  if (!available) return <p className="fa-panel-note">{t('settings.memory.backup.unavailable')}</p>;

  return (
    <>
      <p className="fa-panel-note">{t('settings.memory.backupHint')}</p>
      <label className="fa-check">
        <input type="checkbox" checked={includeBooks} disabled={busy} onChange={(e) => setIncludeBooks(e.target.checked)} />
        {t('settings.memory.backup.includeBooks', {
          count: status?.bookFiles ?? 0,
          size: formatBytes(status?.bookBytes ?? 0),
        })}
      </label>
      <div className="fa-panel-actions">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void onBackUp()}>
          {t('settings.memory.backup.now')}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void onRestore()}>
          {t('settings.memory.backup.restore')}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void window.api.backupOpenFolder?.()}>
          {t('settings.memory.backup.openFolder')}
        </button>
      </div>
      <p className="fa-panel-note">
        {status?.lastAuto
          ? t('settings.memory.backup.autoLast', {
              date: date(status.lastAuto.at),
              size: formatBytes(status.lastAuto.bytes),
              count: status.autoCount,
            })
          : t('settings.memory.backup.autoNone')}
      </p>
      {message ? (
        <p className="fa-panel-note" role="status">
          {message}
        </p>
      ) : null}
      {failures.length ? (
        <ul className="fa-panel-note" role="alert">
          {failures.map((f, i) => (
            <li key={`${f.what}-${i}`}>{f.what ? `${f.what}: ${f.error}` : f.error}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export default BackupControls;
