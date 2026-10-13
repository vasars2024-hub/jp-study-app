/**
 * The Library import job, out loud: a progress bar with Stop while it runs,
 * a receipt when it ends (added / already in the library / not imported, with
 * the failing file names), and Resume for an import that a quit, crash or
 * Stop left unfinished.
 *
 * Main owns the job (`main/libraryImportJob.ts`) and broadcasts every step on
 * `library:importProgress`; this only listens and asks for the current state
 * on mount, so a window opened mid-import shows the import too.
 */
import { useCallback, useEffect, useState } from 'react';
import type { LibraryImportFailureCode, LibraryImportProgress } from '../../../shared/libraryManage';
import { Button } from '../ui';

type T = (key: string, vars?: Record<string, string | number>) => string;

const FAILURE_KEY: Readonly<Record<LibraryImportFailureCode, string>> = {
  unreadable: 'libManage.import.fail.unreadable',
  'no-pages': 'libManage.import.fail.noPages',
  'storage-full': 'libManage.import.fail.storageFull',
  'bad-file': 'libManage.import.fail.badFile',
};

export default function LibraryImportStatus({ t }: { t: T }) {
  const [progress, setProgress] = useState<LibraryImportProgress | null>(null);
  const [resumable, setResumable] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  const refresh = useCallback(() => {
    void window.api?.libraryImportStatus?.()
      .then((status) => {
        if (!status) return;
        setProgress(status.progress);
        setResumable(status.resumable);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const unsub = window.api?.onLibraryImportProgress?.((next) => {
      setProgress(next);
      if (next.state !== 'running') {
        setStopping(false);
        refresh();
      }
    });
    return () => unsub?.();
  }, [refresh]);

  const stop = async () => {
    if (!progress) return;
    setStopping(true);
    const accepted = await window.api?.libraryImportCancel?.(progress.jobId).catch(() => false);
    if (!accepted) setStopping(false);
  };

  const resume = async () => {
    setDismissed(null);
    setResumable(0);
    await window.api?.libraryImportResume?.().catch(() => undefined);
    refresh();
  };

  const discard = async () => {
    await window.api?.libraryImportDiscard?.().catch(() => undefined);
    if (progress) setDismissed(progress.jobId);
    setResumable(0);
  };

  if (progress?.state === 'running') {
    return (
      <section className="lib-import-status" role="status" aria-label={t('libManage.import.aria')} data-import-state="running">
        <div className="lib-import-status__line">
          <span>{t('libManage.import.running', { done: progress.done, total: progress.total })}</span>
          <progress max={Math.max(1, progress.total)} value={progress.done} />
          <Button size="sm" disabled={stopping} onClick={() => void stop()}>
            {t('libManage.import.stop')}
          </Button>
        </div>
        <div className="lib-import-status__sub muted">
          {stopping
            ? t('libManage.import.stopping')
            : progress.current
              ? t('libManage.import.current', { name: progress.current })
              : null}
        </div>
      </section>
    );
  }

  if (progress && progress.jobId !== dismissed && progress.done > 0) {
    const stopped = progress.state === 'cancelled';
    return (
      <section className="lib-import-status" role="status" aria-label={t('libManage.import.aria')} data-import-state={progress.state}>
        <div className="lib-import-status__line">
          <strong>{stopped ? t('libManage.import.stopped') : t('libManage.import.finished')}</strong>
          <span>{t('libManage.import.added', { count: progress.imported })}</span>
          {progress.duplicates > 0 && <span>{t('libManage.import.duplicates', { count: progress.duplicates })}</span>}
          {progress.failed > 0 && <span>{t('libManage.import.failed', { count: progress.failed })}</span>}
          {progress.remaining > 0 && <span>{t('libManage.import.left', { count: progress.remaining })}</span>}
          <span className="lib-import-status__spacer" />
          {stopped && resumable > 0 && (
            <Button size="sm" variant="primary" onClick={() => void resume()}>
              {t('libManage.import.resume')}
            </Button>
          )}
          <Button size="sm" onClick={() => (stopped && resumable > 0 ? void discard() : setDismissed(progress.jobId))}>
            {stopped && resumable > 0 ? t('libManage.import.discard') : t('libManage.import.dismiss')}
          </Button>
        </div>
        {progress.failures.length > 0 && (
          <details className="lib-import-status__failures">
            <summary>{t('libManage.import.failuresTitle')}</summary>
            <ul>
              {progress.failures.map((failure, index) => (
                <li key={`${index}:${failure.name}`}>{t(FAILURE_KEY[failure.errorCode] ?? FAILURE_KEY['bad-file'], { name: failure.name })}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
    );
  }

  if (resumable > 0) {
    return (
      <section className="lib-import-status" role="status" aria-label={t('libManage.import.aria')} data-import-state="resumable">
        <div className="lib-import-status__line">
          <span>{t('libManage.import.resumable', { count: resumable })}</span>
          <span className="lib-import-status__spacer" />
          <Button size="sm" variant="primary" onClick={() => void resume()}>
            {t('libManage.import.resume')}
          </Button>
          <Button size="sm" onClick={() => void discard()}>
            {t('libManage.import.discard')}
          </Button>
        </div>
      </section>
    );
  }

  return null;
}
