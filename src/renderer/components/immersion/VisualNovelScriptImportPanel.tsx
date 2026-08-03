import { useMemo, useState } from 'react';
import type { VisualNovelDatabase, VisualNovelEntry } from '../../../shared/visualNovel';
import type { VisualNovelScriptLine } from '../../../shared/visualNovelScriptExtraction';

export default function VisualNovelScriptImportPanel({
  entry,
  onImported,
  onStatus,
}: {
  entry: VisualNovelEntry;
  onImported: (database: VisualNovelDatabase) => void;
  onStatus: (message: string, error?: boolean) => void;
}) {
  const [lines, setLines] = useState<VisualNovelScriptLine[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const selectedLines = useMemo(
    () => lines.filter((line) => selected.has(line.id)),
    [lines, selected],
  );

  const chooseScripts = async (): Promise<void> => {
    setBusy(true);
    const response = await window.api.visualNovelPickScripts(entry.id);
    setBusy(false);
    if (response.canceled) return;
    if (!response.ok) {
      onStatus(response.error ?? 'Script extraction failed.', true);
      return;
    }
    const next = response.lines ?? [];
    setLines(next);
    setSelected(new Set(next.map((line) => line.id)));
    onStatus(next.length
      ? `Extracted ${next.length} Japanese lines for review.`
      : 'No Japanese dialogue was found in the selected scripts.');
  };

  const importLines = async (): Promise<void> => {
    if (!selectedLines.length) return;
    setBusy(true);
    const response = await window.api.visualNovelImportScriptLines(entry.id, selectedLines);
    setBusy(false);
    if (!response.ok || !response.database) {
      onStatus(response.error ?? 'Script lines could not be imported.', true);
      return;
    }
    onImported(response.database);
    setLines([]);
    setSelected(new Set());
    onStatus(`Imported ${response.imported ?? 0} new script lines into the reading overlay.`);
  };

  return (
    <details className="visual-novel-script-import">
      <summary>Script extraction</summary>
      <div className="visual-novel-script-actions">
        <button type="button" disabled={busy} onClick={() => void chooseScripts()}>
          {busy ? 'Working…' : 'Choose scripts'}
        </button>
        {lines.length > 0 && (
          <>
            <button type="button" disabled={busy || !selectedLines.length} onClick={() => void importLines()}>
              Import selected ({selectedLines.length})
            </button>
            <button type="button" disabled={busy} onClick={() => {
              setLines([]);
              setSelected(new Set());
            }}>Clear preview</button>
          </>
        )}
      </div>
      {lines.length > 0 && (
        <div className="visual-novel-script-preview">
          {lines.slice(0, 200).map((line) => (
            <label key={line.id}>
              <input
                type="checkbox"
                checked={selected.has(line.id)}
                onChange={(event) => setSelected((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(line.id);
                  else next.delete(line.id);
                  return next;
                })}
              />
              <span>
                <small>{line.fileName}:{line.lineNumber} · {line.speaker || line.kind}</small>
                {line.japanese}
              </span>
            </label>
          ))}
          {lines.length > 200 && <p className="muted">Showing the first 200 of {lines.length} extracted lines.</p>}
        </div>
      )}
    </details>
  );
}
