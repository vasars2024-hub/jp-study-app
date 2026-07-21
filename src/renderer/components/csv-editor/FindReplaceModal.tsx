import { useState } from 'react';
import { useT } from '../../i18n';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';

type Props = {
  columnHeaders: string[];
  onClose: () => void;
  onApply: (find: string, replace: string, columns: number[] | null, useRegex: boolean) => void;
};

export default function FindReplaceModal({ columnHeaders, onClose, onApply }: Props) {
  const { t } = useT();
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
    <Dialog
      open
      onClose={onClose}
      title={t('csv.find.title')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleApply} disabled={!find.trim()}>
            {t('csv.find.replaceAll')}
          </Button>
        </>
      }
    >
        <label className="csv-editor-field">
          <span>{t('csv.find.find')}</span>
          <input type="text" value={find} onChange={(e) => setFind(e.target.value)} autoFocus />
        </label>
        <label className="csv-editor-field">
          <span>{t('csv.find.replaceWith')}</span>
          <input type="text" value={replace} onChange={(e) => setReplace(e.target.value)} />
        </label>
        <label className="csv-editor-check">
          <input type="checkbox" checked={useRegex} onChange={(e) => setUseRegex(e.target.checked)} />
          {t('csv.find.useRegex')}
        </label>
        <fieldset className="csv-editor-fieldset">
          <legend>{t('csv.find.scope')}</legend>
          <label className="csv-editor-check">
            <input
              type="radio"
              name="fr-scope"
              checked={scope === 'all'}
              onChange={() => setScope('all')}
            />
            {t('csv.find.allColumns')}
          </label>
          <label className="csv-editor-check">
            <input
              type="radio"
              name="fr-scope"
              checked={scope === 'selected'}
              onChange={() => setScope('selected')}
            />
            {t('csv.find.selectedColumns')}
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
                {h || t('csv.columnN', { n: i + 1 })}
              </label>
            ))}
          </div>
        )}
    </Dialog>
  );
}
