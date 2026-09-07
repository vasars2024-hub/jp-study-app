import { useMemo, useState } from 'react';
import { useT } from '../../i18n';
import type { VisualNovelDatabase, VisualNovelDiscoveryCandidate } from '../../../shared/visualNovel';

export default function VisualNovelImportPanel({
  onImported,
  onStatus,
}: {
  onImported: (database: VisualNovelDatabase) => void;
  onStatus: (message: string, error?: boolean) => void;
}) {
  const { t } = useT();
  const [candidates, setCandidates] = useState<VisualNovelDiscoveryCandidate[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const selectedCount = useMemo(
    () => candidates.filter((candidate) => selectedPaths.has(candidate.installPath)).length,
    [candidates, selectedPaths],
  );

  const scan = async (): Promise<void> => {
    setBusy(true);
    onStatus(t('vnImport.msg.scanning'));
    try {
      const found = await window.api.visualNovelDiscoverFolder();
      setCandidates(found);
      setSelectedPaths(new Set(
        found.filter((candidate) => !candidate.alreadyImported).map((candidate) => candidate.installPath),
      ));
      onStatus(found.length
        ? t('vnImport.msg.found', { count: found.length })
        : t('vnImport.msg.noneFound'));
    } catch (reason) {
      onStatus(reason instanceof Error ? reason.message : String(reason), true);
    } finally {
      setBusy(false);
    }
  };

  const updateCandidate = (
    installPath: string,
    patch: Partial<VisualNovelDiscoveryCandidate>,
  ): void => {
    setCandidates((current) => current.map((candidate) => (
      candidate.installPath === installPath ? { ...candidate, ...patch } : candidate
    )));
  };

  const importSelected = async (): Promise<void> => {
    const chosen = candidates.filter((candidate) => (
      selectedPaths.has(candidate.installPath) && !candidate.alreadyImported
    ));
    if (!chosen.length) return;
    setBusy(true);
    const response = await window.api.visualNovelImportDiscovered(chosen.map((candidate) => ({
      title: candidate.title,
      installPath: candidate.installPath,
      executablePath: candidate.executablePath,
      engine: candidate.engine,
      language: candidate.language,
    })));
    setBusy(false);
    if (!response.ok || !response.database) {
      onStatus(response.error ?? t('vnImport.msg.importFailed'), true);
      return;
    }
    onImported(response.database);
    setCandidates((current) => current.map((candidate) => (
      selectedPaths.has(candidate.installPath) ? { ...candidate, alreadyImported: true } : candidate
    )));
    setSelectedPaths(new Set());
    onStatus(t('vnImport.msg.imported', { count: response.imported ?? 0 }));
  };

  const exportLibrary = async (): Promise<void> => {
    setBusy(true);
    const response = await window.api.visualNovelExportLibrary();
    setBusy(false);
    if (response.canceled) return;
    // `response.path` is absent on some success branches, and the template
    // literal this replaces printed "exported to undefined." there.
    const exported = response.path
      ? t('vnImport.msg.exported', { path: response.path })
      : t('vnImport.msg.exportedOk');
    onStatus(
      response.ok ? exported : response.error ?? t('vnImport.msg.exportFailed'),
      !response.ok,
    );
  };

  const importLibrary = async (): Promise<void> => {
    setBusy(true);
    const response = await window.api.visualNovelImportLibrary();
    setBusy(false);
    if (response.canceled) return;
    if (!response.ok || !response.database) {
      onStatus(response.error ?? t('vnImport.msg.libraryImportFailed'), true);
      return;
    }
    onImported(response.database);
    onStatus(t('vnImport.msg.libraryImported', {
      entries: response.addedEntries ?? 0,
      captures: response.addedCaptures ?? 0,
    }));
  };

  return (
    <section className="visual-novel-import" aria-label={t('vnImport.aria.section')}>
      <div className="visual-novel-reading-head">
        <strong>{t('vnImport.head')}</strong>
        <div>
          <button type="button" disabled={busy} onClick={() => void importLibrary()}>{t('vnImport.importJson')}</button>
          <button type="button" disabled={busy} onClick={() => void exportLibrary()}>{t('vnImport.exportJson')}</button>
          <button type="button" disabled={busy} onClick={() => void scan()}>
            {busy ? t('vnImport.working') : t('vnImport.scanFolder')}
          </button>
        </div>
      </div>
      {candidates.length > 0 && (
        <>
          <div className="visual-novel-import-list">
            {candidates.map((candidate) => (
              <article key={candidate.installPath} className={candidate.alreadyImported ? 'is-imported' : ''}>
                <input
                  type="checkbox"
                  aria-label={t('vnImport.aria.import', { title: candidate.title })}
                  checked={selectedPaths.has(candidate.installPath)}
                  disabled={candidate.alreadyImported || busy}
                  onChange={(event) => setSelectedPaths((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(candidate.installPath);
                    else next.delete(candidate.installPath);
                    return next;
                  })}
                />
                <div>
                  <input
                    value={candidate.title}
                    disabled={candidate.alreadyImported || busy}
                    aria-label={t('vnImport.aria.titleFor', { path: candidate.installPath })}
                    onChange={(event) => updateCandidate(candidate.installPath, { title: event.target.value })}
                  />
                  <small>{candidate.engine} · {candidate.executablePath}</small>
                </div>
                <span>{candidate.alreadyImported ? t('vnImport.inLibrary') : t('vnImport.ready')}</span>
              </article>
            ))}
          </div>
          <button type="button" disabled={!selectedCount || busy} onClick={() => void importSelected()}>
            {t('vnImport.importSelected', { count: selectedCount })}
          </button>
        </>
      )}
    </section>
  );
}
