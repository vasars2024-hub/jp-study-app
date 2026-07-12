import { useState } from 'react';

type Props = {
  columnHeaders: string[];
  onClose: () => void;
  onApply: (find: string, replace: string, columns: number[] | null, useRegex: boolean) => void;
};

export default function FindReplaceModal({ columnHeaders, onClose, onApply }: Props) {
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [selectedCols, setSelectedCols] = useState<Set<number>>(() => new Set());

  function toggleCol(col: number): void {
    setSelectedCols((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  }

  function handleApply(): void {
    if (!find.trim()) return;
    const cols = scope === 'all' ? null : [...selectedCols];
    onApply(find, replace, cols?.length ? cols : null, useRegex);
    onClose();
  }

  return (
    <div className="csv-editor-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="csv-editor-modal"
        role="dialog"
        aria-labelledby="csv-fr-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="csv-fr-title" className="csv-editor-modal-title">
          Find and replace
        </h3>
        <label className="csv-editor-field">
          <span>Find</span>
          <input type="text" value={find} onChange={(e) => setFind(e.target.value)} autoFocus />
        </label>
        <label className="csv-editor-field">
          <span>Replace with</span>
          <input type="text" value={replace} onChange={(e) => setReplace(e.target.value)} />
        </label>
        <label className="csv-editor-check">
          <input type="checkbox" checked={useRegex} onChange={(e) => setUseRegex(e.target.checked)} />
          Use regular expressions
        </label>
        <fieldset className="csv-editor-fieldset">
          <legend>Scope</legend>
          <label className="csv-editor-check">
            <input
              type="radio"
              name="fr-scope"
              checked={scope === 'all'}
              onChange={() => setScope('all')}
            />
            All columns
          </label>
          <label className="csv-editor-check">
            <input
              type="radio"
              name="fr-scope"
              checked={scope === 'selected'}
              onChange={() => setScope('selected')}
            />
            Selected columns
          </label>
        </fieldset>
        {scope === 'selected' && (
          <div className="csv-editor-col-picks">
            {columnHeaders.map((h, i) => (
              <label key={i} className="csv-editor-check">
                <input
                  type="checkbox"
                  checked={selectedCols.has(i)}
                  onChange={() => toggleCol(i)}
                />
                {h || `Column ${i + 1}`}
              </label>
            ))}
          </div>
        )}
        <div className="csv-editor-modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={handleApply} disabled={!find.trim()}>
            Replace all
          </button>
        </div>
      </div>
    </div>
  );
}
