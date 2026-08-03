import { useMemo, useState } from 'react';
import type { VisualNovelDatabase, VisualNovelDiscoveryCandidate } from '../../../shared/visualNovel';

export default function VisualNovelImportPanel({
  onImported,
  onStatus,
}: {
  onImported: (database: VisualNovelDatabase) => void;
  onStatus: (message: string, error?: boolean) => void;
}) {
  const [candidates, setCandidates] = useState<VisualNovelDiscoveryCandidate[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const selectedCount = useMemo(
    () => candidates.filter((candidate) => selectedPaths.has(candidate.installPath)).length,
    [candidates, selectedPaths],
  );

  const scan = async (): Promise<void> => {
    setBusy(true);
    onStatus('Scanning the selected folder…');
    try {
      const found = await window.api.visualNovelDiscoverFolder();
      setCandidates(found);
      setSelectedPaths(new Set(
        found.filter((candidate) => !candidate.alreadyImported).map((candidate) => candidate.installPath),
      ));
      onStatus(found.length
        ? `Found ${found.length} possible visual novel installation${found.length === 1 ? '' : 's'}.`
        : 'No visual novel installations were detected in that folder.');
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
      onStatus(response.error ?? 'The selected installations could not be imported.', true);
      return;
    }
    onImported(response.database);
    setCandidates((current) => current.map((candidate) => (
      selectedPaths.has(candidate.installPath) ? { ...candidate, alreadyImported: true } : candidate
    )));
    setSelectedPaths(new Set());
    onStatus(`Imported ${response.imported ?? 0} visual novel${response.imported === 1 ? '' : 's'}.`);
  };

  const exportLibrary = async (): Promise<void> => {
    setBusy(true);
    const response = await window.api.visualNovelExportLibrary();
    setBusy(false);
    if (response.canceled) return;
    onStatus(
      response.ok ? `Library exported to ${response.path}.` : response.error ?? 'Library export failed.',
      !response.ok,
    );
  };

  const importLibrary = async (): Promise<void> => {
    setBusy(true);
    const response = await window.api.visualNovelImportLibrary();
    setBusy(false);
    if (response.canceled) return;
    if (!response.ok || !response.database) {
      onStatus(response.error ?? 'Library import failed.', true);
      return;
    }
    onImported(response.database);
    onStatus(
      `Imported ${response.addedEntries ?? 0} new entries and ${response.addedCaptures ?? 0} captured lines.`,
    );
  };

  return (
    <section className="visual-novel-import" aria-label="Local visual novel discovery">
      <div className="visual-novel-reading-head">
        <strong>Local discovery</strong>
        <div>
          <button type="button" disabled={busy} onClick={() => void importLibrary()}>Import JSON</button>
          <button type="button" disabled={busy} onClick={() => void exportLibrary()}>Export JSON</button>
          <button type="button" disabled={busy} onClick={() => void scan()}>
            {busy ? 'Working…' : 'Scan folder'}
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
                  aria-label={`Import ${candidate.title}`}
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
                    aria-label={`Title for ${candidate.installPath}`}
                    onChange={(event) => updateCandidate(candidate.installPath, { title: event.target.value })}
                  />
                  <small>{candidate.engine} · {candidate.executablePath}</small>
                </div>
                <span>{candidate.alreadyImported ? 'In library' : 'Ready'}</span>
              </article>
            ))}
          </div>
          <button type="button" disabled={!selectedCount || busy} onClick={() => void importSelected()}>
            Import selected ({selectedCount})
          </button>
        </>
      )}
    </section>
  );
}
