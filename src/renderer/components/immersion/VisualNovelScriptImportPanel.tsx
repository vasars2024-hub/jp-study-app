import { useMemo, useState } from 'react';
import { useT } from '../../i18n';
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
  const { t } = useT();
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
      onStatus(response.error ?? t('vnScript.msg.extractFailed'), true);
      return;
    }
    const next = response.lines ?? [];
    setLines(next);
    setSelected(new Set(next.map((line) => line.id)));
    onStatus(next.length
      ? t('vnScript.msg.extracted', { count: next.length })
      : t('vnScript.msg.noneFound'));
  };

  const importLines = async (): Promise<void> => {
    if (!selectedLines.length) return;
    setBusy(true);
    const response = await window.api.visualNovelImportScriptLines(entry.id, selectedLines);
    setBusy(false);
    if (!response.ok || !response.database) {
      onStatus(response.error ?? t('vnScript.msg.importFailed'), true);
      return;
    }
    onImported(response.database);
    setLines([]);
    setSelected(new Set());
    onStatus(t('vnScript.msg.imported', { count: response.imported ?? 0 }));
  };

  return (
    <details className="visual-novel-script-import">
      <summary>{t('vnScript.head')}</summary>
      <div className="visual-novel-script-actions">
        <button className="btn small" type="button" disabled={busy} onClick={() => void chooseScripts()}>
          {busy ? t('vnScript.working') : t('vnScript.chooseScripts')}
        </button>
        {lines.length > 0 && (
          <>
            <button className="btn small" type="button" disabled={busy || !selectedLines.length} onClick={() => void importLines()}>
              {t('vnScript.importSelected', { count: selectedLines.length })}
            </button>
            <button className="btn small" type="button" disabled={busy} onClick={() => {
              setLines([]);
              setSelected(new Set());
            }}>{t('vnScript.clearPreview')}</button>
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
          {lines.length > 200 && <p className="muted">{t('vnScript.truncated', { total: lines.length })}</p>}
        </div>
      )}
    </details>
  );
}
